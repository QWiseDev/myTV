/**
 * @jest-environment node
 */

const edgePrimitives = jest.requireActual(
  'next/dist/compiled/@edge-runtime/primitives',
) as {
  fetch: typeof fetch;
  Headers: typeof Headers;
  Request: typeof Request;
  Response: typeof Response;
  ReadableStream: typeof ReadableStream;
};

describe('/api/image-proxy', () => {
  const imageProxyMaxConcurrentRequests = 12;

  let GET: typeof import('./route').GET;
  let originalFetch: typeof global.fetch;

  beforeAll(async () => {
    global.fetch = edgePrimitives.fetch;
    global.Headers = edgePrimitives.Headers;
    global.Request = edgePrimitives.Request;
    global.Response = edgePrimitives.Response;
    global.ReadableStream = edgePrimitives.ReadableStream;
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
      }),
    );

    const response = await GET(
      new Request(
        `http://localhost/api/image-proxy?url=${encodeURIComponent(imageUrl)}`,
      ),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/jpeg');
    await expect(response.text()).resolves.toBe('image');
    expect(global.fetch).toHaveBeenCalledWith(
      imageUrl,
      expect.objectContaining({
        headers: expect.objectContaining({
          Referer: 'https://movie.douban.com/',
        }),
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it('rejects unsupported image hosts before fetching', async () => {
    const response = await GET(
      new Request(
        `http://localhost/api/image-proxy?url=${encodeURIComponent(
          'https://example.com/a.jpg',
        )}`,
      ),
    );

    expect(response.status).toBe(403);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('returns 504 when upstream image fetch times out', async () => {
    const imageUrl = 'http://lain.bgm.tv/pic/cover/l/27/ff/377130_wDU1x.jpg';
    const timeoutError = new Error('Timeout');
    timeoutError.name = 'TimeoutError';
    (global.fetch as jest.Mock).mockRejectedValue(timeoutError);

    const response = await GET(
      new Request(
        `http://localhost/api/image-proxy?url=${encodeURIComponent(imageUrl)}`,
      ),
    );

    expect(response.status).toBe(504);
    await expect(response.json()).resolves.toEqual({
      error: 'Image fetch timeout',
    });
  });

  it('rejects new image requests when the proxy is busy', async () => {
    const imageUrl = 'http://lain.bgm.tv/pic/cover/l/27/ff/377130_wDU1x.jpg';
    const pendingResponses: Array<() => void> = [];
    (global.fetch as jest.Mock).mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          pendingResponses.push(() => resolve(new Response('image')));
        }),
    );

    const requests = Array.from(
      { length: imageProxyMaxConcurrentRequests },
      () =>
        GET(
          new Request(
            `http://localhost/api/image-proxy?url=${encodeURIComponent(
              imageUrl,
            )}`,
          ),
        ),
    );

    await Promise.resolve();
    expect(global.fetch).toHaveBeenCalledTimes(imageProxyMaxConcurrentRequests);

    const busyResponse = await GET(
      new Request(
        `http://localhost/api/image-proxy?url=${encodeURIComponent(imageUrl)}`,
      ),
    );

    expect(busyResponse.status).toBe(503);
    expect(busyResponse.headers.get('retry-after')).toBe('5');
    await expect(busyResponse.json()).resolves.toEqual({
      error: 'Image proxy is busy',
    });

    pendingResponses.forEach((resolve) => resolve());
    const responses = await Promise.all(requests);
    await Promise.all(responses.map((response) => response.text()));
  });
});

export {};
