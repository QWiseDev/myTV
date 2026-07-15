/**
 * @jest-environment node
 */

const mockFetchDoubanData = jest.fn();
const mockGetCacheTime = jest.fn();

jest.mock('@/lib/config', () => ({
  getCacheTime: mockGetCacheTime,
}));

jest.mock('@/lib/douban', () => ({
  fetchDoubanData: mockFetchDoubanData,
}));

const edgePrimitives = jest.requireActual(
  'next/dist/compiled/@edge-runtime/primitives',
) as {
  fetch: typeof fetch;
  Headers: typeof Headers;
  Request: typeof Request;
  Response: typeof Response;
};

describe('GET /api/douban/categories', () => {
  let GET: typeof import('./route').GET;

  beforeAll(async () => {
    global.fetch = edgePrimitives.fetch;
    global.Headers = edgePrimitives.Headers;
    global.Request = edgePrimitives.Request;
    global.Response = edgePrimitives.Response;
    ({ GET } = await import('./route'));
  });

  beforeEach(() => {
    mockFetchDoubanData.mockReset().mockResolvedValue({ items: [] });
    mockGetCacheTime.mockReset().mockResolvedValue(300);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('passes the incoming request signal to the Douban upstream', async () => {
    const request = new Request(
      'http://localhost/api/douban/categories?kind=movie&category=热门&type=全部',
    );

    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(mockFetchDoubanData).toHaveBeenCalledWith(
      expect.stringContaining('/subject/recent_hot/movie'),
      request.signal,
    );
  });
});

export {};
