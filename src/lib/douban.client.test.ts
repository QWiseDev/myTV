const mockCacheGet = jest.fn();
const mockCacheSet = jest.fn();
const mockGetBestDataProxySync = jest.fn();

jest.mock('./client-cache', () => ({
  ClientCache: {
    get: mockCacheGet,
    set: mockCacheSet,
  },
}));

jest.mock('./douban-proxy-detector', () => ({
  getBestDataProxySync: mockGetBestDataProxySync,
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
});

export {};
