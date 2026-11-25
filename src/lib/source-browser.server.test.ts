/**
 * @jest-environment node
 */

const mockDbGetCache = jest.fn();
const mockDbSetCache = jest.fn();

jest.mock('@/lib/db', () => ({
  db: {
    getCache: (...args: unknown[]) => mockDbGetCache(...args),
    setCache: (...args: unknown[]) => mockDbSetCache(...args),
  },
}));

describe('source-browser.server cache', () => {
  let fetchSourceCategories: typeof import('./source-browser.server').fetchSourceCategories;
  let fetchSourceVideoList: typeof import('./source-browser.server').fetchSourceVideoList;
  let originalFetch: typeof global.fetch;

  const sampleSource = {
    key: 'test-site',
    name: '测试源',
    api: 'https://source.example/api.php/provide/vod/',
  };

  beforeAll(async () => {
    originalFetch = global.fetch;
    ({ fetchSourceCategories, fetchSourceVideoList } =
      await import('./source-browser.server'));
  });

  beforeEach(() => {
    global.fetch = jest.fn();
    mockDbGetCache.mockReset().mockResolvedValue(null);
    mockDbSetCache.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('caches source categories in memory across repeated requests', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        class: [{ type_id: 1, type_name: '电影' }],
      }),
    });

    const first = await fetchSourceCategories(sampleSource);
    const second = await fetchSourceCategories(sampleSource);

    expect(first).toEqual([{ type_id: 1, type_name: '电影' }]);
    expect(second).toEqual(first);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('returns cached video list from DB without hitting upstream', async () => {
    const dbCachedList = {
      items: [
        {
          id: 'v1',
          title: '缓存影片',
          poster: 'https://img.example/1.jpg',
          year: '2026',
          type_name: '电影',
          remarks: 'HD',
        },
      ],
      meta: { page: 1, pagecount: 2, total: 1, limit: 20 },
    };
    mockDbGetCache.mockResolvedValueOnce(dbCachedList);

    const result = await fetchSourceVideoList(sampleSource, '1', 1);

    expect(result).toEqual(dbCachedList);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

export {};
