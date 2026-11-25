/**
 * @jest-environment node
 */

const mockResolveRequestUser = jest.fn();
const mockResolveAllowedSourceForRequest = jest.fn();
const mockCheckGuestRateLimit = jest.fn();
const mockGetDetailFromApi = jest.fn();

jest.mock('@/lib/auth', () => ({
  resolveRequestUser: mockResolveRequestUser,
}));

jest.mock('@/lib/guest-source', () => ({
  resolveAllowedSourceForRequest: mockResolveAllowedSourceForRequest,
  checkGuestRateLimit: mockCheckGuestRateLimit,
}));

jest.mock('@/lib/downstream', () => ({
  getDetailFromApi: mockGetDetailFromApi,
}));

const edgePrimitives = jest.requireActual(
  'next/dist/compiled/@edge-runtime/primitives',
) as {
  fetch: typeof fetch;
  Headers: typeof Headers;
  Request: typeof Request;
  Response: typeof Response;
};

let NextRequest: typeof import('next/server').NextRequest;

const GUEST_SITE = {
  key: 'iqiyizyapi.com',
  name: '爱奇艺',
  api: 'https://api.example.com',
};

describe('GET /api/detail 访客感知鉴权', () => {
  let GET: typeof import('./route').GET;

  beforeAll(async () => {
    global.fetch = edgePrimitives.fetch;
    global.Headers = edgePrimitives.Headers;
    global.Request = edgePrimitives.Request;
    global.Response = edgePrimitives.Response;
    ({ NextRequest } = await import('next/server'));
    ({ GET } = await import('./route'));
  });

  beforeEach(() => {
    mockResolveRequestUser.mockReset().mockResolvedValue(null);
    mockResolveAllowedSourceForRequest.mockReset().mockResolvedValue(null);
    mockCheckGuestRateLimit.mockReset().mockReturnValue(null);
    mockGetDetailFromApi.mockReset().mockResolvedValue({
      code: 200,
      title: '测试',
      episodes: ['ep1'],
    });
  });

  const makeRequest = (query: string) =>
    new NextRequest(`http://localhost/api/detail?${query}`);

  it('allows guests to fetch the guest source detail', async () => {
    mockResolveAllowedSourceForRequest.mockResolvedValue({
      site: GUEST_SITE,
      isAdult: false,
    });

    const response = await GET(makeRequest('source=iqiyizyapi.com&id=123'));

    expect(response.status).toBe(200);
    expect(mockResolveAllowedSourceForRequest).toHaveBeenCalledWith(
      null,
      'iqiyizyapi.com',
    );
    expect(mockGetDetailFromApi).toHaveBeenCalledWith(GUEST_SITE, '123');
    const json = await response.json();
    expect(json.adult).toBeUndefined();
  });

  it('marks adult=true and sets private no-store headers for adult sources', async () => {
    const adultSite = {
      key: 'jp98.vip',
      name: '黄果',
      api: 'https://jp98.vip/api.php/provide/vod/',
    };
    mockResolveRequestUser.mockResolvedValue({ username: 'alice' });
    mockResolveAllowedSourceForRequest.mockResolvedValue({
      site: adultSite,
      isAdult: true,
    });

    const response = await GET(makeRequest('source=jp98.vip&id=39394'));

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    await expect(response.json()).resolves.toMatchObject({
      title: '测试',
      adult: true,
    });
  });

  it('rejects guests fetching non-guest sources with 403', async () => {
    mockResolveAllowedSourceForRequest.mockResolvedValue(null);

    const response = await GET(makeRequest('source=other&id=123'));

    expect(response.status).toBe(403);
    expect(mockGetDetailFromApi).not.toHaveBeenCalled();
  });

  it('keeps 400 semantics for logged-in users with an invalid source', async () => {
    mockResolveRequestUser.mockResolvedValue({ username: 'alice' });
    mockResolveAllowedSourceForRequest.mockResolvedValue(null);

    const response = await GET(makeRequest('source=other&id=123'));

    expect(response.status).toBe(400);
  });

  it('returns 429 when the guest rate limit is exceeded', async () => {
    mockCheckGuestRateLimit.mockReturnValue(
      new Response('Too Many Requests', { status: 429 }),
    );

    const response = await GET(makeRequest('source=iqiyizyapi.com&id=123'));

    expect(response.status).toBe(429);
    expect(mockResolveAllowedSourceForRequest).not.toHaveBeenCalled();
  });

  it('returns 400 when id has an invalid format', async () => {
    const response = await GET(
      makeRequest('source=iqiyizyapi.com&id=bad%2Fid'),
    );

    expect(response.status).toBe(400);
    expect(mockGetDetailFromApi).not.toHaveBeenCalled();
  });
});

export {};
