const mockGetDoubanCategories = jest.fn();

jest.mock('@/lib/douban.client', () => ({
  getDoubanCategories: mockGetDoubanCategories,
}));

let loadSecondaryData: typeof import('./home-data-loader').loadSecondaryData;

describe('loadSecondaryData', () => {
  beforeAll(async () => {
    loadSecondaryData = (await import('./home-data-loader')).loadSecondaryData;
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
});

export {};
