import {
  clearServerHomeDataMemoryCache,
  getServerHomeData,
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

const cachedHomeData = {
  hotMovies: [movieItem],
  hotTvShows: [],
  hotVarietyShows: [],
  bangumiCalendarData: [],
};

describe('getServerHomeData', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    clearServerHomeDataMemoryCache();
    mockGetCache.mockReset();
    mockSetCache.mockReset();
    mockFetchDoubanData.mockReset();
    mockSetCache.mockResolvedValue(undefined);
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('returns database cache and skips upstream fetch', async () => {
    mockGetCache.mockResolvedValue(cachedHomeData);

    const first = await getServerHomeData();
    const second = await getServerHomeData();

    expect(first).toEqual(cachedHomeData);
    expect(second).toEqual(cachedHomeData);
    expect(mockGetCache).toHaveBeenCalledTimes(1);
    expect(mockFetchDoubanData).not.toHaveBeenCalled();
  });

  it('fetches upstream once under concurrent calls and writes cache', async () => {
    mockGetCache.mockResolvedValue(null);
    mockFetchDoubanData.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
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
    });

    const [a, b] = await Promise.all([
      getServerHomeData(),
      getServerHomeData(),
    ]);

    expect(a.hotMovies).toHaveLength(1);
    expect(b.hotMovies).toHaveLength(1);
    // 三个豆瓣分类各一次；并发合并后不应翻倍
    expect(mockFetchDoubanData).toHaveBeenCalledTimes(3);
    expect(mockSetCache).toHaveBeenCalled();
  });
});
