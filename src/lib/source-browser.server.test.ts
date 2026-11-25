/**
 * @jest-environment node
 */

const mockDbGetCache = jest.fn();
const mockDbSetCache = jest.fn();

jest.mock('@/lib/db', () => ({
  db: {
    getCache: (...args: unknown[]) => mockDbGetCache(...args),
    setCache: (...args: unknown[]) => mockDbSetCache(...args),
  },
}));

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

async function flushMicrotasks(ticks = 10) {
  for (let i = 0; i < ticks; i += 1) {
    await Promise.resolve();
  }
}

describe('source-browser.server cache', () => {
  let clearSourceBrowserMemoryCache: typeof import('./source-browser.server').clearSourceBrowserMemoryCache;
  let fetchSourceCategories: typeof import('./source-browser.server').fetchSourceCategories;
  let fetchSourceVideoList: typeof import('./source-browser.server').fetchSourceVideoList;
  let warmSourceBrowserSources: typeof import('./source-browser.server').warmSourceBrowserSources;
  let originalFetch: typeof global.fetch;

  const sampleSource = {
    key: 'test-site',
    name: '测试源',
    api: 'https://source.example/api.php/provide/vod/',
  };

  beforeAll(async () => {
    originalFetch = global.fetch;
    ({
      clearSourceBrowserMemoryCache,
      fetchSourceCategories,
      fetchSourceVideoList,
      warmSourceBrowserSources,
    } = await import('./source-browser.server'));
  });

  beforeEach(() => {
    clearSourceBrowserMemoryCache();
    global.fetch = jest.fn();
    mockDbGetCache.mockReset().mockResolvedValue(null);
    mockDbSetCache.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('caches source categories in memory across repeated requests', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        class: [{ type_id: 1, type_name: '电影' }],
      }),
    });

    const first = await fetchSourceCategories(sampleSource);
    const second = await fetchSourceCategories(sampleSource);

    expect(first).toEqual([{ type_id: 1, type_name: '电影' }]);
    expect(second).toEqual(first);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('returns legacy unwrapped cached video list from DB without hitting upstream', async () => {
    const dbCachedList = {
      items: [
        {
          id: 'v1',
          title: '缓存影片',
          poster: 'https://img.example/1.jpg',
          year: '2026',
          type_name: '电影',
          remarks: 'HD',
        },
      ],
      meta: { page: 1, pagecount: 2, total: 1, limit: 20 },
    };
    mockDbGetCache.mockResolvedValueOnce(dbCachedList);

    const result = await fetchSourceVideoList(sampleSource, '1', 1);

    expect(result).toEqual(dbCachedList);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('returns stale DB cache immediately and triggers one deduplicated background refresh', async () => {
    const staleList = {
      items: [
        {
          id: 'old-1',
          title: '旧缓存影片',
          poster: 'https://img.example/old.jpg',
          year: '2025',
          type_name: 'AI短剧',
          remarks: '更新至01集',
        },
      ],
      meta: { page: 1, pagecount: 1, total: 1, limit: 20 },
    };
    mockDbGetCache.mockResolvedValueOnce({
      data: staleList,
      freshUntil: Date.now() - 1000,
    });

    const deferred = createDeferred<{
      ok: boolean;
      json: () => Promise<unknown>;
    }>();
    (global.fetch as jest.Mock).mockReturnValue(deferred.promise);

    // 两次连续请求都应立即拿到旧缓存，只触发 1 次后台刷新
    const first = await fetchSourceVideoList(sampleSource, '57', 1);
    const second = await fetchSourceVideoList(sampleSource, '57', 1);

    expect(first).toEqual(staleList);
    expect(second).toEqual(staleList);
    await flushMicrotasks();
    expect(global.fetch).toHaveBeenCalledTimes(1);

    deferred.resolve({
      ok: true,
      json: async () => ({
        list: [
          {
            vod_id: 'new-1',
            vod_name: '新影片',
            vod_pic: 'https://img.example/new.jpg',
            vod_year: '2026',
            type_name: 'AI短剧',
            vod_remarks: '更新至02集',
          },
        ],
        page: 1,
        pagecount: 3,
        total: 50,
        limit: 20,
      }),
    });
    await flushMicrotasks();

    const third = await fetchSourceVideoList(sampleSource, '57', 1);
    expect(third.items[0].id).toBe('new-1');
    expect(mockDbSetCache).toHaveBeenCalledWith(
      'source-browser-list-v1:test-site:57:1',
      expect.objectContaining({
        data: expect.objectContaining({
          items: [expect.objectContaining({ id: 'new-1', title: '新影片' })],
        }),
        freshUntil: expect.any(Number),
      }),
      6 * 60 * 60,
    );
  });

  it('enforces failure cooldown for stale background refreshes', async () => {
    const startedAt = Date.now();
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(startedAt);

    const staleCategories = [{ type_id: 57, type_name: 'AI短剧' }];
    mockDbGetCache.mockResolvedValueOnce({
      data: staleCategories,
      freshUntil: startedAt - 1000,
    });

    (global.fetch as jest.Mock)
      .mockRejectedValueOnce(new Error('upstream down'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          class: [{ type_id: 57, type_name: 'AI短剧' }],
        }),
      });

    // 首次命中过期 DB 缓存，后台刷新失败后进入 30s 冷却期
    const first = await fetchSourceCategories(sampleSource);
    expect(first).toEqual(staleCategories);
    await flushMicrotasks();
    expect(global.fetch).toHaveBeenCalledTimes(1);

    // 冷却期内再次读取仍返回缓存且不再打上游
    const cooling = await fetchSourceCategories(sampleSource);
    expect(cooling).toEqual(staleCategories);
    await flushMicrotasks();
    expect(global.fetch).toHaveBeenCalledTimes(1);

    // 冷却期过后再读触发重新刷新
    nowSpy.mockReturnValue(startedAt + 35_000);
    await fetchSourceCategories(sampleSource);
    await flushMicrotasks();
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('warmSourceBrowserSources refreshes categories and adult default AI短剧 page 1', async () => {
    const adultSource = {
      key: 'jp98.vip',
      name: '黄果',
      api: 'https://jp98.vip/api.php/provide/vod/',
    };
    const guestSource = {
      key: 'iqiyizyapi.com',
      name: '爱奇艺',
      api: 'https://iqiyizyapi.com/api.php/provide/vod/',
    };

    (global.fetch as jest.Mock).mockImplementation(async (url: string) => {
      if (url.includes('jp98.vip') && url.includes('ac=list')) {
        return {
          ok: true,
          json: async () => ({
            class: [
              { type_id: 20, type_name: '国产' },
              { type_id: 57, type_name: 'AI短剧' },
            ],
          }),
        };
      }
      if (url.includes('jp98.vip') && url.includes('ac=videolist&t=57&pg=1')) {
        return {
          ok: true,
          json: async () => ({
            list: [{ vod_id: 'a1', vod_name: '短剧1', vod_pic: '' }],
          }),
        };
      }
      if (url.includes('iqiyizyapi.com') && url.includes('ac=list')) {
        throw new Error('guest timeout');
      }
      return { ok: false, status: 500 };
    });

    await warmSourceBrowserSources([
      { source: adultSource, isAdult: true },
      { source: adultSource, isAdult: true }, // 重复条目应去重
      { source: guestSource, isAdult: false }, // 单源失败不应影响黄果源预热
    ]);

    expect(global.fetch).toHaveBeenCalledTimes(3);
    expect(
      (global.fetch as jest.Mock).mock.calls.map((c) => String(c[0])),
    ).toEqual(
      expect.arrayContaining([
        'https://jp98.vip/api.php/provide/vod/?ac=list',
        'https://jp98.vip/api.php/provide/vod/?ac=videolist&t=57&pg=1',
        'https://iqiyizyapi.com/api.php/provide/vod/?ac=list',
      ]),
    );

    // 预热后直接读取应命中内存，不再发请求
    const cats = await fetchSourceCategories(adultSource);
    const list = await fetchSourceVideoList(adultSource, '57', 1);
    expect(cats).toHaveLength(2);
    expect(list.items[0].id).toBe('a1');
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it('warmSourceBrowserSources warms up to maxWarmCategories categories per source', async () => {
    const guestSource = {
      key: 'iqiyizyapi.com',
      name: '爱奇艺',
      api: 'https://iqiyizyapi.com/api.php/provide/vod/',
    };

    (global.fetch as jest.Mock).mockImplementation(async (url: string) => {
      if (url.includes('ac=list')) {
        return {
          ok: true,
          json: async () => ({
            class: [
              { type_id: 1, type_name: '电影' },
              { type_id: 2, type_name: '连续剧' },
              { type_id: 3, type_name: '综艺' },
            ],
          }),
        };
      }
      if (url.includes('t=2')) {
        return { ok: false, status: 502 };
      }
      if (url.includes('ac=videolist')) {
        return {
          ok: true,
          json: async () => ({
            list: [{ vod_id: 'v1', vod_name: '片源', vod_pic: '' }],
          }),
        };
      }
      return { ok: false, status: 500 };
    });

    await warmSourceBrowserSources([
      { source: guestSource, isAdult: false, maxWarmCategories: 3 },
    ]);

    expect(
      (global.fetch as jest.Mock).mock.calls.map((c) => String(c[0])),
    ).toEqual([
      'https://iqiyizyapi.com/api.php/provide/vod/?ac=list',
      'https://iqiyizyapi.com/api.php/provide/vod/?ac=videolist&t=1&pg=1',
      'https://iqiyizyapi.com/api.php/provide/vod/?ac=videolist&t=2&pg=1',
      'https://iqiyizyapi.com/api.php/provide/vod/?ac=videolist&t=3&pg=1',
    ]);

    // 成功的第 1、3 分类应直接命中内存
    await fetchSourceVideoList(guestSource, '1', 1);
    await fetchSourceVideoList(guestSource, '3', 1);
    expect(global.fetch).toHaveBeenCalledTimes(4);
  });
});

export {};
