/**
 * @jest-environment node
 */

const mockResolveRequestUser = jest.fn();
const mockIsSourceAllowedForRequest = jest.fn();
const mockCheckGuestRateLimit = jest.fn();
const mockGetDetailFromApi = jest.fn();

jest.mock('@/lib/auth', () => ({
  resolveRequestUser: mockResolveRequestUser,
}));

jest.mock('@/lib/guest-source', () => ({
  isSourceAllowedForRequest: mockIsSourceAllowedForRequest,
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
    mockIsSourceAllowedForRequest.mockReset().mockResolvedValue(null);
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
    mockIsSourceAllowedForRequest.mockResolvedValue(GUEST_SITE);

    const response = await GET(makeRequest('source=iqiyizyapi.com&id=123'));

    expect(response.status).toBe(200);
    expect(mockIsSourceAllowedForRequest).toHaveBeenCalledWith(
      null,
      'iqiyizyapi.com',
    );
    expect(mockGetDetailFromApi).toHaveBeenCalledWith(GUEST_SITE, '123');
  });

  it('rejects guests fetching non-guest sources with 403', async () => {
    mockIsSourceAllowedForRequest.mockResolvedValue(null);

    const response = await GET(makeRequest('source=other&id=123'));

    expect(response.status).toBe(403);
    expect(mockGetDetailFromApi).not.toHaveBeenCalled();
  });

  it('keeps 400 semantics for logged-in users with an invalid source', async () => {
    mockResolveRequestUser.mockResolvedValue({ username: 'alice' });
    mockIsSourceAllowedForRequest.mockResolvedValue(null);

    const response = await GET(makeRequest('source=other&id=123'));

    expect(response.status).toBe(400);
  });

  it('returns 429 when the guest rate limit is exceeded', async () => {
    mockCheckGuestRateLimit.mockReturnValue(
      new Response('Too Many Requests', { status: 429 }),
    );

    const response = await GET(makeRequest('source=iqiyizyapi.com&id=123'));

    expect(response.status).toBe(429);
    expect(mockIsSourceAllowedForRequest).not.toHaveBeenCalled();
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
