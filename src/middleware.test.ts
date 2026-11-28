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

  const withPassword = async (fn: () => Promise<void>): Promise<void> => {
    const previousPassword = process.env.PASSWORD;
    process.env.PASSWORD = 'test-password';
    try {
      await fn();
    } finally {
      if (previousPassword === undefined) {
        delete process.env.PASSWORD;
      } else {
        process.env.PASSWORD = previousPassword;
      }
    }
  };

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
    await withPassword(async () => {
      // 图片优化器会让源站抓取任意外链，未登录不得使用
      const request = new NextRequest(
        'http://localhost/_next/image?url=https%3A%2F%2Fexample.com%2Fa.jpg&w=640&q=75',
      );

      const response = await middleware(request);

      expect(response.status).toBe(401);
    });
  });

  // ---- 访客模式放行清单 ----

  it('allows unauthenticated access to guest pages (/, /play)', async () => {
    await withPassword(async () => {
      for (const path of ['/', '/play']) {
        const request = new NextRequest(`http://localhost${path}`);
        const response = await middleware(request);
        expect(response.status).toBe(200);
        expect(response.headers.get('x-middleware-next')).toBe('1');
      }
    });
  });

  it('allows unauthenticated access to guest playback APIs', async () => {
    await withPassword(async () => {
      const paths = [
        '/api/detail?source=iqiyizyapi.com&id=1',
        '/api/source-browser/list?source=iqiyizyapi.com&type_id=1&page=1',
        '/api/douban/details?id=123',
        '/api/douban/comments?id=123',
        '/api/danmaku',
        '/api/danmu-external',
        '/api/ad-filter',
      ];
      for (const path of paths) {
        const request = new NextRequest(`http://localhost${path}`);
        const response = await middleware(request);
        expect(response.status).toBe(200);
        expect(response.headers.get('x-middleware-next')).toBe('1');
      }
    });
  });

  it('still rejects unauthenticated requests to login-only APIs', async () => {
    await withPassword(async () => {
      const paths = [
        '/api/playrecords',
        '/api/favorites',
        '/api/sources',
        '/api/parse?url=https%3A%2F%2Fv.qq.com%2Fx%2Fpage%2Ftest.html',
        '/api/tvbox-config',
        '/api/tvbox/health',
      ];
      for (const path of paths) {
        const request = new NextRequest(`http://localhost${path}`);
        const response = await middleware(request);
        expect(response.status).toBe(401);
      }
    });
  });

  it('allows unauthenticated access to exact /api/tvbox and /api/feedback routes', async () => {
    await withPassword(async () => {
      for (const path of ['/api/tvbox', '/api/feedback']) {
        const request = new NextRequest(`http://localhost${path}`);
        const response = await middleware(request);
        expect(response.status).toBe(200);
        expect(response.headers.get('x-middleware-next')).toBe('1');
      }
    });
  });

  it('rejects expired signed auth cookies on protected routes', async () => {
    await withPassword(async () => {
      const { generateSignature } = await import('@/lib/auth');
      const expiredTimestamp = Date.now() - 8 * 24 * 60 * 60 * 1000;
      const signature = await generateSignature(
        `alice.${expiredTimestamp}`,
        'test-password',
      );
      const cookieValue = encodeURIComponent(
        JSON.stringify({
          username: 'alice',
          signature,
          timestamp: expiredTimestamp,
        }),
      );
      const request = new NextRequest('http://localhost/api/sources', {
        headers: {
          cookie: `user_auth=${cookieValue}`,
        },
      });
      const response = await middleware(request);
      expect(response.status).toBe(401);
      expect(response.cookies.get('user_auth')?.value).toBe('');
      expect(response.cookies.get('auth')?.value).toBe('');
    });
  });

  it('clears legacy or invalid auth cookies when serving guest pages', async () => {
    await withPassword(async () => {
      const { generateSignature } = await import('@/lib/auth');
      // 旧版仅按 username 签名的 cookie，服务端验签已拒绝
      const legacySignature = await generateSignature(
        'qiuwei',
        'test-password',
      );
      const legacyCookie = encodeURIComponent(
        JSON.stringify({
          username: 'qiuwei',
          role: 'owner',
          signature: legacySignature,
          timestamp: Date.now(),
        }),
      );

      for (const path of ['/', '/play']) {
        const request = new NextRequest(`http://localhost${path}`, {
          headers: { cookie: `user_auth=${legacyCookie}` },
        });
        const response = await middleware(request);
        expect(response.status).toBe(200);
        expect(response.headers.get('x-middleware-next')).toBe('1');
        expect(response.cookies.get('user_auth')?.value).toBe('');
        expect(response.cookies.get('auth')?.value).toBe('');
      }
    });
  });

  it('preserves valid auth cookies on guest pages and clears invalid cookies on page redirects', async () => {
    await withPassword(async () => {
      const { generateAuthCookie } = await import('@/lib/auth');
      const validCookie = await generateAuthCookie('alice', 'user');
      const validReq = new NextRequest('http://localhost/', {
        headers: { cookie: `user_auth=${encodeURIComponent(validCookie)}` },
      });
      const validRes = await middleware(validReq);
      expect(validRes.status).toBe(200);
      expect(validRes.cookies.get('user_auth')).toBeUndefined();

      const invalidReq = new NextRequest('http://localhost/source-browser', {
        headers: { cookie: 'user_auth=broken-cookie' },
      });
      const redirectRes = await middleware(invalidReq);
      expect(redirectRes.status).toBe(307);
      expect(redirectRes.headers.get('location')).toContain('/login?redirect=');
      expect(redirectRes.cookies.get('user_auth')?.value).toBe('');
      expect(redirectRes.cookies.get('auth')?.value).toBe('');
    });
  });
});

export {};
