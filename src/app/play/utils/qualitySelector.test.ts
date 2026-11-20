import {
  type ArtPlayerControlCapable,
  addQualityControl,
  addSpeedControl,
  getSwitchableLevels,
} from './qualitySelector';

type MockHls = {
  levels?: Array<{ height?: number; width?: number; bitrate?: number }>;
  currentLevel?: number;
  loadLevel?: number;
  autoLevelEnabled?: boolean;
  on: jest.Mock;
  off: jest.Mock;
};

function createHls(levels: MockHls['levels'], currentLevel = -1): MockHls {
  return {
    levels,
    currentLevel,
    loadLevel: -1,
    autoLevelEnabled: true,
    on: jest.fn(),
    off: jest.fn(),
  };
}

type MockArt = ArtPlayerControlCapable & {
  controls: { add: jest.Mock; remove: jest.Mock };
  template: { $controlsRight?: HTMLElement };
  __remove: jest.Mock;
};

function createVideo(height = 0) {
  return {
    videoHeight: height,
    playbackRate: 1,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  } as unknown as HTMLVideoElement;
}

function createArt(playbackRate = 1): MockArt {
  const remove = jest.fn();
  return {
    controls: {
      add: jest.fn((_option: unknown) => ({ remove })),
      remove: jest.fn(),
    },
    template: {},
    playbackRate,
    video: undefined,
    __remove: remove,
  } as MockArt;
}

const MULTI_LEVELS = [
  { height: 720, width: 1280, bitrate: 800000 },
  { height: 1080, width: 1920, bitrate: 2437000 },
];

describe('qualitySelector', () => {
  describe('getSwitchableLevels', () => {
    test('单码率源（仅一档）不提供画质切换', () => {
      expect(
        getSwitchableLevels(createHls([{ height: 1080, bitrate: 2400000 }])),
      ).toEqual([]);
      // 单码率且 hls.js 未解析出 height 的常见情形
      expect(
        getSwitchableLevels(createHls([{ height: 0, bitrate: 0 }])),
      ).toEqual([]);
    });

    test('多码率源返回全部档位，按分辨率高到低排序', () => {
      const levels = getSwitchableLevels(createHls(MULTI_LEVELS));
      expect(levels.map((l) => l.label)).toEqual(['1080P', '720P']);
    });

    test('过滤无分辨率且无码率的无效档', () => {
      const levels = getSwitchableLevels(
        createHls([{ height: 0, bitrate: 0 }, ...MULTI_LEVELS]),
      );
      expect(levels).toHaveLength(2);
    });

    test('hls 实例缺失或 levels 为空时安全返回', () => {
      expect(getSwitchableLevels(null)).toEqual([]);
      expect(getSwitchableLevels(undefined)).toEqual([]);
      expect(getSwitchableLevels(createHls([]))).toEqual([]);
    });
  });

  describe('addQualityControl', () => {
    test('单码率源也显示画质按钮，展示该档分辨率且不可切换', () => {
      const art = createArt();
      const hls = createHls([{ height: 1080, bitrate: 2400000 }]);
      const cleanup = addQualityControl(art, hls);

      expect(cleanup).toBeInstanceOf(Function);
      expect(art.controls.add).toHaveBeenCalledTimes(1);
      const option = art.controls.add.mock.calls[0][0] as {
        html: string;
        selector: Array<{ html: string }>;
        tooltip?: string;
      };
      expect(option.html).toContain('1080P');
      expect(option.selector.map((s) => s.html)).toEqual(['1080P']);
      // 不再设置 tooltip：它会悬浮在面板上遮挡选项
      expect(option.tooltip).toBeUndefined();
    });

    test('单码率且 hls 无 height 时回退到 video 实际分辨率', () => {
      const art = createArt();
      art.video = createVideo(720);
      const hls = createHls([{ height: 0, bitrate: 0 }]);
      addQualityControl(art, hls);
      const option = art.controls.add.mock.calls[0][0] as { html: string };
      expect(option.html).toContain('720P');
    });

    test('无 hls 但已有视频分辨率时也显示', () => {
      const art = createArt();
      art.video = createVideo(480);
      addQualityControl(art, undefined);
      const option = art.controls.add.mock.calls[0][0] as { html: string };
      expect(option.html).toContain('480P');
    });

    test('无任何分辨率来源且无 hls 时不注入', () => {
      const art = createArt();
      expect(addQualityControl(art, undefined)).toBeUndefined();
      expect(art.controls.add).not.toHaveBeenCalled();
    });

    test('多码率源注入控制栏按钮，默认显示「智能」并含档位面板', () => {
      const art = createArt();
      const hls = createHls(MULTI_LEVELS);
      const cleanup = addQualityControl(art, hls);

      expect(cleanup).toBeInstanceOf(Function);
      expect(art.controls.add).toHaveBeenCalledTimes(1);

      const option = art.controls.add.mock.calls[0][0] as {
        name: string;
        position: string;
        html: string;
        selector: Array<{ html: string; value: string }>;
      };
      expect(option.name).toBe('quality');
      expect(option.position).toBe('right');
      expect(option.html).toContain('智能');
      expect(option.selector.map((s) => s.html)).toEqual([
        '智能',
        '1080P',
        '720P',
      ]);
    });

    test('手动档位时按钮显示具体分辨率', () => {
      const art = createArt();
      const hls = createHls(MULTI_LEVELS, 1); // 直接选中 1080P 档
      addQualityControl(art, hls);
      const option = art.controls.add.mock.calls[0][0] as { html: string };
      expect(option.html).toContain('1080P');
    });

    test('选择档位写入 hls.currentLevel；选智能写 -1', () => {
      const art = createArt();
      const hls = createHls(MULTI_LEVELS);
      addQualityControl(art, hls);
      const option = art.controls.add.mock.calls[0][0] as {
        onSelect: (item: { value: string; html: string }) => void;
      };

      option.onSelect({ value: '1', html: '1080P' });
      expect(hls.currentLevel).toBe(1);

      option.onSelect({ value: 'auto', html: '智能' });
      expect(hls.currentLevel).toBe(-1);
    });

    test('清理时移除按钮并解绑档位事件', () => {
      const art = createArt();
      const hls = createHls(MULTI_LEVELS);
      const cleanup = addQualityControl(art, hls);
      expect(hls.on).toHaveBeenCalledWith(
        'hlsLevelSwitched',
        expect.any(Function),
      );

      cleanup?.();
      expect(art.controls.remove).toHaveBeenCalledWith('quality');
      expect(art.__remove).toHaveBeenCalled();
      expect(hls.off).toHaveBeenCalledWith(
        'hlsLevelSwitched',
        expect.any(Function),
      );
    });
  });

  describe('addSpeedControl', () => {
    test('注入倍速按钮，默认显示当前倍速', () => {
      const art = createArt(1);
      const cleanup = addSpeedControl(art);

      expect(cleanup).toBeInstanceOf(Function);
      const option = art.controls.add.mock.calls[0][0] as {
        name: string;
        html: string;
        selector: Array<{ html: string; value: string }>;
      };
      expect(option.name).toBe('speed');
      expect(option.html).toContain('1.0X');
      expect(option.selector.map((s) => s.html)).toEqual([
        '3.0X',
        '2.0X',
        '1.5X',
        '1.25X',
        '1.0X',
        '0.75X',
        '0.5X',
      ]);
    });

    test('选择倍速写入 playbackRate', () => {
      const art = createArt(1);
      addSpeedControl(art);
      const option = art.controls.add.mock.calls[0][0] as {
        onSelect: (item: { value: string; html: string }) => void;
      };

      option.onSelect({ value: '1.5', html: '1.5X' });
      expect(art.playbackRate).toBe(1.5);
    });

    test('清理时移除按钮', () => {
      const art = createArt(2);
      const cleanup = addSpeedControl(art);
      cleanup?.();
      expect(art.controls.remove).toHaveBeenCalledWith('speed');
      expect(art.__remove).toHaveBeenCalled();
    });
  });
});
