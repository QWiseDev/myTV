const mockGetDoubanCategories = jest.fn();

jest.mock('@/lib/douban.client', () => ({
  getDoubanCategories: mockGetDoubanCategories,
}));

let loadSecondaryData: typeof import('./home-data-loader').loadSecondaryData;
let loadHomeDataFromApi: typeof import('./home-data-loader').loadHomeDataFromApi;

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

describe('loadSecondaryData', () => {
  beforeAll(async () => {
    ({ loadHomeDataFromApi, loadSecondaryData } =
      await import('./home-data-loader'));
  });

  beforeEach(() => {
    mockGetDoubanCategories.mockReset();
    mockGetDoubanCategories.mockResolvedValue({
      code: 200,
      list: [],
    });
  });

  it('requests only the selected secondary section', async () => {
    await loadSecondaryData({
      loadTvShows: false,
      loadVarietyShows: true,
    });

    expect(mockGetDoubanCategories).toHaveBeenCalledTimes(1);
    expect(mockGetDoubanCategories).toHaveBeenCalledWith({
      kind: 'tv',
      category: 'show',
      type: 'show',
    });
  });

  it('keeps only a complete aggregate in the client memory cache', async () => {
    const originalFetch = global.fetch;
    let responseData: typeof completeHomeData = {
      ...completeHomeData,
      hotTvShows: [],
      hotVarietyShows: [],
      bangumiCalendarData: [],
    };
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => responseData,
    }) as unknown as typeof fetch;

    try {
      await loadHomeDataFromApi();
      await loadHomeDataFromApi();
      expect(global.fetch).toHaveBeenCalledTimes(2);

      responseData = completeHomeData;
      await loadHomeDataFromApi();
      await loadHomeDataFromApi();
      expect(global.fetch).toHaveBeenCalledTimes(3);
    } finally {
      global.fetch = originalFetch;
    }
  });
});

export {};
