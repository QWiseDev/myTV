import {
  getDevicePerformance,
  getOptimizedDanmakuConfig,
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

it('非 Chromium 浏览器无 performance.memory 时按中性内存分分级', () => {
  const perfSpy = jest.spyOn(navigator, 'hardwareConcurrency', 'get');
  perfSpy.mockReturnValue(4);
  const result = getDevicePerformance(false);
  expect(result.score).toBeCloseTo(0.75, 5);
  expect(result.level).toBe('high');
  perfSpy.mockRestore();
});

it('不再随机丢弃正常弹幕，并确保 beforeEmit 严格返回 true', () => {
  jest.spyOn(Math, 'random').mockReturnValue(0.99);
  const config = getOptimizedDanmakuConfig(true);
  expect(config.lockTime).toBe(1);
  expect(config.maxLength).toBe(200);

  for (let i = 0; i < 20; i += 1) {
    expect(config.filter?.({ text: `正常弹幕${i}`, time: i })).toBe(true);
  }
  expect(config.filter?.({ text: 'a'.repeat(201), time: 1 })).toBe(false);
  expect(config.filter?.({ text: '😀😃😄😁😆😅', time: 1 })).toBe(false);

  const longEmit = { text: 'b'.repeat(210), time: 1 };
  expect(config.beforeEmit?.(longEmit)).toBe(true);
  expect(longEmit.text.length).toBe(203);
  jest.restoreAllMocks();
});
