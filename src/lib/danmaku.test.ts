import {
  danmakuMediaKey,
  DEFAULT_DANMAKU_FILTERS,
  matchesDanmakuFilters,
  normalizeDanmakuComments,
  readDanmakuFilters,
  readDanmakuSelection,
  saveDanmakuSelection,
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
