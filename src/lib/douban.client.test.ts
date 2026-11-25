const mockCacheGet = jest.fn();
const mockCacheSet = jest.fn();
const mockGetBestDataProxySync = jest.fn();
const mockMarkDataProxyFailed = jest.fn();

jest.mock('./client-cache', () => ({
  ClientCache: {
    get: mockCacheGet,
    set: mockCacheSet,
  },
}));

jest.mock('./douban-proxy-detector', () => ({
  getBestDataProxySync: mockGetBestDataProxySync,
  markDataProxyFailed: mockMarkDataProxyFailed,
}));

let getDoubanCategories: typeof import('./douban.client').getDoubanCategories;

describe('getDoubanCategories abort propagation', () => {
  let originalFetch: typeof global.fetch;

  beforeAll(async () => {
    ({ getDoubanCategories } = await import('./douban.client'));
  });

  beforeEach(() => {
    originalFetch = global.fetch;
    global.fetch = jest.fn();
    localStorage.clear();
    mockCacheGet.mockReset().mockResolvedValue(null);
    mockCacheSet.mockReset().mockResolvedValue(undefined);
    mockGetBestDataProxySync.mockReset().mockReturnValue('direct');
    mockMarkDataProxyFailed.mockReset();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('passes the caller signal to the server API request', async () => {
    const controller = new AbortController();
    const result = { code: 200, message: '获取成功', list: [] };
    (global.fetch as jest.Mock).mockResolvedValue({
      json: jest.fn().mockResolvedValue(result),
    });

    await expect(
      getDoubanCategories(
        { kind: 'movie', category: '热门', type: '全部' },
        controller.signal,
      ),
    ).resolves.toEqual(result);

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/douban/categories?kind=movie&category=热门&type=全部&limit=20&start=0',
      { signal: controller.signal },
    );
  });

  it('aborts a proxy request and skips its cache write', async () => {
    mockGetBestDataProxySync.mockReturnValue('cors-proxy-zwei');
    const controller = new AbortController();
    let requestSignal: AbortSignal | undefined;
    (global.fetch as jest.Mock).mockImplementation(
      (_url: string, options?: RequestInit) => {
        requestSignal = options?.signal as AbortSignal | undefined;
        return new Promise<Response>(() => undefined);
      },
    );

    const result = getDoubanCategories(
      { kind: 'movie', category: '热门', type: '全部' },
      controller.signal,
    );
    const rejection = expect(result).rejects.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 0));

    controller.abort();

    await rejection;
    expect(requestSignal?.aborted).toBe(true);
    expect(mockCacheSet).not.toHaveBeenCalled();
  });

  it('prefers valid localStorage cache without querying /api/cache', async () => {
    const cachedResult = {
      code: 200,
      message: '获取成功',
      list: [
        { id: '1', title: '缓存片', poster: '', rate: '8.1', year: '2026' },
      ],
    };
    localStorage.setItem(
      'douban-categories-category=热门&kind=movie&pageLimit=20&pageStart=0&type=全部',
      JSON.stringify({
        data: cachedResult,
        expire: Date.now() + 60_000,
      }),
    );

    await expect(
      getDoubanCategories({ kind: 'movie', category: '热门', type: '全部' }),
    ).resolves.toEqual(cachedResult);

    expect(mockCacheGet).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('respects explicit doubanDataSource in localStorage over detector', async () => {
    localStorage.setItem('doubanDataSource', 'direct');
    mockGetBestDataProxySync.mockReturnValue('cmliussss-cdn-ali');
    const result = { code: 200, message: '获取成功', list: [] };
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue(result),
    });

    await expect(
      getDoubanCategories({ kind: 'tv', category: 'tv', type: 'tv' }),
    ).resolves.toEqual(result);

    expect(mockGetBestDataProxySync).not.toHaveBeenCalled();
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/douban/categories?kind=tv&category=tv&type=tv&limit=20&start=0',
      { signal: undefined },
    );
  });

  it('marks failing CDN proxy failed and falls back to server API', async () => {
    mockGetBestDataProxySync.mockReturnValue('cmliussss-cdn-ali');
    const fallbackResult = { code: 200, message: '获取成功', list: [] };
    (global.fetch as jest.Mock)
      .mockRejectedValueOnce(new Error('CDN timeout'))
      .mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue(fallbackResult),
      });

    await expect(
      getDoubanCategories({ kind: 'tv', category: 'show', type: 'show' }),
    ).resolves.toEqual(fallbackResult);

    expect(mockMarkDataProxyFailed).toHaveBeenCalledWith('cmliussss-cdn-ali');
    expect(global.fetch).toHaveBeenLastCalledWith(
      '/api/douban/categories?kind=tv&category=show&type=show&limit=20&start=0',
      { signal: undefined },
    );
  });
});

export {};
