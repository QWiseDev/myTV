import {
  loadDanmakuConfigFromStorage,
  saveDanmakuConfigToStorage,
} from './danmakuConfig';

beforeEach(() => localStorage.clear());
it('损坏的缓存不会导致播放器初始化失败', () => {
  localStorage.setItem('danmaku_modes', '{bad');
  localStorage.setItem('danmaku_margin', 'null');
  localStorage.setItem('danmaku_speed', 'NaN');
  expect(loadDanmakuConfigFromStorage()).toMatchObject({
    modes: [0, 1, 2],
    margin: [10, '75%'],
    speed: 5,
  });
});
it('完整保存模式、边距和播放同步参数', () => {
  saveDanmakuConfigToStorage({
    modes: [0],
    margin: [20, '50%'],
    antiOverlap: false,
    synchronousPlayback: false,
  });
  expect(loadDanmakuConfigFromStorage()).toMatchObject({
    modes: [0],
    margin: [20, '50%'],
    antiOverlap: false,
    synchronousPlayback: false,
  });
});
