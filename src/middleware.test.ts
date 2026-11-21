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
};

describe('middleware', () => {
  let NextRequest: typeof import('next/server').NextRequest;
  let middleware: typeof import('./middleware').middleware;
  let consoleLogSpy: jest.SpyInstance;

  beforeAll(async () => {
    global.fetch = edgePrimitives.fetch;
    global.Headers = edgePrimitives.Headers;
    global.Request = edgePrimitives.Request;
    global.Response = edgePrimitives.Response;
    ({ NextRequest } = await import('next/server'));
    ({ middleware } = await import('./middleware'));
  });

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {
      return undefined;
    });
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  it('allows unauthenticated image proxy requests', async () => {
    const request = new NextRequest(
      'http://localhost/api/image-proxy?url=http%3A%2F%2Flain.bgm.tv%2Fpic%2Fcover%2Fl%2F27%2Fff%2F377130_wDU1x.jpg',
    );

    const response = await middleware(request);

    expect(response.status).toBe(200);
    expect(response.headers.get('x-middleware-next')).toBe('1');
  });

  it('rejects unauthenticated image optimizer requests with 401', async () => {
    const previousPassword = process.env.PASSWORD;
    process.env.PASSWORD = 'test-password';

    try {
      // 图片优化器会让源站抓取任意外链，未登录不得使用
      const request = new NextRequest(
        'http://localhost/_next/image?url=https%3A%2F%2Fexample.com%2Fa.jpg&w=640&q=75',
      );

      const response = await middleware(request);

      expect(response.status).toBe(401);
    } finally {
      if (previousPassword === undefined) {
        delete process.env.PASSWORD;
      } else {
        process.env.PASSWORD = previousPassword;
      }
    }
  });
});

export {};
