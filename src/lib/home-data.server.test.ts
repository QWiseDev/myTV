import {
  clearServerHomeDataMemoryCache,
  getServerHomeData,
  getServerInitialHomeData,
} from './home-data.server';

const mockGetCache = jest.fn();
const mockSetCache = jest.fn();
const mockFetchDoubanData = jest.fn();

jest.mock('@/lib/db', () => ({
  db: {
    getCache: (...args: unknown[]) => mockGetCache(...args),
    setCache: (...args: unknown[]) => mockSetCache(...args),
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

const bangumiDay = {
  weekday: { en: 'Mon', cn: '周一', ja: '月' },
  items: [],
};

const partialHomeData = {
  hotMovies: [movieItem],
  hotTvShows: [],
  hotVarietyShows: [],
  bangumiCalendarData: [],
};

const completeHomeData = {
  hotMovies: [movieItem],
  hotTvShows: [{ ...movieItem, id: 'tv1', title: '剧集' }],
  hotVarietyShows: [{ ...movieItem, id: 'show1', title: '综艺' }],
  bangumiCalendarData: [bangumiDay],
};

function createDoubanResponse() {
  return {
    items: [
      {
        id: 'm1',
        title: '电影',
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
  const originalFetch = global.fetch;

  beforeEach(() => {
    clearServerHomeDataMemoryCache();
    mockGetCache.mockReset();
    mockSetCache.mockReset();
    mockFetchDoubanData.mockReset();
    mockSetCache.mockResolvedValue(undefined);
    mockFetchDoubanData.mockResolvedValue(createDoubanResponse());
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [bangumiDay],
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    jest.useRealTimers();
    global.fetch = originalFetch;
  });

  it('returns complete database cache to initial and full readers', async () => {
    mockGetCache.mockResolvedValue(completeHomeData);

    const initial = await getServerInitialHomeData();
    const full = await getServerHomeData();

    expect(initial).toEqual(completeHomeData);
    expect(full).toEqual(completeHomeData);
    expect(mockGetCache).toHaveBeenCalledTimes(1);
    expect(mockFetchDoubanData).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('loads only critical movies for a cold initial request', async () => {
    mockGetCache.mockResolvedValue(null);

    const first = await getServerInitialHomeData();
    const second = await getServerInitialHomeData();

    expect(first).toEqual(partialHomeData);
    expect(second).toEqual(partialHomeData);
    expect(mockGetCache).toHaveBeenCalledTimes(1);
    expect(mockFetchDoubanData).toHaveBeenCalledTimes(1);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(mockSetCache).not.toHaveBeenCalled();
  });

  it('falls back to critical movies when initial database lookup exceeds its deadline', async () => {
    jest.useFakeTimers();
    mockGetCache.mockReturnValue(new Promise(() => undefined));

    const pending = getServerInitialHomeData();
    await Promise.resolve();

    expect(mockFetchDoubanData).not.toHaveBeenCalled();

    jest.advanceTimersByTime(500);
    const data = await pending;

    expect(data).toEqual(partialHomeData);
    expect(mockFetchDoubanData).toHaveBeenCalledTimes(1);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('reuses initial critical movies when loading the full aggregate', async () => {
    mockGetCache.mockResolvedValue(null);

    const initial = await getServerInitialHomeData();
    const full = await getServerHomeData();

    expect(initial.hotMovies).toHaveLength(1);
    expect(full.hotMovies).toHaveLength(1);
    expect(full.hotTvShows).toHaveLength(1);
    expect(full.hotVarietyShows).toHaveLength(1);
    expect(full.bangumiCalendarData).toHaveLength(1);
    expect(mockGetCache).toHaveBeenCalledTimes(1);
    // initial 一次电影；full 只补 TV/综艺，不能重复拉电影
    expect(mockFetchDoubanData).toHaveBeenCalledTimes(3);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(mockSetCache).toHaveBeenCalledTimes(1);
  });

  it('shares the critical movie request between concurrent initial and full readers', async () => {
    mockGetCache.mockResolvedValue(null);

    const [initial, full] = await Promise.all([
      getServerInitialHomeData(),
      getServerHomeData(),
    ]);

    expect(initial.hotMovies).toHaveLength(1);
    expect(full.hotMovies).toHaveLength(1);
    expect(mockGetCache).toHaveBeenCalledTimes(2);
    expect(mockFetchDoubanData).toHaveBeenCalledTimes(3);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('returns initial movies without waiting for a delayed Bangumi response', async () => {
    mockGetCache.mockResolvedValue(null);
    const delayedBangumi = createDeferred<{
      ok: boolean;
      json: () => Promise<(typeof bangumiDay)[]>;
    }>();
    global.fetch = jest
      .fn()
      .mockReturnValue(delayedBangumi.promise) as unknown as typeof fetch;
    let fullSettled = false;

    const initialPromise = getServerInitialHomeData();
    const fullPromise = getServerHomeData().finally(() => {
      fullSettled = true;
    });

    const initial = await initialPromise;

    expect(initial).toEqual(partialHomeData);
    expect(fullSettled).toBe(false);

    delayedBangumi.resolve({
      ok: true,
      json: async () => [bangumiDay],
    });

    const full = await fullPromise;
    expect(full.bangumiCalendarData).toHaveLength(1);
  });

  it('prefers a newer full memory result over a delayed initial database result', async () => {
    const delayedInitialCache = createDeferred<typeof completeHomeData>();
    mockGetCache
      .mockReturnValueOnce(delayedInitialCache.promise)
      .mockResolvedValueOnce(null);

    const initialPromise = getServerInitialHomeData();
    await Promise.resolve();

    const full = await getServerHomeData();
    delayedInitialCache.resolve({
      ...completeHomeData,
      hotMovies: [{ ...movieItem, title: '旧缓存电影' }],
    });

    const initial = await initialPromise;

    expect(initial).toEqual(full);
    expect(initial.hotMovies[0].title).toBe('电影');
  });

  it('returns concurrent complete memory when a fresh full request is partial', async () => {
    const delayedMovies =
      createDeferred<ReturnType<typeof createDoubanResponse>>();
    mockGetCache
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(completeHomeData);
    mockFetchDoubanData
      .mockReturnValueOnce(delayedMovies.promise)
      .mockResolvedValue({ items: [] });
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    }) as unknown as typeof fetch;

    const fullPromise = getServerHomeData();
    await Promise.resolve();
    await Promise.resolve();

    const initial = await getServerInitialHomeData();
    delayedMovies.resolve(createDoubanResponse());
    const full = await fullPromise;

    expect(initial).toEqual(completeHomeData);
    expect(full).toEqual(completeHomeData);
  });

  it('merges concurrent full requests and writes complete data once', async () => {
    mockGetCache.mockResolvedValue(null);

    const [first, second] = await Promise.all([
      getServerHomeData(),
      getServerHomeData(),
    ]);

    expect(first.hotMovies).toHaveLength(1);
    expect(second).toEqual(first);
    expect(mockGetCache).toHaveBeenCalledTimes(1);
    expect(mockFetchDoubanData).toHaveBeenCalledTimes(3);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(mockSetCache).toHaveBeenCalledTimes(1);
    expect(mockSetCache).toHaveBeenCalledWith('home:aggregate-v1', first, 300);
  });

  it('rejects partial database cache and replaces it with a complete aggregate', async () => {
    mockGetCache.mockResolvedValue(partialHomeData);

    const data = await getServerHomeData();

    expect(data.hotMovies).toHaveLength(1);
    expect(data.hotTvShows).toHaveLength(1);
    expect(data.hotVarietyShows).toHaveLength(1);
    expect(data.bangumiCalendarData).toHaveLength(1);
    expect(mockFetchDoubanData).toHaveBeenCalledTimes(3);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(mockSetCache).toHaveBeenCalledTimes(1);
  });

  it('does not cache a partial fresh aggregate', async () => {
    mockGetCache.mockResolvedValue(null);
    mockFetchDoubanData
      .mockResolvedValueOnce(createDoubanResponse())
      .mockResolvedValue({ items: [] });
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    }) as unknown as typeof fetch;

    const first = await getServerHomeData();
    const second = await getServerHomeData();

    expect(first).toEqual(partialHomeData);
    expect(second).toEqual(partialHomeData);
    expect(mockGetCache).toHaveBeenCalledTimes(1);
    // 电影进入独立 critical 缓存；两轮 full 各重试 TV/综艺
    expect(mockFetchDoubanData).toHaveBeenCalledTimes(5);
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(mockSetCache).not.toHaveBeenCalled();
  });

  it('starts the full aggregate when database lookup exceeds its deadline', async () => {
    jest.useFakeTimers();
    mockGetCache.mockReturnValue(new Promise(() => undefined));

    const pending = getServerHomeData();
    await Promise.resolve();

    expect(mockFetchDoubanData).not.toHaveBeenCalled();

    jest.advanceTimersByTime(500);
    const data = await pending;

    expect(data.hotMovies).toHaveLength(1);
    expect(data.hotTvShows).toHaveLength(1);
    expect(data.hotVarietyShows).toHaveLength(1);
    expect(data.bangumiCalendarData).toHaveLength(1);
    expect(mockFetchDoubanData).toHaveBeenCalledTimes(3);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
