/**
 * @jest-environment node
 */

const mockRequireUser = jest.fn();
const mockEnsureUserAccessOrResponse = jest.fn();
const mockGetAvailableApiSites = jest.fn();
const mockGetAdultApiSites = jest.fn();
const mockGetCacheTime = jest.fn();
const mockGetConfig = jest.fn();
const mockSearchFromApi = jest.fn();
const mockProbeSiteSearchHealth = jest.fn();
const mockShouldSkipSiteSearch = jest.fn();

jest.mock('@/lib/auth', () => ({
  requireUser: mockRequireUser,
}));

jest.mock('@/lib/user-access', () => ({
  ensureUserAccessOrResponse: mockEnsureUserAccessOrResponse,
}));

jest.mock('@/lib/config', () => ({
  BUILT_IN_ADULT_SOURCES: [
    {
      key: 'jp98.vip',
      name: '黄果',
      api: 'https://jp98.vip/api.php/provide/vod/',
    },
  ],
  getAvailableApiSites: mockGetAvailableApiSites,
  getAdultApiSites: mockGetAdultApiSites,
  getCacheTime: mockGetCacheTime,
  getConfig: mockGetConfig,
}));

jest.mock('@/lib/downstream', () => ({
  searchFromApi: mockSearchFromApi,
  probeSiteSearchHealth: mockProbeSiteSearchHealth,
}));

jest.mock('@/lib/site-health', () => ({
  getSiteSearchTimeoutMs: jest.fn((_key: string, base: number) => base),
  isSearchTimeoutError: jest.fn(() => false),
  markSiteSearchFailure: jest.fn(),
  SEARCH_SITE_TIMEOUT_MS: 8000,
  shouldSkipSiteSearch: mockShouldSkipSiteSearch,
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

const NORMAL_SITE = {
  key: 'normal1',
  name: '常规源',
  api: 'https://normal1.example.com/',
};
const NORMAL_SITE_2 = {
  key: 'normal2',
  name: '常规源2',
  api: 'https://normal2.example.com/',
};
const ADULT_SITE = {
  key: 'jp98.vip',
  name: '黄果',
  api: 'https://jp98.vip/api.php/provide/vod/',
};
const ADULT_SITE_2 = {
  key: 'adult2.example',
  name: '成人源2',
  api: 'https://adult2.example/api.php/provide/vod/',
};

describe('GET /api/search 源分组与隔离', () => {
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
    mockRequireUser.mockReset().mockResolvedValue({
      authInfo: { username: 'alice', timestamp: Date.now() },
    });
    mockEnsureUserAccessOrResponse.mockReset().mockResolvedValue({
      user: { username: 'alice' },
    });
    mockGetAvailableApiSites
      .mockReset()
      .mockResolvedValue([NORMAL_SITE, NORMAL_SITE_2]);
    mockShouldSkipSiteSearch.mockReset().mockReturnValue({
      skip: false,
      shouldBackgroundProbe: false,
      state: 'closed',
    });
    mockProbeSiteSearchHealth.mockReset().mockResolvedValue(true);
    mockGetAdultApiSites.mockReset().mockResolvedValue([ADULT_SITE]);
    mockGetCacheTime.mockReset().mockResolvedValue(300);
    mockGetConfig.mockReset().mockResolvedValue({
      SiteConfig: { DisableYellowFilter: false },
      SourceConfig: [
        { ...NORMAL_SITE, disabled: false },
        { ...NORMAL_SITE_2, disabled: false },
        { ...ADULT_SITE, disabled: false, adult: true },
      ],
    });
    mockSearchFromApi.mockReset().mockResolvedValue([]);
  });

  const makeRequest = (query: string) =>
    new NextRequest(`http://localhost/api/search?${query}`);

  it('never searches regular sources when forSource is an adult source like jp98.vip', async () => {
    const response = await GET(
      makeRequest(
        'q=%E3%80%8A%E8%A3%99%E4%B8%8B%E4%B9%8B%E8%87%A3%EF%BC%9A%E9%80%83%E5%87%BA%E9%AD%94%E7%AA%9F%E3%80%8B&forSource=jp98.vip',
      ),
    );

    expect(response.status).toBe(200);
    expect(mockGetAvailableApiSites).not.toHaveBeenCalled();
    expect(mockGetAdultApiSites).toHaveBeenCalledWith('alice');
    expect(mockSearchFromApi).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({ results: [] });
  });

  it('searches only other adult sources and preserves yellow-tagged results for group=adult', async () => {
    mockGetAdultApiSites.mockResolvedValue([ADULT_SITE, ADULT_SITE_2]);
    mockSearchFromApi.mockResolvedValue([
      {
        id: 'a2',
        title: '测试剧集',
        poster: '',
        episodes: ['https://adult2.example/1.m3u8'],
        episodes_titles: [],
        source: ADULT_SITE_2.key,
        source_name: ADULT_SITE_2.name,
        year: '2026',
        type_name: '伦理片',
      },
    ]);

    const response = await GET(
      makeRequest('q=测试剧集&group=adult&forSource=jp98.vip'),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(mockGetAvailableApiSites).not.toHaveBeenCalled();
    expect(mockSearchFromApi).toHaveBeenCalledTimes(1);
    expect(mockSearchFromApi).toHaveBeenCalledWith(ADULT_SITE_2, '测试剧集');
    const json = await response.json();
    expect(json.results).toHaveLength(1);
    expect(json.results[0]).toMatchObject({
      source: ADULT_SITE_2.key,
      adult: true,
    });
  });

  it('excludes forSource from regular source search when forSource is a regular source', async () => {
    mockSearchFromApi.mockResolvedValue([
      {
        id: 'n2',
        title: '南部档案',
        poster: '',
        episodes: ['https://normal2.example.com/1.m3u8'],
        episodes_titles: [],
        source: NORMAL_SITE_2.key,
        source_name: NORMAL_SITE_2.name,
        year: '2026',
      },
    ]);

    const response = await GET(makeRequest('q=南部档案&forSource=normal1'));

    expect(response.status).toBe(200);
    expect(mockGetAdultApiSites).not.toHaveBeenCalled();
    expect(mockSearchFromApi).toHaveBeenCalledTimes(1);
    expect(mockSearchFromApi).toHaveBeenCalledWith(NORMAL_SITE_2, '南部档案');
  });

  it('skips half-open sites without waiting and triggers background health probe', async () => {
    mockShouldSkipSiteSearch.mockImplementation((key: string) =>
      key === NORMAL_SITE.key
        ? { skip: true, shouldBackgroundProbe: true, state: 'half_open' }
        : { skip: false, shouldBackgroundProbe: false, state: 'closed' },
    );
    mockSearchFromApi.mockResolvedValue([
      {
        id: 'n2',
        title: '后会友期',
        poster: '',
        episodes: ['https://normal2.example.com/1.m3u8'],
        episodes_titles: [],
        source: NORMAL_SITE_2.key,
        source_name: NORMAL_SITE_2.name,
        year: '2026',
      },
    ]);

    const response = await GET(makeRequest('q=后会友期'));
    expect(response.status).toBe(200);
    expect(mockProbeSiteSearchHealth).toHaveBeenCalledTimes(1);
    expect(mockProbeSiteSearchHealth).toHaveBeenCalledWith(NORMAL_SITE);
    expect(mockSearchFromApi).toHaveBeenCalledTimes(1);
    expect(mockSearchFromApi).toHaveBeenCalledWith(NORMAL_SITE_2, '后会友期');
  });

  it('mode=exact limits downstream to 1 page and filters unrelated results on server', async () => {
    mockGetAvailableApiSites.mockResolvedValue([NORMAL_SITE]);
    mockSearchFromApi.mockResolvedValue([
      {
        id: 'match-1',
        title: '现在就出发第四季',
        poster: '',
        episodes: ['https://normal1.example.com/1.m3u8'],
        episodes_titles: ['第1期'],
        source: NORMAL_SITE.key,
        source_name: NORMAL_SITE.name,
        year: '2026',
      },
      {
        id: 'junk-1',
        title: '现在就出发 第一季',
        poster: '',
        episodes: ['https://normal1.example.com/old.m3u8'],
        episodes_titles: ['第1期'],
        source: NORMAL_SITE.key,
        source_name: NORMAL_SITE.name,
        year: '2023',
      },
      {
        id: 'junk-2',
        title: '完全无关综艺',
        poster: '',
        episodes: ['https://normal1.example.com/other.m3u8'],
        episodes_titles: ['第1期'],
        source: NORMAL_SITE.key,
        source_name: NORMAL_SITE.name,
        year: '2026',
      },
    ]);

    const response = await GET(
      makeRequest(
        'q=%E7%8E%B0%E5%9C%A8%E5%B0%B1%E5%87%BA%E5%8F%91%20%E7%AC%AC%E5%9B%9B%E5%AD%A3&mode=exact&title=%E7%8E%B0%E5%9C%A8%E5%B0%B1%E5%87%BA%E5%8F%91%20%E7%AC%AC%E5%9B%9B%E5%AD%A3&year=2026',
      ),
    );

    expect(response.status).toBe(200);
    expect(mockSearchFromApi).toHaveBeenCalledWith(
      NORMAL_SITE,
      '现在就出发 第四季',
      { maxPages: 1 },
    );
    const json = await response.json();
    expect(json.results.map((r: { id: string }) => r.id)).toEqual(['match-1']);
  });
});

export {};
