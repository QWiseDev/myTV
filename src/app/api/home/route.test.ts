/**
 * @jest-environment node
 */

const mockGetServerHomeData = jest.fn();

jest.mock('@/lib/home-data.server', () => ({
  getServerHomeData: mockGetServerHomeData,
}));

const edgePrimitives = jest.requireActual(
  'next/dist/compiled/@edge-runtime/primitives',
) as {
  fetch: typeof fetch;
  Headers: typeof Headers;
  Request: typeof Request;
  Response: typeof Response;
};

const item = {
  id: '1',
  title: '测试影片',
  poster: '',
  rate: '',
  year: '2026',
};

const completeHomeData = {
  hotMovies: [item],
  hotTvShows: [{ ...item, id: 'tv1' }],
  hotVarietyShows: [{ ...item, id: 'show1' }],
  bangumiCalendarData: [
    {
      weekday: { en: 'Mon', cn: '周一', ja: '月' },
      items: [],
    },
  ],
};

describe('GET /api/home', () => {
  let GET: typeof import('./route').GET;

  beforeAll(async () => {
    global.fetch = edgePrimitives.fetch;
    global.Headers = edgePrimitives.Headers;
    global.Request = edgePrimitives.Request;
    global.Response = edgePrimitives.Response;
    ({ GET } = await import('./route'));
  });

  beforeEach(() => {
    mockGetServerHomeData.mockReset();
  });

  it('uses public cache headers for a complete aggregate', async () => {
    mockGetServerHomeData.mockResolvedValue(completeHomeData);

    const response = await GET();

    expect(response.headers.get('cache-control')).toBe(
      'public, max-age=60, s-maxage=300, stale-while-revalidate=600',
    );
    expect(response.headers.get('cdn-cache-control')).toBe(
      'public, s-maxage=300, stale-while-revalidate=600',
    );
  });

  it('does not cache a partial aggregate', async () => {
    mockGetServerHomeData.mockResolvedValue({
      ...completeHomeData,
      hotTvShows: [],
    });

    const response = await GET();

    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('cdn-cache-control')).toBe('no-store');
  });

  it('does not cache an aggregate failure', async () => {
    const consoleError = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    mockGetServerHomeData.mockRejectedValue(new Error('upstream failed'));

    try {
      const response = await GET();

      expect(response.status).toBe(502);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(response.headers.get('cdn-cache-control')).toBe('no-store');
      await expect(response.json()).resolves.toEqual({
        hotMovies: [],
        hotTvShows: [],
        hotVarietyShows: [],
        bangumiCalendarData: [],
      });
    } finally {
      consoleError.mockRestore();
    }
  });
});

export {};
