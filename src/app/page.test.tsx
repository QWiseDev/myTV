const mockHeaders = jest.fn();
const mockGetServerInitialHomeData = jest.fn();

jest.mock('next/headers', () => ({
  headers: () => mockHeaders(),
}));

jest.mock('@/lib/home-data.server', () => ({
  getServerInitialHomeData: mockGetServerInitialHomeData,
}));

jest.mock('@/components/HomeClient', () => ({
  __esModule: true,
  default: () => null,
}));

const initialHomeData = {
  hotMovies: [
    {
      id: '1',
      title: '测试影片',
      poster: '',
      rate: '',
      year: '2026',
    },
  ],
  hotTvShows: [],
  hotVarietyShows: [],
  bangumiCalendarData: [],
};

describe('Home page initial data', () => {
  let Home: typeof import('./page').default;

  beforeAll(async () => {
    Home = (await import('./page')).default;
  });

  beforeEach(() => {
    mockHeaders.mockReset();
    mockGetServerInitialHomeData.mockReset();
  });

  it('uses the SSR initial-data reader for authenticated requests', async () => {
    mockHeaders.mockReturnValue({ get: () => 'auth=1' });
    mockGetServerInitialHomeData.mockResolvedValue(initialHomeData);

    const element = await Home();

    expect(mockGetServerInitialHomeData).toHaveBeenCalledTimes(1);
    expect(element.props.initialHomeData).toEqual(initialHomeData);
  });

  it('skips server data loading without a cookie', async () => {
    mockHeaders.mockReturnValue({ get: () => null });

    const element = await Home();

    expect(mockGetServerInitialHomeData).not.toHaveBeenCalled();
    expect(element.props.initialHomeData).toEqual({
      hotMovies: [],
      hotTvShows: [],
      hotVarietyShows: [],
      bangumiCalendarData: [],
    });
  });

  it('falls back to empty data when server preloading fails', async () => {
    const consoleError = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    mockHeaders.mockReturnValue({ get: () => 'auth=1' });
    mockGetServerInitialHomeData.mockRejectedValue(new Error('cache failed'));

    try {
      const element = await Home();

      expect(element.props.initialHomeData).toEqual({
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
