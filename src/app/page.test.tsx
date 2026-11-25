const mockHeaders = jest.fn();
const mockGetServerInitialHomeData = jest.fn();
const mockGetServerInitialGuestHomeData = jest.fn();

jest.mock('next/headers', () => ({
  headers: () => mockHeaders(),
}));

jest.mock('@/lib/home-data.server', () => ({
  getServerInitialHomeData: mockGetServerInitialHomeData,
}));

jest.mock('@/lib/guest-home.server', () => ({
  getServerInitialGuestHomeData: mockGetServerInitialGuestHomeData,
}));

jest.mock('@/components/HomeClient', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('@/components/GuestHome', () => ({
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

const emptyHomeData = {
  hotMovies: [],
  hotTvShows: [],
  hotVarietyShows: [],
  bangumiCalendarData: [],
};

// 构造带 HMAC 签名字段的登录 cookie 头
const loginCookieHeader = () =>
  `user_auth=${encodeURIComponent(
    JSON.stringify({ username: 'alice', signature: 'abc' }),
  )}`;

const getRenderedComponents = async () => {
  const Home = (await import('./page')).default;
  const element = await Home();
  // Home 的直接子节点：HomeClient（已登录）或 GuestHome（访客）
  return element;
};

describe('Home page initial data', () => {
  let GuestHome: typeof import('@/components/GuestHome').default;
  let HomeClient: typeof import('@/components/HomeClient').default;

  beforeAll(async () => {
    GuestHome = (await import('@/components/GuestHome')).default;
    HomeClient = (await import('@/components/HomeClient')).default;
  });

  beforeEach(() => {
    mockHeaders.mockReset();
    mockGetServerInitialHomeData.mockReset();
    mockGetServerInitialGuestHomeData.mockReset().mockResolvedValue(undefined);
  });

  it('renders GuestHome with SSR preloaded guest data for requests without a cookie', async () => {
    const guestInitialData = {
      source: {
        key: 'iqiyizyapi.com',
        name: '爱奇艺',
        api: 'https://iqiyizyapi.com/api.php/provide/vod/',
      },
      categories: [{ type_id: 1, type_name: '电影' }],
      initialCategory: 1,
      initialList: {
        items: [
          {
            id: 'g1',
            title: '访客预加载影片',
            poster: '',
            year: '2026',
            type_name: '电影',
            remarks: 'HD',
          },
        ],
        meta: { page: 1, pagecount: 1, total: 1, limit: 20 },
      },
    };
    mockHeaders.mockReturnValue({ get: () => null });
    mockGetServerInitialGuestHomeData.mockResolvedValueOnce(guestInitialData);

    const element = await getRenderedComponents();

    expect(mockGetServerInitialHomeData).not.toHaveBeenCalled();
    expect(mockGetServerInitialGuestHomeData).toHaveBeenCalledTimes(1);
    expect(element.type).toBe(GuestHome);
    expect(element.props.initialData).toEqual(guestInitialData);
  });

  it('renders GuestHome when the cookie has no username/signature', async () => {
    mockHeaders.mockReturnValue({ get: () => 'user_auth=%7B%7D' });

    const element = await getRenderedComponents();

    expect(mockGetServerInitialHomeData).not.toHaveBeenCalled();
    expect(mockGetServerInitialGuestHomeData).toHaveBeenCalledTimes(1);
    expect(element.type).toBe(GuestHome);
  });

  it('falls back to undefined initialData when guest server preloading fails', async () => {
    const consoleError = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    mockHeaders.mockReturnValue({ get: () => null });
    mockGetServerInitialGuestHomeData.mockRejectedValueOnce(
      new Error('guest cache failed'),
    );

    try {
      const element = await getRenderedComponents();

      expect(element.type).toBe(GuestHome);
      expect(element.props.initialData).toBeUndefined();
    } finally {
      consoleError.mockRestore();
    }
  });

  it('uses the SSR initial-data reader for authenticated requests', async () => {
    mockHeaders.mockReturnValue({ get: loginCookieHeader });
    mockGetServerInitialHomeData.mockResolvedValue(initialHomeData);

    const element = await getRenderedComponents();

    expect(mockGetServerInitialHomeData).toHaveBeenCalledTimes(1);
    expect(element.type).toBe(HomeClient);
    expect(element.props.initialHomeData).toEqual(initialHomeData);
  });

  it('falls back to empty data when server preloading fails', async () => {
    const consoleError = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    mockHeaders.mockReturnValue({ get: loginCookieHeader });
    mockGetServerInitialHomeData.mockRejectedValue(new Error('cache failed'));

    try {
      const element = await getRenderedComponents();

      expect(element.type).toBe(HomeClient);
      expect(element.props.initialHomeData).toEqual(emptyHomeData);
    } finally {
      consoleError.mockRestore();
    }
  });
});

export {};
