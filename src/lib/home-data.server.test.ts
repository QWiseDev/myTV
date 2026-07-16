import { DATA_FETCH_TIMEOUTS } from '@/lib/constants/home';

import {
  clearServerHomeDataMemoryCache,
  getServerInitialHomeData,
} from './home-data.server';

const mockFetchDoubanData = jest.fn();

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

describe('home data server cache', () => {
  beforeEach(() => {
    clearServerHomeDataMemoryCache();
    mockFetchDoubanData.mockReset();
    mockFetchDoubanData.mockResolvedValue(createDoubanResponse());
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

    expect(mockFetchDoubanData).toHaveBeenCalledTimes(1);
    deferred.resolve(createDoubanResponse());

    const [first, second] = await Promise.all([firstPromise, secondPromise]);
    expect(second).toEqual(first);
  });

  it('does not cache an empty failed critical result', async () => {
    mockFetchDoubanData
      .mockRejectedValueOnce(new Error('upstream failed'))
      .mockResolvedValueOnce(createDoubanResponse());

    const failed = await getServerInitialHomeData();
    const retried = await getServerInitialHomeData();

    expect(failed.hotMovies).toEqual([]);
    expect(retried).toEqual(partialHomeData);
    expect(mockFetchDoubanData).toHaveBeenCalledTimes(2);
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
    await Promise.resolve();
    jest.advanceTimersByTime(DATA_FETCH_TIMEOUTS.CRITICAL);

    await expect(pending).resolves.toEqual({
      hotMovies: [],
      hotTvShows: [],
      hotVarietyShows: [],
      bangumiCalendarData: [],
    });
    expect(requestSignal?.aborted).toBe(true);
  });

  it('does not let an older request repopulate a cleared cache', async () => {
    const older = createDeferred<ReturnType<typeof createDoubanResponse>>();
    const newer = createDeferred<ReturnType<typeof createDoubanResponse>>();
    mockFetchDoubanData
      .mockReturnValueOnce(older.promise)
      .mockReturnValueOnce(newer.promise);

    const olderRequest = getServerInitialHomeData();
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
