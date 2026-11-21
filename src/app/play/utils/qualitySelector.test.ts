import {
  type ArtPlayerControlCapable,
  type LevelAwareHls,
  type QualityControlArt,
  addQualityControl,
  addSpeedControl,
  createQualityControls,
  getSwitchableLevels,
} from './qualitySelector';

type MockHls = LevelAwareHls & {
  levels?: Array<{ height?: number; width?: number; bitrate?: number }>;
  on: jest.Mock;
  off: jest.Mock;
};

// 与 hls.js 行为对齐：自动模式下 currentLevel 仍是当前播放档位（不是 -1）
function createHls(
  levels: MockHls['levels'],
  currentLevel = -1,
  overrides: Partial<MockHls> = {},
): MockHls {
  return {
    levels,
    currentLevel,
    loadLevel: currentLevel,
    autoLevelEnabled: currentLevel === -1,
    on: jest.fn(),
    off: jest.fn(),
    ...overrides,
  };
}

type Listener = () => void;

type MockVideo = {
  videoHeight: number;
  playbackRate: number;
  hls?: LevelAwareHls | null;
  addEventListener: jest.Mock;
  removeEventListener: jest.Mock;
  emit: (event: string) => void;
};

type MockArt = ArtPlayerControlCapable &
  QualityControlArt & {
    controls: { add: jest.Mock; remove: jest.Mock; update: jest.Mock };
    template: { $controlsRight?: HTMLElement };
    __remove: jest.Mock;
    __emit: (event: string) => void;
    __handlers: (event: string) => Listener[];
  };

function createVideo(height = 0): MockVideo {
  const listeners = new Map<string, Set<Listener>>();
  return {
    videoHeight: height,
    playbackRate: 1,
    addEventListener: jest.fn((event: string, handler: Listener) => {
      const set = listeners.get(event) ?? new Set<Listener>();
      set.add(handler);
      listeners.set(event, set);
    }),
    removeEventListener: jest.fn((event: string, handler: Listener) => {
      listeners.get(event)?.delete(handler);
    }),
    emit: (event: string) => {
      listeners.get(event)?.forEach((handler) => handler());
    },
  };
}

function createArt(playbackRate = 1): MockArt {
  const remove = jest.fn();
  const listeners = new Map<string, Set<Listener>>();
  const art: Partial<MockArt> = {
    controls: {
      add: jest.fn((_option: unknown) => ({ remove })),
      remove: jest.fn(),
      update: jest.fn((_option: unknown) => ({ remove })),
    },
    template: {},
    playbackRate,
    video: undefined,
    on: jest.fn((event: string, handler: Listener) => {
      const set = listeners.get(event) ?? new Set<Listener>();
      set.add(handler);
      listeners.set(event, set);
    }),
    off: jest.fn((event: string, handler: Listener) => {
      listeners.get(event)?.delete(handler);
    }),
    __remove: remove,
    __handlers: (event: string) => Array.from(listeners.get(event) ?? []),
    __emit: (event: string) => {
      listeners.get(event)?.forEach((handler) => handler());
    },
  };
  return art as MockArt;
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
      art.video = createVideo(720) as unknown as HTMLVideoElement;
      const hls = createHls([{ height: 0, bitrate: 0 }]);
      addQualityControl(art, hls);
      const option = art.controls.add.mock.calls[0][0] as { html: string };
      expect(option.html).toContain('720P');
    });

    test('无 hls 但已有视频分辨率时也显示', () => {
      const art = createArt();
      art.video = createVideo(480) as unknown as HTMLVideoElement;
      addQualityControl(art, undefined);
      const option = art.controls.add.mock.calls[0][0] as { html: string };
      expect(option.html).toContain('480P');
    });

    test('无任何分辨率来源且无 hls 时不注入', () => {
      const art = createArt();
      expect(addQualityControl(art, undefined)).toBeUndefined();
      expect(art.controls.add).not.toHaveBeenCalled();
    });

    test('多码率源注入控制栏按钮，自动模式显示「智能」并高亮智能项', () => {
      const art = createArt();
      // ABR 模式下 currentLevel 已经是当前播放档位（1），不是 -1
      const hls = createHls(MULTI_LEVELS, 1, { autoLevelEnabled: true });
      const cleanup = addQualityControl(art, hls);

      expect(cleanup).toBeInstanceOf(Function);
      expect(art.controls.add).toHaveBeenCalledTimes(1);

      const option = art.controls.add.mock.calls[0][0] as {
        name: string;
        position: string;
        html: string;
        selector: Array<{ html: string; value: string; default?: boolean }>;
      };
      expect(option.name).toBe('quality');
      expect(option.position).toBe('right');
      // 自动模式不能显示成手动锁定的档位
      expect(option.html).toContain('智能');
      expect(option.html).not.toContain('1080P');
      expect(option.selector.map((s) => s.html)).toEqual([
        '智能 · 1080P',
        '1080P',
        '720P',
      ]);
      expect(option.selector[0].default).toBe(true);
      expect(option.selector.slice(1).some((s) => s.default)).toBe(false);
    });

    test('手动档位时按钮显示具体分辨率，且只高亮该档', () => {
      const art = createArt();
      const hls = createHls(MULTI_LEVELS, 1); // 手动选中 1080P 档
      addQualityControl(art, hls);
      const option = art.controls.add.mock.calls[0][0] as {
        html: string;
        selector: Array<{ html: string; default?: boolean }>;
      };
      expect(option.html).toContain('1080P');
      expect(option.selector[0].default).toBe(false);
      expect(option.selector[1].default).toBe(true);
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

  describe('createQualityControls', () => {
    function setup(video: MockVideo, hls: LevelAwareHls | undefined) {
      const art = createArt();
      art.video = video as unknown as HTMLVideoElement;
      video.hls = hls;
      return art;
    }

    test('hls 换实例后（换集复用播放器）按新实例重建控件', () => {
      const video = createVideo(1080);
      const hlsA = createHls(MULTI_LEVELS);
      const art = setup(video, hlsA);
      const controls = createQualityControls(art);

      expect(art.controls.add).toHaveBeenCalledTimes(1);
      expect(hlsA.on).toHaveBeenCalledWith(
        'hlsLevelSwitched',
        expect.any(Function),
      );

      // 同源下一集：artplayer 复用玩家，只替换 hls 实例
      const hlsB = createHls(MULTI_LEVELS, 0, { autoLevelEnabled: true });
      video.hls = hlsB;
      art.__emit('restart');

      expect(art.controls.remove).toHaveBeenCalledWith('quality');
      expect(art.controls.add).toHaveBeenCalledTimes(2);
      // 旧实例的事件必须解绑，避免选档写到已销毁实例
      expect(hlsA.off).toHaveBeenCalledWith(
        'hlsLevelSwitched',
        expect.any(Function),
      );
      const latest = art.controls.add.mock.calls[1][0] as {
        selector: Array<{ html: string }>;
      };
      expect(latest.selector.map((s) => s.html)).toContain('1080P');

      controls.dispose();
    });

    test('新 hls 尚未解析档位时先卸载旧控件，解析完再挂载', () => {
      const video = createVideo(1080);
      const hlsA = createHls(MULTI_LEVELS);
      const art = setup(video, hlsA);
      const controls = createQualityControls(art);
      expect(art.controls.add).toHaveBeenCalledTimes(1);

      const hlsB = createHls([], -1);
      video.hls = hlsB;
      art.__emit('restart');

      // 旧控件（绑定已销毁实例）被移除，但新控件要等档位信息
      expect(art.controls.remove).toHaveBeenCalledWith('quality');
      expect(art.controls.add).toHaveBeenCalledTimes(1);

      const onManifest = (hlsB.on as jest.Mock).mock.calls.find(
        (call) => call[0] === 'hlsManifestParsed',
      )?.[1] as Listener;
      expect(onManifest).toBeInstanceOf(Function);

      hlsB.levels = MULTI_LEVELS;
      onManifest();

      expect(art.controls.add).toHaveBeenCalledTimes(2);
      controls.dispose();
    });

    test('dispose 后不再响应事件', () => {
      const video = createVideo(1080);
      const art = setup(video, createHls(MULTI_LEVELS));
      const controls = createQualityControls(art);
      controls.dispose();

      const hlsB = createHls(MULTI_LEVELS);
      video.hls = hlsB;
      controls.sync();

      expect(art.controls.add).toHaveBeenCalledTimes(1);
      expect(art.off).toHaveBeenCalledWith('restart', expect.any(Function));
      expect(video.removeEventListener).toHaveBeenCalled();
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

    test('外部改倍速（设置面板/长按快进）时同步按钮与面板高亮', () => {
      const video = createVideo();
      const art = createArt(1);
      art.video = video as unknown as HTMLVideoElement;
      const cleanup = addSpeedControl(art);

      // 与 artplayer 一致：art.playbackRate 反映 video.playbackRate
      video.playbackRate = 2;
      art.playbackRate = 2;
      video.emit('ratechange');

      expect(art.controls.update).toHaveBeenCalled();
      const updateOption = art.controls.update.mock.calls.at(-1)?.[0] as {
        html: string;
        selector: Array<{ html: string; default?: boolean }>;
      };
      expect(updateOption.html).toContain('2.0X');
      expect(
        updateOption.selector.find((s) => s.html === '2.0X')?.default,
      ).toBe(true);

      cleanup?.();
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
