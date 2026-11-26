/**
 * @jest-environment node
 */

const mockGetConfig = jest.fn();

jest.mock('@/lib/config', () => ({
  getConfig: mockGetConfig,
}));

const edgePrimitives = jest.requireActual(
  'next/dist/compiled/@edge-runtime/primitives',
) as {
  fetch: typeof fetch;
  Headers: typeof Headers;
  Request: typeof Request;
  Response: typeof Response;
};

describe('auth, user-access, and admin-auth security', () => {
  let NextRequest: typeof import('next/server').NextRequest;
  let generateAuthCookie: typeof import('@/lib/auth').generateAuthCookie;
  let generateSignature: typeof import('@/lib/auth').generateSignature;
  let requireUser: typeof import('@/lib/auth').requireUser;
  let ensureUserAccessOrResponse: typeof import('@/lib/user-access').ensureUserAccessOrResponse;
  let requireAdmin: typeof import('@/lib/admin-auth').requireAdmin;

  const prevPassword = process.env.PASSWORD;
  const prevUsername = process.env.USERNAME;

  beforeAll(async () => {
    global.fetch = edgePrimitives.fetch;
    global.Headers = edgePrimitives.Headers;
    global.Request = edgePrimitives.Request;
    global.Response = edgePrimitives.Response;
    ({ NextRequest } = await import('next/server'));
    ({ generateAuthCookie, generateSignature, requireUser } =
      await import('@/lib/auth'));
    ({ ensureUserAccessOrResponse } = await import('@/lib/user-access'));
    ({ requireAdmin } = await import('@/lib/admin-auth'));
  });

  beforeEach(() => {
    process.env.PASSWORD = 'unit-test-secret';
    process.env.USERNAME = 'site-owner';
    mockGetConfig.mockReset().mockResolvedValue({
      UserConfig: {
        AllowRegister: true,
        Users: [
          { username: 'alice', role: 'user', banned: false },
          { username: 'mod', role: 'admin', banned: false },
          { username: 'banned-mod', role: 'admin', banned: true },
        ],
      },
    });
  });

  afterAll(() => {
    if (prevPassword === undefined) delete process.env.PASSWORD;
    else process.env.PASSWORD = prevPassword;
    if (prevUsername === undefined) delete process.env.USERNAME;
    else process.env.USERNAME = prevUsername;
  });

  test('requireUser rejects forged signatures, missing timestamps, and expired cookies', async () => {
    const forgedReq = new NextRequest('http://localhost/api/sources', {
      headers: {
        cookie: `user_auth=${encodeURIComponent(
          JSON.stringify({
            username: 'alice',
            signature: 'deadbeef',
            timestamp: Date.now(),
          }),
        )}`,
      },
    });
    expect((await requireUser(forgedReq)).response?.status).toBe(401);

    const legacySigOnly = await generateSignature('alice', 'unit-test-secret');
    const missingTsReq = new NextRequest('http://localhost/api/sources', {
      headers: {
        cookie: `user_auth=${encodeURIComponent(
          JSON.stringify({ username: 'alice', signature: legacySigOnly }),
        )}`,
      },
    });
    expect((await requireUser(missingTsReq)).response?.status).toBe(401);

    const oldTs = Date.now() - 8 * 24 * 60 * 60 * 1000;
    const expiredSig = await generateSignature(
      `alice.${oldTs}`,
      'unit-test-secret',
    );
    const expiredReq = new NextRequest('http://localhost/api/sources', {
      headers: {
        cookie: `user_auth=${encodeURIComponent(
          JSON.stringify({
            username: 'alice',
            signature: expiredSig,
            timestamp: oldTs,
          }),
        )}`,
      },
    });
    expect((await requireUser(expiredReq)).response?.status).toBe(401);

    const validCookie = await generateAuthCookie('alice', 'user');
    const validReq = new NextRequest('http://localhost/api/sources', {
      headers: { cookie: `user_auth=${validCookie}` },
    });
    const verified = await requireUser(validReq);
    expect(verified.authInfo?.username).toBe('alice');
  });

  test('ensureUserAccessOrResponse rejects tokens issued before tokenInvalidBefore', async () => {
    const now = Date.now();
    mockGetConfig.mockResolvedValue({
      UserConfig: {
        AllowRegister: true,
        Users: [
          {
            username: 'alice',
            role: 'user',
            banned: false,
            tokenInvalidBefore: now,
          },
        ],
      },
    });

    const staleResult = await ensureUserAccessOrResponse('alice', now - 1000);
    expect('response' in staleResult && staleResult.response.status).toBe(401);

    const freshResult = await ensureUserAccessOrResponse('alice', now + 1000);
    expect('resolved' in freshResult).toBe(true);
  });

  test('requireAdmin distinguishes 401 invalid/revoked auth from 403 insufficient role', async () => {
    const aliceCookie = await generateAuthCookie('alice', 'user');
    const aliceReq = new NextRequest('http://localhost/api/admin/config', {
      headers: { cookie: `user_auth=${aliceCookie}` },
    });
    const aliceAdminCheck = await requireAdmin(aliceReq);
    expect(aliceAdminCheck.response?.status).toBe(403);

    const modCookie = await generateAuthCookie('mod', 'admin');
    const modReq = new NextRequest('http://localhost/api/admin/config', {
      headers: { cookie: `user_auth=${modCookie}` },
    });
    const ownerOnlyCheck = await requireAdmin(modReq, { ownerOnly: true });
    expect(ownerOnlyCheck.response?.status).toBe(403);
    const adminCheck = await requireAdmin(modReq);
    expect('role' in adminCheck ? adminCheck.role : undefined).toBe('admin');

    const bannedCookie = await generateAuthCookie('banned-mod', 'admin');
    const bannedReq = new NextRequest('http://localhost/api/admin/config', {
      headers: { cookie: `user_auth=${bannedCookie}` },
    });
    const bannedCheck = await requireAdmin(bannedReq);
    expect(bannedCheck.response?.status).toBe(401);
  });
  test('getAuthInfoFromBrowserCookie rejects expired timestamp payloads', async () => {
    const { getAuthInfoFromBrowserCookie } = await import('@/lib/auth');
    const prevWindow = (globalThis as { window?: unknown }).window;
    const prevDocument = (globalThis as { document?: unknown }).document;
    try {
      const expiredTs = Date.now() - 8 * 24 * 60 * 60 * 1000;
      (globalThis as { window?: unknown }).window = {};
      (globalThis as { document?: unknown }).document = {
        cookie: `user_auth=${encodeURIComponent(
          JSON.stringify({
            username: 'qiuwei',
            signature: 'legacy-sig',
            timestamp: expiredTs,
          }),
        )}`,
      };
      expect(getAuthInfoFromBrowserCookie()).toBeNull();

      (globalThis as { document?: unknown }).document = {
        cookie: `user_auth=${encodeURIComponent(
          JSON.stringify({
            username: 'qiuwei',
            signature: 'fresh-sig',
            timestamp: Date.now(),
          }),
        )}`,
      };
      expect(getAuthInfoFromBrowserCookie()?.username).toBe('qiuwei');
    } finally {
      if (prevWindow === undefined) {
        delete (globalThis as { window?: unknown }).window;
      } else {
        (globalThis as { window?: unknown }).window = prevWindow;
      }
      if (prevDocument === undefined) {
        delete (globalThis as { document?: unknown }).document;
      } else {
        (globalThis as { document?: unknown }).document = prevDocument;
      }
    }
  });
});

export {};
