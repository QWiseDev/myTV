/**
 * @jest-environment node
 */

const mockGetConfig = jest.fn();
const mockSetSkipConfig = jest.fn();
const mockGetAllSkipConfigs = jest.fn();
const mockGetCache = jest.fn();
const mockSetCache = jest.fn();
const mockClearAllData = jest.fn();
const mockSaveAdminConfig = jest.fn();
const mockSetUserPasswordRaw = jest.fn();
const mockSetPlayRecordByKey = jest.fn();
const mockSetFavoriteByKey = jest.fn();
const mockConfigSelfCheck = jest.fn(async (cfg: unknown) => ({
  ...(cfg as Record<string, unknown>),
  selfChecked: true,
}));
const mockSetCachedConfig = jest.fn(async () => undefined);
const mockResolveAndValidateRemoteUrl = jest.fn(
  async (rawUrl: string) => new URL(rawUrl),
);
const mockSafeFetch = jest.fn();

jest.mock('@/lib/config', () => ({
  getConfig: mockGetConfig,
  configSelfCheck: mockConfigSelfCheck,
  setCachedConfig: mockSetCachedConfig,
}));

jest.mock('@/lib/db', () => ({
  db: {
    setSkipConfig: mockSetSkipConfig,
    getAllSkipConfigs: mockGetAllSkipConfigs,
    getCache: mockGetCache,
    setCache: mockSetCache,
    clearExpiredCache: jest.fn(),
    deleteCache: jest.fn(),
    clearAllData: mockClearAllData,
    saveAdminConfig: mockSaveAdminConfig,
    setUserPasswordRaw: mockSetUserPasswordRaw,
    setPlayRecordByKey: mockSetPlayRecordByKey,
    setFavoriteByKey: mockSetFavoriteByKey,
    addSearchHistory: jest.fn(),
  },
}));

jest.mock('@/lib/url-safety', () => {
  const actual = jest.requireActual('@/lib/url-safety');
  return {
    ...actual,
    resolveAndValidateRemoteUrl: mockResolveAndValidateRemoteUrl,
    safeFetch: mockSafeFetch,
  };
});

const edgePrimitives = jest.requireActual(
  'next/dist/compiled/@edge-runtime/primitives',
) as {
  fetch: typeof fetch;
  Headers: typeof Headers;
  Request: typeof Request;
  Response: typeof Response;
};

describe('API security and bug regression suite', () => {
  let NextRequest: typeof import('next/server').NextRequest;
  let generateAuthCookie: typeof import('@/lib/auth').generateAuthCookie;
  let skipGET: typeof import('./skipconfigs/route').GET;
  let skipPOST: typeof import('./skipconfigs/route').POST;
  let parseGET: typeof import('./parse/route').GET;
  let cacheGET: typeof import('./cache/route').GET;
  let cachePOST: typeof import('./cache/route').POST;
  let m3u8GET: typeof import('./proxy/m3u8/route').GET;
  let importPOST: typeof import('./admin/data_migration/import/route').POST;

  const prevPassword = process.env.PASSWORD;
  const prevUsername = process.env.USERNAME;

  beforeAll(async () => {
    global.fetch = edgePrimitives.fetch;
    global.Headers = edgePrimitives.Headers;
    global.Request = edgePrimitives.Request;
    global.Response = edgePrimitives.Response;
    ({ NextRequest } = await import('next/server'));
    ({ generateAuthCookie } = await import('@/lib/auth'));
    ({ GET: skipGET, POST: skipPOST } = await import('./skipconfigs/route'));
    ({ GET: parseGET } = await import('./parse/route'));
    ({ GET: cacheGET, POST: cachePOST } = await import('./cache/route'));
    ({ GET: m3u8GET } = await import('./proxy/m3u8/route'));
    ({ POST: importPOST } =
      await import('./admin/data_migration/import/route'));
  });

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.PASSWORD = 'regression-secret';
    process.env.USERNAME = 'owner-user';
    mockGetConfig.mockResolvedValue({
      SiteConfig: { CustomAdFilterCode: '' },
      LiveConfig: [
        {
          key: 'live-ok',
          name: 'OK',
          url: 'https://live.example.com/a.m3u',
          disabled: false,
        },
        {
          key: 'live-off',
          name: 'OFF',
          url: 'https://live.example.com/b.m3u',
          disabled: true,
        },
      ],
      UserConfig: {
        AllowRegister: true,
        Users: [{ username: 'alice', role: 'user', banned: false }],
      },
    });
  });

  afterAll(() => {
    if (prevPassword === undefined) delete process.env.PASSWORD;
    else process.env.PASSWORD = prevPassword;
    if (prevUsername === undefined) delete process.env.USERNAME;
    else process.env.USERNAME = prevUsername;
  });

  test('POST /api/skipconfigs ignores spoofed body username (IDOR fix)', async () => {
    const cookie = await generateAuthCookie('alice', 'user');
    const req = new NextRequest('http://localhost/api/skipconfigs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: `user_auth=${cookie}`,
      },
      body: JSON.stringify({
        action: 'set',
        username: 'victim',
        key: 'src1+vid1',
        config: {
          source: 'src1',
          id: 'vid1',
          title: '剧集',
          segments: [{ start: 0, end: 90, type: 'opening' }],
          updated_time: 123,
        },
      }),
    });

    const res = await skipPOST(req);
    expect(res.status).toBe(200);
    expect(mockSetSkipConfig).toHaveBeenCalledWith(
      'alice',
      'src1',
      'vid1',
      expect.objectContaining({ title: '剧集' }),
    );
  });

  test('/api/cache enforces auth and cache-prefix whitelist', async () => {
    const unauthRes = await cacheGET(
      new NextRequest('http://localhost/api/cache?key=douban-home'),
    );
    expect(unauthRes.status).toBe(401);

    const cookie = await generateAuthCookie('alice', 'user');
    const badKeyRes = await cachePOST(
      new NextRequest('http://localhost/api/cache', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          cookie: `user_auth=${cookie}`,
        },
        body: JSON.stringify({
          key: 'ai-recommend-history-owner',
          data: { hacked: true },
        }),
      }),
    );
    expect(badKeyRes.status).toBe(400);
    expect(mockSetCache).not.toHaveBeenCalled();

    const goodKeyRes = await cachePOST(
      new NextRequest('http://localhost/api/cache', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          cookie: `user_auth=${cookie}`,
        },
        body: JSON.stringify({
          key: 'douban-movie-top',
          data: [1, 2, 3],
          expireSeconds: 300,
        }),
      }),
    );
    expect(goodKeyRes.status).toBe(200);
    expect(mockSetCache).toHaveBeenCalledWith(
      'douban-movie-top',
      [1, 2, 3],
      300,
    );
  });

  test('/api/proxy/m3u8 rejects disabled sources, preserves signed %2B queries, uses HTTPS proxy origin and UTF-8 byte Content-Length', async () => {
    const disabledRes = await m3u8GET(
      new Request(
        'http://internal:3000/api/proxy/m3u8?url=https%3A%2F%2Fcdn.example.com%2Flist.m3u8&moontv-source=live-off',
      ),
    );
    expect(disabledRes.status).toBe(404);

    const playlist = '#EXTM3U\n#EXTINF:6,中文频道\nseg-1.ts\n';
    mockSafeFetch.mockResolvedValueOnce(
      new Response(playlist, {
        status: 200,
        headers: { 'Content-Type': 'application/vnd.apple.mpegurl' },
      }),
    );

    const signedUrl =
      'https://cdn.example.com/live/play.m3u8?token=abc%2B123%3D';
    const res = await m3u8GET(
      new Request(
        `http://internal:3000/api/proxy/m3u8?url=${encodeURIComponent(
          signedUrl,
        )}&moontv-source=live-ok`,
        {
          headers: {
            'x-forwarded-proto': 'https',
            'x-forwarded-host': 'tv.example.com',
          },
        },
      ),
    );
    expect(res.status).toBe(200);
    expect(mockResolveAndValidateRemoteUrl).toHaveBeenCalledWith(signedUrl, {
      allowHttp: true,
    });
    const text = await res.text();
    expect(text).toContain('https://tv.example.com/api/proxy/segment?');
    expect(res.headers.get('Content-Length')).toBe(
      Buffer.byteLength(text, 'utf8').toString(),
    );
  });

  test('POST /api/admin/data_migration/import does not clearAllData on invalid payload', async () => {
    const ownerCookie = await generateAuthCookie('owner-user', 'owner');
    const badFile = {
      size: 16,
      text: async () => 'not-valid-encrypted-data',
    };
    const fakeReq = {
      cookies: {
        get: (name: string) =>
          name === 'user_auth' ? { value: ownerCookie } : undefined,
      },
      headers: new Headers({ cookie: `user_auth=${ownerCookie}` }),
      formData: async () => ({
        get: (key: string) => (key === 'file' ? badFile : 'wrong-pass'),
      }),
    } as unknown as import('next/server').NextRequest;

    const res = await importPOST(fakeReq);
    expect(res?.status).toBe(400);
    expect(mockClearAllData).not.toHaveBeenCalled();

    const { gzipSync } = await import('zlib');
    const { SimpleCrypto } = await import('@/lib/crypto');
    const payload = {
      timestamp: '2026-11-25T00:00:00.000Z',
      serverVersion: '1.0.0',
      data: {
        adminConfig: { SiteConfig: { SiteName: 'Restored' } },
        userData: {
          alice: {
            password:
              'scrypt$00112233445566778899aabbccddeeff$0123456789abcdef',
            playRecords: {
              'src+1': { title: '片1', play_time: 10, save_time: 1 },
            },
            favorites: { 'src+1': { title: '片1', save_time: 1 } },
            searchHistory: ['one'],
            skipConfigs: {},
          },
        },
      },
    };
    const encrypted = SimpleCrypto.encrypt(
      gzipSync(JSON.stringify(payload)).toString('base64'),
      'backup-pass',
    );
    const validFile = {
      size: encrypted.length,
      text: async () => encrypted,
    };
    const validReq = {
      cookies: {
        get: (name: string) =>
          name === 'user_auth' ? { value: ownerCookie } : undefined,
      },
      headers: new Headers({ cookie: `user_auth=${ownerCookie}` }),
      formData: async () => ({
        get: (key: string) => (key === 'file' ? validFile : 'backup-pass'),
      }),
    } as unknown as import('next/server').NextRequest;

    const okRes = await importPOST(validReq);
    expect(okRes?.status).toBe(200);
    expect(mockClearAllData).toHaveBeenCalledTimes(1);
    expect(mockSetUserPasswordRaw).toHaveBeenCalledWith(
      'alice',
      'scrypt$00112233445566778899aabbccddeeff$0123456789abcdef',
    );
    expect(mockSetPlayRecordByKey).toHaveBeenCalledTimes(1);
    expect(mockSetFavoriteByKey).toHaveBeenCalledTimes(1);
    expect(mockSaveAdminConfig).toHaveBeenCalledWith(
      expect.objectContaining({ selfChecked: true }),
    );
  });

  test('GET /api/parse requires auth, rejects unknown domains, and isolates iframe output', async () => {
    const unauthRes = await parseGET(
      new NextRequest(
        'http://localhost/api/parse?url=https%3A%2F%2Fv.qq.com%2Fx%2Fpage%2Ftest.html',
      ),
    );
    expect(unauthRes.status).toBe(401);

    const cookie = await generateAuthCookie('alice', 'user');
    const unknownDomainRes = await parseGET(
      new NextRequest(
        'http://localhost/api/parse?url=https%3A%2F%2Fevil.example.com%2Fvideo&format=redirect',
        { headers: { cookie: `user_auth=${cookie}` } },
      ),
    );
    expect(unknownDomainRes.status).toBe(400);

    const iframeRes = await parseGET(
      new NextRequest(
        'http://localhost/api/parse?url=https%3A%2F%2Fv.qq.com%2Fx%2Fpage%2Ftest.html&format=iframe',
        { headers: { cookie: `user_auth=${cookie}` } },
      ),
    );
    expect(iframeRes.status).toBe(200);
    expect(iframeRes.headers.get('Content-Security-Policy')).toContain(
      "frame-ancestors 'self'",
    );
    const html = await iframeRes.text();
    expect(html).toContain('sandbox=');
  });

  test('GET /api/skipconfigs enforces auth and returns skip config map', async () => {
    const unauthRes = await skipGET(
      new NextRequest('http://localhost/api/skipconfigs'),
    );
    expect(unauthRes.status).toBe(401);

    mockGetAllSkipConfigs.mockResolvedValueOnce({
      'src1+vid1': { source: 'src1', id: 'vid1', title: '剧集', segments: [] },
    });
    const cookie = await generateAuthCookie('alice', 'user');
    const okRes = await skipGET(
      new NextRequest('http://localhost/api/skipconfigs', {
        headers: { cookie: `user_auth=${cookie}` },
      }),
    );
    expect(okRes.status).toBe(200);
    expect(await okRes.json()).toEqual({
      'src1+vid1': { source: 'src1', id: 'vid1', title: '剧集', segments: [] },
    });
    expect(mockGetAllSkipConfigs).toHaveBeenCalledWith('alice');
  });
});

export {};
