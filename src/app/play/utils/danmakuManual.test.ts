import { saveDanmakuFilters } from '@/lib/danmaku';

import {
  createDanmakuRequest,
  fetchExternalDanmaku,
  renderDanmakuList,
} from './danmakuRuntime';

beforeEach(() => localStorage.clear());

it('手动选择具有独立缓存键，走指定剧集接口', async () => {
  const input = {
    enabled: true,
    videoTitle: '影片',
    episodeIndex: 0,
    episodeOffset: 0,
  };
  const automatic = createDanmakuRequest(input);
  const manual = createDanmakuRequest({ ...input, manualEpisodeId: '123' });
  if (!automatic || !manual) throw new Error('预期生成弹幕请求');
  expect(manual.key).not.toBe(automatic.key);
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ danmu: [{ text: 'test', time: 1 }] }),
  });
  await expect(fetchExternalDanmaku(manual)).resolves.toHaveLength(1);
  expect(global.fetch).toHaveBeenCalledWith(
    '/api/danmaku?action=comment&id=123',
    expect.anything(),
  );
});

it('显示阶段统一过滤自动和手动弹幕，不修改原始缓存', () => {
  saveDanmakuFilters({
    keywords: ['广告'],
    blockTop: true,
    blockBottom: false,
    blockColor: false,
  });
  const load = jest.fn();
  const list = [
    { text: '广告', time: 1 },
    { text: '顶部', mode: 1, time: 2 },
    { text: '正常', time: 3 },
  ];
  renderDanmakuList({ plugins: { artplayerPluginDanmuku: { load } } }, list);
  expect(load).toHaveBeenCalledWith([{ text: '正常', time: 3 }]);
  expect(list).toHaveLength(3);
});
