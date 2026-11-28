import {
  type PlaybackQualityArtLike,
  buildDecodeLagDiagnosis,
  installPlaybackQualityMonitor,
} from './playbackQualityMonitor';

function createMockVideo(initial?: {
  total?: number;
  dropped?: number;
  bufferedEnd?: number;
  playbackRate?: number;
  paused?: boolean;
}) {
  let total = initial?.total ?? 0;
  let dropped = initial?.dropped ?? 0;
  let bufferedEnd = initial?.bufferedEnd ?? 20;
  const listeners = new Map<string, Set<EventListener>>();

  const video = {
    paused: initial?.paused ?? false,
    ended: false,
    seeking: false,
    readyState: 4,
    currentTime: 5,
    playbackRate: initial?.playbackRate ?? 1,
    get buffered() {
      return {
        length: bufferedEnd > 0 ? 1 : 0,
        start: () => 0,
        end: () => bufferedEnd,
      } as TimeRanges;
    },
    getVideoPlaybackQuality: () => ({
      totalVideoFrames: total,
      droppedVideoFrames: dropped,
      corruptedVideoFrames: 0,
      creationTime: 0,
    }),
    addEventListener(type: string, fn: EventListener) {
      const set = listeners.get(type) ?? new Set();
      set.add(fn);
      listeners.set(type, set);
    },
    removeEventListener(type: string, fn: EventListener) {
      listeners.get(type)?.delete(fn);
    },
    emit(type: string) {
      listeners.get(type)?.forEach((fn) => fn(new Event(type)));
    },
    setFrames(nextTotal: number, nextDropped: number) {
      total = nextTotal;
      dropped = nextDropped;
    },
    setBufferedEnd(end: number) {
      bufferedEnd = end;
    },
  };

  return video;
}

function createMockArt(video: ReturnType<typeof createMockVideo>) {
  const notices: string[] = [];
  let currentNotice = '';
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();

  const art: PlaybackQualityArtLike & {
    notices: string[];
    emit: (event: string) => void;
  } = {
    video: video as unknown as HTMLVideoElement,
    notice: {
      get show() {
        return currentNotice;
      },
      set show(val: string) {
        currentNotice = val;
        if (val) notices.push(val);
      },
    },
    on(event, fn) {
      const set = listeners.get(event) ?? new Set();
      set.add(fn);
      listeners.set(event, set);
    },
    off(event, fn) {
      listeners.get(event)?.delete(fn);
    },
    notices,
    emit(event) {
      listeners.get(event)?.forEach((fn) => fn());
    },
  };

  return art;
}

describe('buildDecodeLagDiagnosis', () => {
  it('prioritizes super-resolution, then danmaku, then high playback rate, then decoder', () => {
    expect(
      buildDecodeLagDiagnosis({
        dropRate: 0.3,
        superResolutionEnabled: true,
        danmakuActive: true,
        playbackRate: 2,
      }).cause,
    ).toBe('super_resolution');

    expect(
      buildDecodeLagDiagnosis({
        dropRate: 0.25,
        superResolutionEnabled: false,
        danmakuActive: true,
        playbackRate: 2,
      }).cause,
    ).toBe('danmaku');

    expect(
      buildDecodeLagDiagnosis({
        dropRate: 0.25,
        superResolutionEnabled: false,
        danmakuActive: false,
        playbackRate: 1.5,
      }).cause,
    ).toBe('high_playback_rate');

    expect(
      buildDecodeLagDiagnosis({
        dropRate: 0.25,
        superResolutionEnabled: false,
        danmakuActive: false,
        playbackRate: 1,
      }).cause,
    ).toBe('decoder');
  });
});

describe('installPlaybackQualityMonitor', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('triggers decode lag notice after 3 consecutive high-drop intervals with healthy buffer', () => {
    let clock = 10_000;
    const video = createMockVideo({ total: 100, dropped: 0, bufferedEnd: 30 });
    const art = createMockArt(video);
    const onDecodeLag = jest.fn();

    const monitor = installPlaybackQualityMonitor(art, {
      isSuperResolutionEnabled: () => true,
      onDecodeLag,
      sampleIntervalMs: 2000,
      now: () => clock,
    });

    // 第 1 个窗口：60 帧中掉 18 帧（30%）
    video.setFrames(160, 18);
    clock += 2000;
    jest.advanceTimersByTime(2000);
    expect(onDecodeLag).not.toHaveBeenCalled();

    // 第 2 个窗口：仍高丢帧
    video.setFrames(220, 36);
    clock += 2000;
    jest.advanceTimersByTime(2000);
    expect(onDecodeLag).not.toHaveBeenCalled();

    // 第 3 个窗口：确认解码/渲染瓶颈
    video.setFrames(280, 54);
    clock += 2000;
    jest.advanceTimersByTime(2000);
    expect(onDecodeLag).toHaveBeenCalledTimes(1);
    expect(onDecodeLag.mock.calls[0][0].cause).toBe('super_resolution');
    expect(art.notices[0]).toContain('视频超分');
    expect(monitor.getSnapshot().decodeLagDetected).toBe(true);

    // 冷却期内不重复弹窗
    video.setFrames(340, 72);
    clock += 2000;
    jest.advanceTimersByTime(2000);
    expect(onDecodeLag).toHaveBeenCalledTimes(1);

    monitor.dispose();
  });

  it('does not blame decode lag when forward buffer is empty (network underrun)', () => {
    const video = createMockVideo({ total: 100, dropped: 0, bufferedEnd: 5.2 });
    const art = createMockArt(video);
    const onDecodeLag = jest.fn();

    const monitor = installPlaybackQualityMonitor(art, {
      onDecodeLag,
      sampleIntervalMs: 2000,
    });

    for (let i = 1; i <= 4; i += 1) {
      video.setFrames(100 + i * 60, i * 25);
      jest.advanceTimersByTime(2000);
    }

    expect(onDecodeLag).not.toHaveBeenCalled();
    expect(monitor.getSnapshot().decodeLagDetected).toBe(false);
    monitor.dispose();
  });

  it('resets baseline on seeking so seek-induced frame drops are ignored', () => {
    const video = createMockVideo({ total: 100, dropped: 0, bufferedEnd: 40 });
    const art = createMockArt(video);
    const onDecodeLag = jest.fn();

    const monitor = installPlaybackQualityMonitor(art, {
      onDecodeLag,
      sampleIntervalMs: 2000,
    });

    // 连续两次高丢帧
    video.setFrames(160, 20);
    jest.advanceTimersByTime(2000);
    video.setFrames(220, 40);
    jest.advanceTimersByTime(2000);

    // 拖动进度条重置基线
    video.emit('seeking');
    video.setFrames(280, 60);
    jest.advanceTimersByTime(2000);
    expect(onDecodeLag).not.toHaveBeenCalled();

    monitor.dispose();
  });
});
