const mockFetchBangumiCalendarData = jest.fn();
const mockGetDoubanCategories = jest.fn();

jest.mock('@/lib/bangumi.client', () => ({
  fetchBangumiCalendarData: mockFetchBangumiCalendarData,
}));

jest.mock('@/lib/douban.client', () => ({
  getDoubanCategories: mockGetDoubanCategories,
}));

let loadSecondaryData: typeof import('./home-data-loader').loadSecondaryData;
let loadCriticalData: typeof import('./home-data-loader').loadCriticalData;
let loadTertiaryData: typeof import('./home-data-loader').loadTertiaryData;

const item = {
  id: '1',
  title: '测试影片',
  poster: '',
  rate: '',
  year: '2026',
};

describe('home-data-loader', () => {
  beforeAll(async () => {
    ({ loadCriticalData, loadSecondaryData, loadTertiaryData } =
      await import('./home-data-loader'));
  });

  beforeEach(() => {
    mockFetchBangumiCalendarData.mockReset();
    mockFetchBangumiCalendarData.mockResolvedValue([]);
    mockGetDoubanCategories.mockReset();
    mockGetDoubanCategories.mockResolvedValue({
      code: 200,
      list: [],
    });
  });

  it('requests only the selected secondary section', async () => {
    const result = await loadSecondaryData({
      loadTvShows: false,
      loadVarietyShows: true,
    });

    expect(mockGetDoubanCategories).toHaveBeenCalledTimes(1);
    expect(mockGetDoubanCategories).toHaveBeenCalledWith(
      {
        kind: 'tv',
        category: 'show',
        type: 'show',
      },
      expect.any(AbortSignal),
    );
    expect(result.hotTvShows).toBeUndefined();
  });

  it('keeps a successful secondary result when its sibling rejects', async () => {
    const varietyResult = {
      code: 200,
      message: 'success',
      list: [{ ...item, id: 'show-success' }],
    };
    mockGetDoubanCategories
      .mockRejectedValueOnce(new Error('tv failed'))
      .mockResolvedValueOnce(varietyResult);

    await expect(
      loadSecondaryData({ loadTvShows: true, loadVarietyShows: true }),
    ).resolves.toEqual({
      hotTvShows: {
        ok: false,
        error: expect.any(Error),
      },
      hotVarietyShows: {
        ok: true,
        data: varietyResult.list,
      },
    });
  });

  it('preserves a tertiary rejection as an error result', async () => {
    mockFetchBangumiCalendarData.mockRejectedValueOnce(
      new Error('bangumi failed'),
    );

    await expect(loadTertiaryData()).resolves.toEqual({
      ok: false,
      error: expect.any(Error),
    });
  });

  it('keeps a successful empty section distinct from a failed section', async () => {
    await expect(loadCriticalData()).resolves.toEqual({
      ok: true,
      data: [],
    });
  });
});

export {};
