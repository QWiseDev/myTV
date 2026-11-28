import {
  type BufferMemoryPressure,
  type DynamicBufferArtLike,
  type DynamicBufferHlsLike,
  type DynamicBufferSettingItem,
  classifySourceSpeedTier,
  clearDynamicBufferSpeedHints,
  computeDynamicBufferTarget,
  computeRebufferTargetSeconds,
  getForwardBufferedSeconds,
  installDynamicBuffer,
  readBufferStrategyPreference,
  saveBufferStrategyPreference,
} from './dynamicBuffer';

function createMockVideo(overrides: Partial<HTMLVideoElement> = {}) {
  const listeners = new Map<string, Set<EventListener>>();
  let paused = false;
  let playbackRate = 1;
  let readyState = 4;
  let seeking = false;
  let ended = false;
  let currentTime = 10;
  let preload = 'metadata';

  const video = {
    get paused() {
      return paused;
    },
    set paused(v: boolean) {
      paused = v;
    },
    get playbackRate() {
      return playbackRate;
    },
    set playbackRate(v: number) {
      playbackRate = v;
    },
    get readyState() {
      return readyState;
    },
    set readyState(v: number) {
      readyState = v;
    },
    get seeking() {
      return seeking;
    },
    set seeking(v: boolean) {
      seeking = v;
    },
    get ended() {
      return ended;
    },
    set ended(v: boolean) {
      ended = v;
    },
    get currentTime() {
      return currentTime;
    },
    set currentTime(v: number) {
      currentTime = v;
    },
    get preload() {
      return preload;
    },
    set preload(v: string) {
      preload = v;
    },
    buffered: {
      length: 1,
      start: () => 0,
      end: () => 50,
    },
    addEventListener: jest.fn((event: string, listener: EventListener) => {
      const set = listeners.get(event) ?? new Set<EventListener>();
      set.add(listener);
      listeners.set(event, set);
    }),
    removeEventListener: jest.fn((event: string, listener: EventListener) => {
      listeners.get(event)?.delete(listener);
    }),
    emit(event: string) {
      listeners.get(event)?.forEach((fn) => fn(new Event(event)));
    },
    ...overrides,
  };

  return video as unknown as HTMLVideoElement & {
    paused: boolean;
    playbackRate: number;
    readyState: number;
    seeking: boolean;
    ended: boolean;
    currentTime: number;
    hls?: DynamicBufferHlsLike | null;
    emit: (event: string) => void;
  };
}

function createMockHls(
  initialConfig: Record<string, unknown> = {},
): DynamicBufferHlsLike & {
  emit: (event: string, data?: unknown) => void;
  listenerCount: (event: string) => number;
} {
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();

  return {
    config: {
      maxBufferLength: 60,
      maxMaxBufferLength: 180,
      maxBufferSize: 80 * 1000 * 1000,
      backBufferLength: 30,
      fragLoadPolicy: {
        default: {
          maxTimeToFirstByteMs: 10000,
          maxLoadTimeMs: 90000,
        },
      },
      ...initialConfig,
    },
    levels: [{ maxBitrate: 3_000_000 }],
    currentLevel: 0,
    loadLevel: 0,
    on: jest.fn((event: string, fn: (...args: unknown[]) => void) => {
      const set = listeners.get(event) ?? new Set();
      set.add(fn);
      listeners.set(event, set);
    }),
    off: jest.fn((event: string, fn: (...args: unknown[]) => void) => {
      listeners.get(event)?.delete(fn);
    }),
    emit(event: string, data?: unknown) {
      listeners.get(event)?.forEach((fn) => fn(event, data));
    },
    listenerCount(event: string) {
      return listeners.get(event)?.size ?? 0;
    },
  };
}

function createMockArt(video: ReturnType<typeof createMockVideo>) {
  const artListeners = new Map<string, Set<(...args: unknown[]) => void>>();
  const settingItems = new Map<
    string,
    DynamicBufferSettingItem & { tooltip?: string }
  >();
  const settingFind = jest.fn((name: string) => settingItems.get(name));
  const settingUpdate = jest.fn((opt: DynamicBufferSettingItem) => {
    if (opt.name) {
      const existing = settingItems.get(opt.name) ?? {};
      settingItems.set(opt.name, { ...existing, ...opt });
    }
  });
  const settingAdd = jest.fn((opt: DynamicBufferSettingItem) => {
    if (opt.name) {
      settingItems.set(opt.name, opt);
    }
  });

  const art: DynamicBufferArtLike & {
    emit: (event: string, ...args: unknown[]) => void;
    getSetting: (name: string) => DynamicBufferSettingItem | undefined;
    settingFind: jest.Mock;
    settingUpdate: jest.Mock;
    settingAdd: jest.Mock;
  } = {
    video,
    notice: { show: '' },
    setting: {
      add: settingAdd,
      update: settingUpdate,
      find: settingFind,
    },
    on: jest.fn((event: string, fn: (...args: unknown[]) => void) => {
      const set = artListeners.get(event) ?? new Set();
      set.add(fn);
      artListeners.set(event, set);
    }),
    off: jest.fn((event: string, fn: (...args: unknown[]) => void) => {
      artListeners.get(event)?.delete(fn);
    }),
    emit(event: string, ...args: unknown[]) {
      artListeners.get(event)?.forEach((fn) => fn(...args));
    },
    getSetting(name: string) {
      return settingItems.get(name);
    },
    settingFind,
    settingUpdate,
    settingAdd,
  };

  return art;
}

describe('dynamicBuffer preferences & helpers', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('reads and persists valid buffer strategy preferences', () => {
    expect(readBufferStrategyPreference()).toBe('auto');

    localStorage.setItem('player_buffer_strategy_v1', 'invalid');
    expect(readBufferStrategyPreference()).toBe('auto');

    saveBufferStrategyPreference('aggressive');
    expect(readBufferStrategyPreference()).toBe('aggressive');

    saveBufferStrategyPreference('balanced');
    expect(readBufferStrategyPreference()).toBe('balanced');
  });

  test('getForwardBufferedSeconds finds active buffered range ahead of currentTime', () => {
    const video = createMockVideo();
    video.currentTime = 12;
    Object.defineProperty(video, 'buffered', {
      value: {
        length: 2,
        start: (i: number) => (i === 0 ? 0 : 10),
        end: (i: number) => (i === 0 ? 5 : 42.5),
      },
    });

    expect(getForwardBufferedSeconds(video)).toBeCloseTo(30.5, 2);
  });
});

describe('classifySourceSpeedTier', () => {
  test('classifies fast, normal, slow, and very_slow accurately', () => {
    expect(
      classifySourceSpeedTier({
        ewmaSpeedRatio: 8,
        inFlightSlowRatio: null,
        ewmaTtfbMs: 120,
        recentStallsCount: 0,
        playbackRate: 1,
        sampleCount: 3,
      }),
    ).toBe('fast');

    expect(
      classifySourceSpeedTier({
        ewmaSpeedRatio: 3.2,
        inFlightSlowRatio: null,
        ewmaTtfbMs: 300,
        recentStallsCount: 0,
        playbackRate: 1,
        sampleCount: 3,
      }),
    ).toBe('normal');

    expect(
      classifySourceSpeedTier({
        ewmaSpeedRatio: 1.9,
        inFlightSlowRatio: null,
        ewmaTtfbMs: 400,
        recentStallsCount: 0,
        playbackRate: 1,
        sampleCount: 2,
      }),
    ).toBe('slow');

    expect(
      classifySourceSpeedTier({
        ewmaSpeedRatio: 1.1,
        inFlightSlowRatio: null,
        ewmaTtfbMs: 800,
        recentStallsCount: 0,
        playbackRate: 1,
        sampleCount: 1,
      }),
    ).toBe('very_slow');
  });

  test('accounts for playbackRate when computing effective margin', () => {
    // 2.6x 下载倍速在 1x 下正常，在 2x 倍速播放时仅剩 1.3x 余量 -> 升至 very_slow
    expect(
      classifySourceSpeedTier({
        ewmaSpeedRatio: 2.6,
        inFlightSlowRatio: null,
        ewmaTtfbMs: 250,
        recentStallsCount: 0,
        playbackRate: 2,
        sampleCount: 3,
      }),
    ).toBe('very_slow');
  });

  test('falls back to networkHint before first fragment completes', () => {
    expect(
      classifySourceSpeedTier({
        ewmaSpeedRatio: null,
        inFlightSlowRatio: null,
        ewmaTtfbMs: null,
        recentStallsCount: 0,
        playbackRate: 1,
        sampleCount: 0,
        networkHint: { effectiveType: '3g' },
      }),
    ).toBe('slow');

    expect(
      classifySourceSpeedTier({
        ewmaSpeedRatio: null,
        inFlightSlowRatio: null,
        ewmaTtfbMs: null,
        recentStallsCount: 0,
        playbackRate: 1,
        sampleCount: 0,
        networkHint: { effectiveType: '2g' },
      }),
    ).toBe('very_slow');
  });
});

describe('computeDynamicBufferTarget', () => {
  const desktop = { isMobile: false, isIOS: false, isIOS13: false };
  const android = { isMobile: true, isIOS: false, isIOS13: false };
  const ios = { isMobile: true, isIOS: true, isIOS13: true };

  test('expands forward buffer when source is slow or very_slow', () => {
    const fastPlan = computeDynamicBufferTarget({
      strategy: 'auto',
      deviceInfo: desktop,
      speedTier: 'fast',
      playbackRate: 1,
      isPaused: false,
      isLive: false,
      stallBoostSeconds: 0,
      estimatedBitrateBps: 3_000_000,
      memoryPressure: 'low',
    });
    const slowPlan = computeDynamicBufferTarget({
      strategy: 'auto',
      deviceInfo: desktop,
      speedTier: 'slow',
      playbackRate: 1,
      isPaused: false,
      isLive: false,
      stallBoostSeconds: 0,
      estimatedBitrateBps: 3_000_000,
      memoryPressure: 'low',
    });
    const verySlowPlan = computeDynamicBufferTarget({
      strategy: 'auto',
      deviceInfo: desktop,
      speedTier: 'very_slow',
      playbackRate: 1,
      isPaused: false,
      isLive: false,
      stallBoostSeconds: 0,
      estimatedBitrateBps: 3_000_000,
      memoryPressure: 'low',
    });

    expect(fastPlan.maxBufferLength).toBe(60);
    expect(fastPlan.maxBufferSize).toBe(120 * 1000 * 1000);
    expect(slowPlan.maxBufferLength).toBe(180);
    expect(slowPlan.maxBufferSize).toBe(300 * 1000 * 1000);
    expect(verySlowPlan.maxBufferLength).toBe(300);
    expect(verySlowPlan.maxBufferSize).toBe(450 * 1000 * 1000);
    expect(verySlowPlan.maxTimeToFirstByteMs).toBe(15000);
    expect(slowPlan.tooltip).toContain('慢源增缓');
  });

  test('uses tighter desktop limits when deviceMemory <= 4GB', () => {
    const lowMemDesktop = { ...desktop, deviceMemoryGB: 4 };
    const slowPlan = computeDynamicBufferTarget({
      strategy: 'auto',
      deviceInfo: lowMemDesktop,
      speedTier: 'slow',
      playbackRate: 1,
      isPaused: false,
      isLive: false,
      stallBoostSeconds: 0,
      estimatedBitrateBps: null,
      memoryPressure: 'low',
    });

    expect(slowPlan.maxBufferLength).toBe(120);
    expect(slowPlan.maxBufferSize).toBe(180 * 1000 * 1000);
  });

  test('adds pause prebuffer bonus on slow sources without bloating fast sources', () => {
    const fastPaused = computeDynamicBufferTarget({
      strategy: 'auto',
      deviceInfo: desktop,
      speedTier: 'fast',
      playbackRate: 1,
      isPaused: true,
      isLive: false,
      stallBoostSeconds: 0,
      estimatedBitrateBps: null,
      memoryPressure: 'low',
    });
    const slowPaused = computeDynamicBufferTarget({
      strategy: 'auto',
      deviceInfo: desktop,
      speedTier: 'slow',
      playbackRate: 1,
      isPaused: true,
      isLive: false,
      stallBoostSeconds: 0,
      estimatedBitrateBps: null,
      memoryPressure: 'low',
    });

    expect(fastPaused.maxBufferLength).toBe(60);
    expect(slowPaused.maxBufferLength).toBe(270);
    expect(slowPaused.tooltip).toContain('暂停预缓');
  });

  test('supports modern iOS and Android expansion while honoring memory pressure & quota cap', () => {
    const iosSlow = computeDynamicBufferTarget({
      strategy: 'auto',
      deviceInfo: ios,
      speedTier: 'slow',
      playbackRate: 1,
      isPaused: false,
      isLive: false,
      stallBoostSeconds: 0,
      estimatedBitrateBps: null,
      memoryPressure: 'low',
    });
    expect(iosSlow.maxBufferLength).toBe(60);

    const androidQuotaCapped = computeDynamicBufferTarget({
      strategy: 'auto',
      deviceInfo: android,
      speedTier: 'very_slow',
      playbackRate: 1,
      isPaused: true,
      isLive: false,
      stallBoostSeconds: 30,
      estimatedBitrateBps: null,
      memoryPressure: 'low',
      quotaCapSeconds: 70,
    });
    expect(androidQuotaCapped.maxBufferLength).toBe(70);
    expect(androidQuotaCapped.maxMaxBufferLength).toBe(70);

    const highMem = computeDynamicBufferTarget({
      strategy: 'aggressive',
      deviceInfo: desktop,
      speedTier: 'very_slow',
      playbackRate: 2,
      isPaused: true,
      isLive: false,
      stallBoostSeconds: 60,
      estimatedBitrateBps: 8_000_000,
      memoryPressure: 'high',
    });
    expect(highMem.maxBufferLength).toBe(3);
    expect(highMem.maxMaxBufferLength).toBe(30);
    expect(highMem.maxBufferSize).toBe(12 * 1000 * 1000);
  });
});

describe('installDynamicBuffer runtime controller', () => {
  beforeEach(() => {
    localStorage.clear();
    clearDynamicBufferSpeedHints();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    clearDynamicBufferSpeedHints();
  });

  test('reacts to slow fragments, updates hls.config, and updates tooltip in-place', () => {
    let clock = 10_000;
    const video = createMockVideo();
    const art = createMockArt(video);
    const hls = createMockHls();
    video.hls = hls;

    const controller = installDynamicBuffer(art, {
      deviceInfo: { isMobile: false, isIOS: false, isIOS13: false },
      now: () => clock,
    });

    expect(art.settingAdd).toHaveBeenCalledTimes(1);
    expect(hls.config?.maxBufferLength).toBe(90);

    // 模拟 5s 分片耗时 4.2s（1.19x），触发慢源/极慢强缓（遵循 hls.js FragLoadedData：stats 位于 frag.stats）
    clock = 14_200;
    hls.emit('hlsFragLoaded', {
      frag: {
        sn: 1,
        type: 'main',
        duration: 5,
        stats: {
          loaded: 2_500_000,
          loading: { start: 10_000, first: 11_500, end: 14_200 },
        },
      },
    });

    expect(hls.config?.maxBufferLength).toBe(300);
    expect(hls.config?.maxMaxBufferLength).toBe(480);
    expect(hls.config?.maxBufferSize).toBe(450 * 1000 * 1000);
    expect(hls.config?.fragLoadPolicy?.default?.maxTimeToFirstByteMs).toBe(
      15000,
    );
    expect(art.notice?.show).toContain('300s');
    // 优先原地改 tooltip，不调用 setting.update 重绘整个设置面板
    expect(art.settingUpdate).not.toHaveBeenCalled();
    expect(art.getSetting('dynamic-buffer')?.tooltip).toContain('300s');

    controller.dispose();
  });

  test('ignores <5ms cache hits and aborted fragments', () => {
    const video = createMockVideo();
    const art = createMockArt(video);
    const hls = createMockHls();
    video.hls = hls;

    const controller = installDynamicBuffer(art, {
      deviceInfo: { isMobile: false, isIOS: false, isIOS13: false },
    });

    hls.emit('hlsFragLoaded', {
      frag: {
        sn: 1,
        type: 'main',
        duration: 5,
        stats: {
          loaded: 1_000_000,
          loading: { start: 1000, first: 1001, end: 1002 },
        },
      },
    });
    hls.emit('hlsFragLoaded', {
      frag: {
        sn: 2,
        type: 'main',
        duration: 5,
        stats: {
          aborted: true,
          loaded: 500_000,
          loading: { start: 2000, first: 4000, end: 9000 },
        },
      },
    });

    expect(controller.getSnapshot().sampleCount).toBe(0);
    expect(hls.config?.maxBufferLength).toBe(90);

    controller.dispose();
  });

  test('in-flight watchdog escalates buffer when a segment stalls mid-download', () => {
    jest.useFakeTimers();
    let clock = 1_000;
    const video = createMockVideo();
    const art = createMockArt(video);
    const hls = createMockHls();
    video.hls = hls;

    const controller = installDynamicBuffer(art, {
      deviceInfo: { isMobile: false, isIOS: false, isIOS13: false },
      now: () => clock,
    });

    hls.emit('hlsFragLoading', {
      frag: { sn: 3, type: 'main', duration: 4 },
    });

    // 分片耗时推进至 3.5s（超过 4s * 0.65 且 > 2.5s）
    clock = 4_500;
    jest.advanceTimersByTime(1000);

    expect(hls.config?.maxBufferLength).toBe(300);

    // 下载结束后且无卡顿惩罚，看门狗自动释放，不留空闲定时器
    clock = 4_800;
    hls.emit('hlsFragLoaded', {
      frag: {
        sn: 3,
        type: 'main',
        duration: 4,
        stats: {
          loaded: 500_000,
          loading: { start: 4_600, first: 4_650, end: 4_800 },
        },
      },
    });
    expect(jest.getTimerCount()).toBe(0);

    controller.dispose();
  });

  test('responds to pause pre-buffering, memory pressure, and BUFFER_FULL_ERROR cap', () => {
    let clock = 1_000;
    let pressure: BufferMemoryPressure = 'low';
    const video = createMockVideo();
    const art = createMockArt(video);
    const hls = createMockHls();
    video.hls = hls;

    const controller = installDynamicBuffer(art, {
      deviceInfo: { isMobile: false, isIOS: false, isIOS13: false },
      getMemoryPressure: () => pressure,
      now: () => clock,
    });

    // 慢源 1.8x -> 180s
    clock = 3_800;
    hls.emit('hlsFragLoaded', {
      frag: {
        sn: 1,
        type: 'main',
        duration: 5,
        stats: {
          loaded: 2_000_000,
          loading: { start: 1_000, first: 1_400, end: 3_800 },
        },
      },
    });
    expect(hls.config?.maxBufferLength).toBe(180);

    // 暂停 -> 额外 +90s 预缓
    video.paused = true;
    video.emit('pause');
    expect(hls.config?.maxBufferLength).toBe(270);

    // 内存压力上升 -> 立刻收紧保护，无需重建播放器
    pressure = 'critical';
    controller.setMemoryPressure('critical');
    expect(hls.config?.maxBufferLength).toBe(2);
    expect(hls.config?.maxMaxBufferLength).toBe(10);

    // 恢复低内存压力后恢复动态上限
    pressure = 'low';
    controller.setMemoryPressure('low');
    expect(hls.config?.maxBufferLength).toBe(270);

    // 发生 MSE BUFFER_FULL_ERROR 时锁死会话缓冲硬顶
    hls.emit('hlsError', { details: 'bufferFullError' });
    expect(hls.config?.maxBufferLength).toBeLessThanOrEqual(40);
    expect(hls.config?.maxBufferSize).toBeLessThanOrEqual(150 * 1000 * 1000);
    expect(controller.getSnapshot().quotaCapSeconds).not.toBeNull();

    controller.dispose();
  });

  test('switches strategy from Artplayer settings and rebinds cleanly on restart', () => {
    const video = createMockVideo();
    const art = createMockArt(video);
    const hlsA = createMockHls();
    const hlsB = createMockHls();
    video.hls = hlsA;

    const controller = installDynamicBuffer(art, {
      deviceInfo: { isMobile: false, isIOS: false, isIOS13: false },
    });

    const setting = art.getSetting('dynamic-buffer');
    setting?.onSelect?.({ value: 'aggressive' });
    expect(localStorage.getItem('player_buffer_strategy_v1')).toBe(
      'aggressive',
    );
    expect(hlsA.config?.maxBufferLength).toBe(300);

    // 换集复用播放器时替换 hls 实例
    video.hls = hlsB;
    art.emit('restart');
    expect(hlsA.listenerCount('hlsFragLoaded')).toBe(0);
    expect(hlsB.listenerCount('hlsFragLoaded')).toBe(1);
    expect(hlsB.config?.maxBufferLength).toBe(300);

    art.emit('destroy');
    expect(hlsB.listenerCount('hlsFragLoaded')).toBe(0);
    controller.dispose();
  });

  test('warm-starts next episode on the same slow source and clears hints cleanly', () => {
    let clock = 10_000;
    const video = createMockVideo();
    const art = createMockArt(video);
    const hlsEp1 = createMockHls();
    const hlsEp2 = createMockHls();
    video.hls = hlsEp1;

    const controller = installDynamicBuffer(art, {
      deviceInfo: { isMobile: false, isIOS: false, isIOS13: false },
      getSourceKey: () => 'site-slow',
      getStreamUrl: () => 'https://slow-cdn.example/ep1.m3u8',
      now: () => clock,
    });

    clock = 14_000;
    hlsEp1.emit('hlsFragLoaded', {
      frag: {
        sn: 1,
        type: 'main',
        duration: 5,
        stats: {
          loaded: 2_000_000,
          loading: { start: 10_000, first: 11_200, end: 14_000 },
        },
      },
    });
    expect(hlsEp1.config?.maxBufferLength).toBe(300);

    // 切到同源下一集（新 HLS 实例，清单尚未解析完成），首片尚未加载即热启动至极慢强缓档位，
    // 但由于新会话尚无真实分片/档位到达，hasActiveProgress 应为 false（不误给死链宽限期）
    clock = 20_000;
    hlsEp2.levels = [];
    video.hls = hlsEp2;
    art.emit('restart');
    expect(hlsEp2.config?.maxBufferLength).toBe(300);
    expect(controller.getSnapshot().hasActiveProgress).toBe(false);

    controller.dispose();
  });

  test('shows live buffering rate on waiting >1.5s, clears on playing, and suggests switching on repeated stalls', () => {
    jest.useFakeTimers();
    let clock = 1_000;
    const video = createMockVideo();
    video.readyState = 2;
    const art = createMockArt(video);
    const hls = createMockHls();
    video.hls = hls;

    const controller = installDynamicBuffer(art, {
      deviceInfo: { isMobile: false, isIOS: false, isIOS13: false },
      hasAlternativeSource: () => true,
      now: () => clock,
    });

    // 先测出一个吞吐样本
    clock = 3_500;
    hls.emit('hlsFragLoaded', {
      frag: {
        sn: 1,
        type: 'main',
        duration: 5,
        stats: {
          loaded: 1_250_000,
          loading: { start: 1_000, first: 1_400, end: 3_500 },
        },
      },
    });
    if (art.notice) art.notice.show = '';

    // 第一次卡顿超过 1.5s -> 提示实时缓冲速率，恢复播放后自动清除
    clock = 5_000;
    video.emit('waiting');
    jest.advanceTimersByTime(1500);
    expect(art.notice?.show).toContain('正在缓冲');
    expect(art.notice?.show).toContain('KB/s');

    video.readyState = 4;
    video.emit('playing');
    expect(art.notice?.show).toBe('');

    // 短时间内连续第二次卡顿且仍为极慢 -> 提示可右侧换源
    clock = 10_000;
    video.readyState = 2;
    video.emit('waiting');
    expect(art.notice?.show).toContain('换源');

    controller.dispose();
  });

  test('computeRebufferTargetSeconds enables hysteresis only for slow VOD under low memory pressure', () => {
    expect(
      computeRebufferTargetSeconds({
        speedTier: 'fast',
        strategy: 'auto',
        playbackRate: 1,
        memoryPressure: 'low',
        isLive: false,
        maxBufferLength: 60,
        remainingDurationSeconds: 600,
      }),
    ).toBe(0);

    expect(
      computeRebufferTargetSeconds({
        speedTier: 'slow',
        strategy: 'auto',
        playbackRate: 1,
        memoryPressure: 'low',
        isLive: false,
        maxBufferLength: 180,
        remainingDurationSeconds: 600,
      }),
    ).toBe(8);

    expect(
      computeRebufferTargetSeconds({
        speedTier: 'very_slow',
        strategy: 'auto',
        playbackRate: 1.5,
        memoryPressure: 'low',
        isLive: false,
        maxBufferLength: 300,
        remainingDurationSeconds: 600,
      }),
    ).toBe(18);

    // 临近片尾不再触发攒缓冲暂停
    expect(
      computeRebufferTargetSeconds({
        speedTier: 'very_slow',
        strategy: 'auto',
        playbackRate: 1,
        memoryPressure: 'low',
        isLive: false,
        maxBufferLength: 300,
        remainingDurationSeconds: 5,
      }),
    ).toBe(0);

    // 省流/直播/内存压力下关闭
    expect(
      computeRebufferTargetSeconds({
        speedTier: 'very_slow',
        strategy: 'balanced',
        playbackRate: 1,
        memoryPressure: 'low',
        isLive: false,
        maxBufferLength: 60,
      }),
    ).toBe(0);
    expect(
      computeRebufferTargetSeconds({
        speedTier: 'very_slow',
        strategy: 'auto',
        playbackRate: 1,
        memoryPressure: 'high',
        isLive: false,
        maxBufferLength: 3,
      }),
    ).toBe(0);
  });

  test('pauses to accumulate buffer on slow-source stall and resumes automatically once target is reached', () => {
    jest.useFakeTimers();
    let clock = 1_000;
    let bufferEnd = 10.5;
    const playMock = jest.fn(() => {
      video.paused = false;
      return Promise.resolve();
    });
    const pauseMock = jest.fn(() => {
      video.paused = true;
      video.emit('pause');
    });
    const video = createMockVideo({
      duration: 600,
      buffered: {
        length: 1,
        start: () => 0,
        end: () => bufferEnd,
      } as unknown as TimeRanges,
      pause: pauseMock,
      play: playMock,
    });
    video.currentTime = 10;
    video.readyState = 2;
    const art = createMockArt(video);
    const hls = createMockHls();
    video.hls = hls;

    const controller = installDynamicBuffer(art, {
      deviceInfo: { isMobile: false, isIOS: false, isIOS13: false },
      now: () => clock,
    });

    // 先喂入极慢样本（4s 分片耗时 5s -> ratio 0.8 -> very_slow）
    clock = 6_000;
    hls.emit('hlsFragLoaded', {
      frag: {
        sn: 1,
        type: 'main',
        duration: 4,
        stats: {
          loaded: 400_000,
          loading: { start: 1_000, first: 1_500, end: 6_000 },
        },
      },
    });
    if (art.notice) art.notice.show = '';

    // 仅剩 0.5s 缓冲且触发 waiting -> 自动进入攒缓冲滞回（目标 12s）
    clock = 7_000;
    video.emit('waiting');
    expect(pauseMock).toHaveBeenCalledTimes(1);
    expect(controller.getSnapshot().rebufferHoldActive).toBe(true);
    expect(art.notice?.show).toContain('正在缓冲至 12s');

    // 缓冲增至 18s（前向 8s，未达 12s）-> 仍在攒缓冲
    bufferEnd = 18;
    clock = 10_000;
    video.emit('progress');
    expect(controller.getSnapshot().rebufferHoldActive).toBe(true);
    expect(playMock).not.toHaveBeenCalled();

    // 缓冲增至 23s（前向 13s >= 12s）-> 自动恢复播放
    bufferEnd = 23;
    clock = 12_000;
    video.emit('progress');
    expect(controller.getSnapshot().rebufferHoldActive).toBe(false);
    expect(playMock).toHaveBeenCalledTimes(1);
    expect(art.notice?.show).toContain('恢复播放');

    controller.dispose();
  });

  test('respects manual user play override during rebuffer hold and applies cooldown', () => {
    jest.useFakeTimers();
    let clock = 1_000;
    const pauseMock = jest.fn(() => {
      video.paused = true;
      video.emit('pause');
    });
    const playMock = jest.fn(() => Promise.resolve());
    const video = createMockVideo({
      duration: 600,
      buffered: {
        length: 1,
        start: () => 0,
        end: () => 10.2,
      } as unknown as TimeRanges,
      pause: pauseMock,
      play: playMock,
    });
    video.currentTime = 10;
    video.readyState = 2;
    const art = createMockArt(video);
    const hls = createMockHls();
    video.hls = hls;

    const controller = installDynamicBuffer(art, {
      deviceInfo: { isMobile: false, isIOS: false, isIOS13: false },
      now: () => clock,
    });

    clock = 6_000;
    hls.emit('hlsFragLoaded', {
      frag: {
        sn: 1,
        type: 'main',
        duration: 4,
        stats: {
          loaded: 400_000,
          loading: { start: 1_000, first: 1_500, end: 6_000 },
        },
      },
    });

    clock = 7_000;
    video.emit('waiting');
    expect(controller.getSnapshot().rebufferHoldActive).toBe(true);
    expect(pauseMock).toHaveBeenCalledTimes(1);

    // 用户手动点击播放 -> 立即退出滞回，并在 45s 冷却期内不再强制暂停
    clock = 8_000;
    video.paused = false;
    video.emit('play');
    expect(controller.getSnapshot().rebufferHoldActive).toBe(false);

    clock = 15_000;
    video.emit('waiting');
    expect(controller.getSnapshot().rebufferHoldActive).toBe(false);
    expect(pauseMock).toHaveBeenCalledTimes(1);

    controller.dispose();
  });
});
