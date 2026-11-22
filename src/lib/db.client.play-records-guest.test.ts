/**
 * 访客（未登录）门控：播放记录与收藏的读写必须完全旁路网络请求，
 * 避免 fetchWithAuth 收到 401 后自动跳转登录页。
 */

export {};

describe('db.client 访客门控', () => {
  const originalFetch = global.fetch;

  const mockGetAuthInfo = jest.fn<{ username: string } | null, []>();

  jest.mock('@/lib/auth', () => ({
    getAuthInfoFromBrowserCookie: mockGetAuthInfo,
  }));

  beforeEach(() => {
    mockGetAuthInfo.mockReset().mockReturnValue(null);
    global.fetch = jest.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    localStorage.clear();
    jest.resetModules();
    jest.restoreAllMocks();
  });

  describe('播放记录', () => {
    it('访客读取分页播放记录返回空页且不发请求', async () => {
      const { getPlayRecordsPage } = await import('@/lib/db.client');

      const page = await getPlayRecordsPage({ pageSize: 12 });

      expect(page.records).toEqual({});
      expect(page.hasMore).toBe(false);
      expect(page.total).toBe(0);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('访客读取全部播放记录返回空对象且不发请求', async () => {
      const { getAllPlayRecords } = await import('@/lib/db.client');

      await expect(getAllPlayRecords()).resolves.toEqual({});
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('访客保存播放记录静默跳过且不发请求', async () => {
      const { savePlayRecord } = await import('@/lib/db.client');

      await expect(
        savePlayRecord('iqiyizyapi.com', '123', {
          title: '测试',
          source_name: '爱奇艺',
          cover: '',
          year: '2026',
          index: 1,
          total_episodes: 1,
          play_time: 0,
          total_time: 0,
          save_time: Date.now(),
          search_title: '测试',
        }),
      ).resolves.toBeUndefined();
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe('收藏', () => {
    it('访客读取收藏返回空且不发请求', async () => {
      const { getAllFavorites } = await import('@/lib/db.client');

      await expect(getAllFavorites()).resolves.toEqual({});
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('访客保存收藏静默跳过且不发请求', async () => {
      const { saveFavorite } = await import('@/lib/db.client');

      await expect(
        saveFavorite('iqiyizyapi.com', '123', {
          title: '测试',
          source_name: '爱奇艺',
          cover: '',
          year: '2026',
          total_episodes: 1,
          save_time: Date.now(),
        }),
      ).resolves.toBeUndefined();
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe('追更', () => {
    it('访客拉取追更提醒直接返回 null 且不发请求', async () => {
      const { fetchWatchingUpdatesFromServer } =
        await import('@/lib/watching-updates');

      await expect(fetchWatchingUpdatesFromServer()).resolves.toBeNull();
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });
});
