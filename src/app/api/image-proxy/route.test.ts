/**
 * @jest-environment node
 */

const edgePrimitives = jest.requireActual(
  'next/dist/compiled/@edge-runtime/primitives'
) as {
  fetch: typeof fetch;
  Headers: typeof Headers;
  Request: typeof Request;
  Response: typeof Response;
};

describe('/api/image-proxy', () => {
  let GET: typeof import('./route').GET;
  let originalFetch: typeof global.fetch;

  beforeAll(async () => {
    global.fetch = edgePrimitives.fetch;
    global.Headers = edgePrimitives.Headers;
    global.Request = edgePrimitives.Request;
    global.Response = edgePrimitives.Response;
    originalFetch = global.fetch;
    ({ GET } = await import('./route'));
  });

  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('proxies allowed bangumi images', async () => {
    const imageUrl = 'http://lain.bgm.tv/pic/cover/l/27/ff/377130_wDU1x.jpg';
    (global.fetch as jest.Mock).mockResolvedValue(
      new Response('image', {
        headers: {
          'content-type': 'image/jpeg',
        },
      })
    );

    const response = await GET(
      new Request(
        `http://localhost/api/image-proxy?url=${encodeURIComponent(imageUrl)}`
      )
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/jpeg');
    expect(global.fetch).toHaveBeenCalledWith(
      imageUrl,
      expect.objectContaining({
        headers: expect.objectContaining({
          Referer: 'https://movie.douban.com/',
        }),
      })
    );
  });

  it('rejects unsupported image hosts before fetching', async () => {
    const response = await GET(
      new Request(
        `http://localhost/api/image-proxy?url=${encodeURIComponent(
          'https://example.com/a.jpg'
        )}`
      )
    );

    expect(response.status).toBe(403);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
