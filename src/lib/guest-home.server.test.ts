/**
 * @jest-environment node
 */

const mockGetGuestSource = jest.fn();
const mockFetchSourceCategories = jest.fn();
const mockFetchSourceVideoList = jest.fn();

jest.mock('@/lib/guest-source', () => ({
  getGuestSource: (...args: unknown[]) => mockGetGuestSource(...args),
}));

jest.mock('@/lib/source-browser.server', () => ({
  fetchSourceCategories: (...args: unknown[]) =>
    mockFetchSourceCategories(...args),
  fetchSourceVideoList: (...args: unknown[]) =>
    mockFetchSourceVideoList(...args),
}));

const GUEST_SITE = {
  key: 'iqiyizyapi.com',
  name: '爱奇艺',
  api: 'https://iqiyizyapi.com/api.php/provide/vod/',
};

describe('guest-home.server SSR preloading', () => {
  let getServerInitialGuestHomeData: typeof import('./guest-home.server').getServerInitialGuestHomeData;

  beforeAll(async () => {
    ({ getServerInitialGuestHomeData } = await import('./guest-home.server'));
  });

  beforeEach(() => {
    mockGetGuestSource.mockReset();
    mockFetchSourceCategories.mockReset();
    mockFetchSourceVideoList.mockReset();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns source, categories, initialCategory and initialList when warm', async () => {
    const categories = [
      { type_id: 1, type_name: '电影' },
      { type_id: 2, type_name: '连续剧' },
    ];
    const initialList = {
      items: [
        {
          id: 'g1',
          title: '首屏大片',
          poster: '',
          year: '2026',
          type_name: '电影',
          remarks: 'HD',
        },
      ],
      meta: { page: 1, pagecount: 5, total: 100, limit: 20 },
    };
    mockGetGuestSource.mockResolvedValue(GUEST_SITE);
    mockFetchSourceCategories.mockResolvedValue(categories);
    mockFetchSourceVideoList.mockResolvedValue(initialList);

    const data = await getServerInitialGuestHomeData();

    expect(data).toEqual({
      source: GUEST_SITE,
      categories,
      initialCategory: 1,
      initialList,
    });
    expect(mockFetchSourceVideoList).toHaveBeenCalledWith(GUEST_SITE, '1', 1);
  });

  it('returns undefined when guest source is unavailable', async () => {
    mockGetGuestSource.mockResolvedValue(null);

    await expect(getServerInitialGuestHomeData()).resolves.toBeUndefined();
    expect(mockFetchSourceCategories).not.toHaveBeenCalled();
  });

  it('returns partial data without blocking SSR beyond the soft deadline when list stalls', async () => {
    jest.useFakeTimers();
    const categories = [{ type_id: 1, type_name: '电影' }];
    mockGetGuestSource.mockResolvedValue(GUEST_SITE);
    mockFetchSourceCategories.mockResolvedValue(categories);
    mockFetchSourceVideoList.mockReturnValue(new Promise(() => undefined));

    const pending = getServerInitialGuestHomeData();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    jest.advanceTimersByTime(1500);

    await expect(pending).resolves.toEqual({
      source: GUEST_SITE,
      categories,
      initialCategory: 1,
    });
  });
});

export {};
