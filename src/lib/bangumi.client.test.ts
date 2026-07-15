const mockCacheGet = jest.fn();
const mockCacheSet = jest.fn();

jest.mock('./client-cache', () => ({
  ClientCache: {
    get: mockCacheGet,
    set: mockCacheSet,
  },
}));

let GetBangumiCalendarData: typeof import('./bangumi.client').GetBangumiCalendarData;

describe('GetBangumiCalendarData', () => {
  let originalFetch: typeof global.fetch;

  beforeAll(async () => {
    GetBangumiCalendarData = (await import('./bangumi.client'))
      .GetBangumiCalendarData;
  });

  beforeEach(() => {
    originalFetch = global.fetch;
    global.fetch = jest.fn();
    mockCacheGet.mockReset().mockResolvedValue(null);
    mockCacheSet.mockReset().mockResolvedValue(undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('returns an empty array for a non-ok response without reading its body', async () => {
    const json = jest.fn().mockResolvedValue({ error: 'rate limited' });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 429,
      json,
    });

    await expect(GetBangumiCalendarData()).resolves.toEqual([]);
    expect(json).not.toHaveBeenCalled();
    expect(mockCacheSet).not.toHaveBeenCalled();
  });

  it('normalizes a non-array response body to an empty array', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({ error: 'unexpected payload' }),
    });

    await expect(GetBangumiCalendarData()).resolves.toEqual([]);
    expect(mockCacheSet).not.toHaveBeenCalled();
  });

  it('returns a valid cached calendar without fetching', async () => {
    const cached = [
      {
        weekday: { en: 'Mon', cn: '周一', ja: '月' },
        items: [],
      },
    ];
    mockCacheGet.mockResolvedValue(cached);

    await expect(GetBangumiCalendarData()).resolves.toBe(cached);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

export {};
