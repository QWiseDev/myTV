import { ClientCache } from './client-cache';
import {
  danmakuMediaKey,
  DEFAULT_DANMAKU_FILTERS,
  fetchSharedDanmakuSelection,
  matchesDanmakuFilters,
  normalizeDanmakuComments,
  readDanmakuFilters,
  readDanmakuSelection,
  saveDanmakuSelection,
  syncSharedDanmakuSelection,
} from './danmaku';

beforeEach(() => localStorage.clear());

it('按插件语义转换顶部/底部、保留黑色、过滤非法时间并去重', () => {
  const raw = [
    { p: '2,5,25,0', m: '顶部' },
    { p: '1,4,25,16777215', m: '底部' },
    { p: '2,5,25,0', m: '顶部' },
    { p: '-1,1,25,0', m: '坏数据' },
    { p: 'NaN,1,25,0', m: '坏数据' },
    { m: '缺少时间' },
  ];
  expect(normalizeDanmakuComments(raw)).toEqual([
    { text: '底部', time: 1, mode: 2, color: '#ffffff' },
    { text: '顶部', time: 2, mode: 1, color: '#000000' },
  ]);
});

it('手动选择按影片、年份和集数隔离，可恢复自动匹配', () => {
  const media = danmakuMediaKey('同名电影', '2026', 123);
  saveDanmakuSelection(media, 0, { episodeId: '1', title: '第一集' });
  expect(readDanmakuSelection(media, 0)?.episodeId).toBe('1');
  expect(readDanmakuSelection(media, 1)).toBeNull();
  expect(
    readDanmakuSelection(danmakuMediaKey('同名电影', '2025', 456), 0),
  ).toBeNull();
  saveDanmakuSelection(media, 0, null);
  expect(readDanmakuSelection(media, 0)).toBeNull();
});

it('屏蔽词为字面量匹配，屏蔽位置遵循插件语义', () => {
  expect(
    matchesDanmakuFilters(
      { text: 'AD 广告' },
      { ...DEFAULT_DANMAKU_FILTERS, keywords: ['ad'] },
    ),
  ).toBe(false);
  expect(
    matchesDanmakuFilters(
      { mode: 1 },
      { ...DEFAULT_DANMAKU_FILTERS, blockTop: true },
    ),
  ).toBe(false);
  expect(
    matchesDanmakuFilters(
      { mode: 2 },
      { ...DEFAULT_DANMAKU_FILTERS, blockTop: true },
    ),
  ).toBe(true);
  localStorage.setItem('player_danmaku_filters_v1', '{bad');
  expect(readDanmakuFilters()).toEqual(DEFAULT_DANMAKU_FILTERS);
});

describe('共享弹幕选择（其他用户的默认选择）', () => {
  const originalFetch = global.fetch;
  const media = danmakuMediaKey('共享影片', '2026', 9);

  beforeEach(() => {
    ClientCache.clearMemory();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  function ok(json: unknown) {
    return { ok: true, json: async () => json } as Response;
  }

  it('读取其他用户的选择；无效数据与网络失败返回 null', async () => {
    global.fetch = jest.fn(async (url: RequestInfo | URL) => {
      // key 形如 danmaku-shared-sel:<media>:<集数>，仅集数为 8 的记录有值
      const href = decodeURIComponent(String(url));
      return ok({
        data: href.endsWith(':8')
          ? { episodeId: 'ep-9', title: '第9集' }
          : null,
      });
    }) as typeof fetch;

    await expect(fetchSharedDanmakuSelection(media, 8)).resolves.toEqual({
      episodeId: 'ep-9',
      title: '第9集',
    });
    await expect(fetchSharedDanmakuSelection(media, 0)).resolves.toBeNull();

    // 未缓存过的 key 走网络：网络失败返回 null，不抛错
    global.fetch = jest.fn().mockRejectedValue(new Error('network'));
    await expect(fetchSharedDanmakuSelection(media, 7)).resolves.toBeNull();
  });

  it('写入共享选择；恢复自动匹配时删除', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    global.fetch = jest.fn(
      async (url: RequestInfo | URL, init?: RequestInit) => {
        calls.push({ url: String(url), init });
        return ok({ success: true });
      },
    ) as typeof fetch;

    await syncSharedDanmakuSelection(media, 2, {
      episodeId: 'ep-3',
      title: '第3集',
    });
    const write = calls[0];
    expect(write.init?.method).toBe('POST');
    const body = JSON.parse(String(write.init?.body));
    expect(body.key).toContain('danmaku-shared-sel');
    expect(body.data).toEqual({ episodeId: 'ep-3', title: '第3集' });
    expect(body.expireSeconds).toBeGreaterThan(0);

    await syncSharedDanmakuSelection(media, 2, null);
    expect(calls[1].init?.method).toBe('DELETE');
    expect(calls[1].url).toContain('danmaku-shared-sel');
  });
});
