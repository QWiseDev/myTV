import { DATA_FETCH_TIMEOUTS } from '@/lib/constants/home';

import {
  clearServerHomeDataMemoryCache,
  getServerInitialHomeData,
} from './home-data.server';

const mockFetchDoubanData = jest.fn();
const mockDbGetCache = jest.fn();
const mockDbSetCache = jest.fn();

jest.mock('@/lib/db', () => ({
  db: {
    getCache: (...args: unknown[]) => mockDbGetCache(...args),
    setCache: (...args: unknown[]) => mockDbSetCache(...args),
  },
}));

jest.mock('@/lib/douban', () => ({
  fetchDoubanData: (...args: unknown[]) => mockFetchDoubanData(...args),
}));

const movieItem = {
  id: 'm1',
  title: '电影',
  poster: 'https://img.example/m1.jpg',
  rate: '8.0',
  year: '2026',
};

const partialHomeData = {
  hotMovies: [movieItem],
  hotTvShows: [],
  hotVarietyShows: [],
  bangumiCalendarData: [],
};

function createDoubanResponse(title = '电影') {
  return {
    items: [
      {
        id: 'm1',
        title,
        pic: { normal: 'https://img.example/m1.jpg' },
        rating: { value: 8 },
        card_subtitle: '2026 / 中国大陆',
      },
    ],
  };
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

async function flushMicrotasks(ticks = 8) {
  for (let i = 0; i < ticks; i += 1) {
    await Promise.resolve();
  }
}

describe('home data server cache', () => {
  beforeEach(() => {
    clearServerHomeDataMemoryCache();
    mockFetchDoubanData.mockReset();
    mockFetchDoubanData.mockResolvedValue(createDoubanResponse());
    mockDbGetCache.mockReset().mockResolvedValue(null);
    mockDbSetCache.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('loads only critical movies for a cold initial request', async () => {
    const data = await getServerInitialHomeData();

    expect(data).toEqual(partialHomeData);
    expect(mockFetchDoubanData).toHaveBeenCalledTimes(1);
  });

  it('reuses critical movies from memory for sequential initial requests', async () => {
    const first = await getServerInitialHomeData();
    const second = await getServerInitialHomeData();

    expect(second).toEqual(first);
    expect(mockFetchDoubanData).toHaveBeenCalledTimes(1);
  });

  it('shares one critical request between concurrent initial readers', async () => {
    const deferred = createDeferred<ReturnType<typeof createDoubanResponse>>();
    mockFetchDoubanData.mockReturnValue(deferred.promise);

    const firstPromise = getServerInitialHomeData();
    const secondPromise = getServerInitialHomeData();

    await flushMicrotasks();
    expect(mockFetchDoubanData).toHaveBeenCalledTimes(1);
    deferred.resolve(createDoubanResponse());

    const [first, second] = await Promise.all([firstPromise, secondPromise]);
    expect(second).toEqual(first);
  });

  it('skips upstream during the failure cooldown and retries afterwards', async () => {
    mockFetchDoubanData
      .mockRejectedValueOnce(new Error('upstream failed'))
      .mockResolvedValueOnce(createDoubanResponse());
    const startedAt = Date.now();
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(startedAt);

    try {
      const failed = await getServerInitialHomeData();
      // 冷却期内不再请求上游，直接返回空数据交给客户端补载
      const coolingDown = await getServerInitialHomeData();

      expect(failed.hotMovies).toEqual([]);
      expect(coolingDown.hotMovies).toEqual([]);
      expect(mockFetchDoubanData).toHaveBeenCalledTimes(1);

      // 冷却期结束后恢复请求，失败结果不会被当作数据缓存
      nowSpy.mockReturnValue(startedAt + 60_000);
      const retried = await getServerInitialHomeData();

      expect(retried).toEqual(partialHomeData);
      expect(mockFetchDoubanData).toHaveBeenCalledTimes(2);
    } finally {
      nowSpy.mockRestore();
    }
  });

  it('aborts a critical request after its deadline', async () => {
    jest.useFakeTimers();
    let requestSignal: AbortSignal | undefined;
    mockFetchDoubanData.mockImplementation(
      (_target: unknown, signal?: AbortSignal) => {
        requestSignal = signal;
        return new Promise((_, reject) => {
          signal?.addEventListener(
            'abort',
            () => reject(new Error('aborted')),
            { once: true },
          );
        });
      },
    );

    const pending = getServerInitialHomeData();
    await flushMicrotasks();
    jest.advanceTimersByTime(DATA_FETCH_TIMEOUTS.CRITICAL);

    await expect(pending).resolves.toEqual({
      hotMovies: [],
      hotTvShows: [],
      hotVarietyShows: [],
      bangumiCalendarData: [],
    });
    expect(requestSignal?.aborted).toBe(true);
  });

  it('returns fresh DB cached movies without calling upstream', async () => {
    mockDbGetCache.mockResolvedValueOnce({
      data: [movieItem],
      freshUntil: Date.now() + 60_000,
    });

    const data = await getServerInitialHomeData();

    expect(data).toEqual(partialHomeData);
    expect(mockDbGetCache).toHaveBeenCalledTimes(1);
    expect(mockFetchDoubanData).not.toHaveBeenCalled();
  });

  it('returns stale DB cached movies immediately and refreshes in background', async () => {
    mockDbGetCache.mockResolvedValueOnce({
      data: [movieItem],
      freshUntil: Date.now() - 1000,
    });
    mockFetchDoubanData.mockResolvedValueOnce(
      createDoubanResponse('后台新电影'),
    );

    const data = await getServerInitialHomeData();
    expect(data).toEqual(partialHomeData);
    expect(mockFetchDoubanData).toHaveBeenCalledTimes(1);

    await Promise.resolve();
    await Promise.resolve();
    clearServerHomeDataMemoryCache();
  });

  it('does not let an older request repopulate a cleared cache', async () => {
    const older = createDeferred<ReturnType<typeof createDoubanResponse>>();
    const newer = createDeferred<ReturnType<typeof createDoubanResponse>>();
    mockFetchDoubanData
      .mockReturnValueOnce(older.promise)
      .mockReturnValueOnce(newer.promise);

    const olderRequest = getServerInitialHomeData();
    await flushMicrotasks();
    clearServerHomeDataMemoryCache();
    const newerRequest = getServerInitialHomeData();

    newer.resolve(createDoubanResponse('新缓存电影'));
    const newerData = await newerRequest;
    older.resolve(createDoubanResponse('旧请求电影'));
    await olderRequest;

    const cached = await getServerInitialHomeData();
    expect(cached).toEqual(newerData);
    expect(cached.hotMovies[0].title).toBe('新缓存电影');
    expect(mockFetchDoubanData).toHaveBeenCalledTimes(2);
  });
});
