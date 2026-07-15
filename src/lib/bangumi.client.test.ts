const mockCacheGet = jest.fn();
const mockCacheSet = jest.fn();

jest.mock('./client-cache', () => ({
  ClientCache: {
    get: mockCacheGet,
    set: mockCacheSet,
  },
}));

let fetchBangumiCalendarData: typeof import('./bangumi.client').fetchBangumiCalendarData;
let GetBangumiCalendarData: typeof import('./bangumi.client').GetBangumiCalendarData;

describe('GetBangumiCalendarData', () => {
  let originalFetch: typeof global.fetch;

  beforeAll(async () => {
    ({ fetchBangumiCalendarData, GetBangumiCalendarData } =
      await import('./bangumi.client'));
  });

  beforeEach(() => {
    originalFetch = global.fetch;
    global.fetch = jest.fn();
    mockCacheGet.mockReset().mockResolvedValue(null);
    mockCacheSet.mockReset().mockResolvedValue(undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
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

  it('exposes upstream failures through the abortable fetch API', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 503,
    });

    await expect(fetchBangumiCalendarData()).rejects.toThrow(
      'Bangumi API 请求失败: HTTP 503',
    );
    expect(mockCacheSet).not.toHaveBeenCalled();
  });

  it('does not write cache after the parent request is aborted', async () => {
    const controller = new AbortController();
    const calendar = [
      {
        weekday: { en: 'Tue', cn: '周二', ja: '火' },
        items: [],
      },
    ];
    let resolveJson!: (value: unknown) => void;
    const json = jest.fn(
      () =>
        new Promise((resolve) => {
          resolveJson = resolve;
        }),
    );
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json,
    });

    const result = fetchBangumiCalendarData(controller.signal);
    const rejection = expect(result).rejects.toMatchObject({
      name: 'AbortError',
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(json).toHaveBeenCalledTimes(1);

    controller.abort();
    resolveJson(calendar);

    await rejection;
    await Promise.resolve();
    expect(mockCacheSet).not.toHaveBeenCalled();
  });
});

export {};
