import {
  type PrefetchHlsLike,
  type PrefetchSignals,
  createFragmentPrefetcher,
  resolvePrefetchConcurrency,
} from './fragmentPrefetcher';

function createFakeHls(options?: {
  live?: boolean;
  maxBufferLength?: number;
  fragCount?: number;
  byteRange?: boolean;
}) {
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  const fragCount = options?.fragCount ?? 8;
  const fragments = Array.from({ length: fragCount }, (_, i) => ({
    sn: i,
    level: 0,
    url: `https://cdn.example.com/seg-${i}.ts`,
    start: i * 5,
    duration: 5,
    type: 'main',
    ...(options?.byteRange ? { byteRange: [i * 1000, (i + 1) * 1000] } : {}),
  }));

  const hls: PrefetchHlsLike & {
    emit: (event: string, data?: unknown) => void;
  } = {
    levels: [
      {
        details: {
          live: options?.live ?? false,
          fragments,
        },
      },
    ],
    config: {
      maxBufferLength: options?.maxBufferLength ?? 60,
      fragLoadPolicy: { default: { maxLoadTimeMs: 30_000 } },
    },
    on(event, listener) {
      const set = listeners.get(event) ?? new Set();
      set.add(listener);
      listeners.set(event, set);
    },
    off(event, listener) {
      listeners.get(event)?.delete(listener);
    },
    emit(event, data) {
      listeners.get(event)?.forEach((fn) => fn(event, data));
    },
  };

  return { hls, fragments };
}

function createFakeMedia(initial?: {
  currentTime?: number;
  bufferedRanges?: Array<[number, number]>;
}) {
  let currentTime = initial?.currentTime ?? 0;
  let ranges = initial?.bufferedRanges ?? [];
  const listeners = new Map<string, Set<EventListener>>();

  const media = {
    get currentTime() {
      return currentTime;
    },
    set currentTime(val: number) {
      currentTime = val;
    },
    get buffered() {
      return {
        length: ranges.length,
        start: (i: number) => ranges[i][0],
        end: (i: number) => ranges[i][1],
      } as TimeRanges;
    },
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
    setBuffered(next: Array<[number, number]>) {
      ranges = next;
    },
  };

  return media;
}

function createDeferredResponse(bytes = 1024, ok = true) {
  let resolveFetch!: (res: Response) => void;
  let rejectFetch!: (err: unknown) => void;
  const promise = new Promise<Response>((resolve, reject) => {
    resolveFetch = resolve;
    rejectFetch = reject;
  });
  const payload = new Uint8Array(bytes).fill(0x47).buffer;
  return {
    promise,
    resolve: () =>
      resolveFetch({
        ok,
        status: ok ? 200 : 503,
        arrayBuffer: async () => payload,
      } as Response),
    reject: (err: unknown) => rejectFetch(err),
    payload,
  };
}

describe('resolvePrefetchConcurrency', () => {
  it('disables prefetch on balanced mode, saveData, or memory pressure', () => {
    expect(
      resolvePrefetchConcurrency(
        { speedTier: 'very_slow', memoryPressure: 'low', strategy: 'balanced' },
        { isMobile: false },
      ),
    ).toBe(0);
    expect(
      resolvePrefetchConcurrency(
        { speedTier: 'very_slow', memoryPressure: 'medium', strategy: 'auto' },
        { isMobile: false },
      ),
    ).toBe(0);
    expect(
      resolvePrefetchConcurrency(
        { speedTier: 'very_slow', memoryPressure: 'low', strategy: 'auto' },
        { isMobile: false, saveData: true },
      ),
    ).toBe(0);
  });

  it('uses 1-ahead pipeline for fast/normal sources and scales up for slow/very_slow', () => {
    expect(
      resolvePrefetchConcurrency(
        { speedTier: 'fast', memoryPressure: 'low', strategy: 'auto' },
        { isMobile: false },
      ),
    ).toBe(1);
    expect(
      resolvePrefetchConcurrency(
        { speedTier: 'normal', memoryPressure: 'low', strategy: 'auto' },
        { isMobile: true },
      ),
    ).toBe(1);
    expect(
      resolvePrefetchConcurrency(
        { speedTier: 'slow', memoryPressure: 'low', strategy: 'auto' },
        { isMobile: false },
      ),
    ).toBe(2);
    expect(
      resolvePrefetchConcurrency(
        { speedTier: 'very_slow', memoryPressure: 'low', strategy: 'auto' },
        { isMobile: false },
      ),
    ).toBe(3);
    expect(
      resolvePrefetchConcurrency(
        { speedTier: 'very_slow', memoryPressure: 'low', strategy: 'auto' },
        { isMobile: true },
      ),
    ).toBe(2);
    expect(
      resolvePrefetchConcurrency(
        { speedTier: 'normal', memoryPressure: 'low', strategy: 'auto' },
        { isMobile: false, historicallySlow: true },
      ),
    ).toBe(2);
  });
});

describe('createFragmentPrefetcher', () => {
  it('yields during startup first fragment, then pipelines 1 ahead on fast sources', () => {
    const requestedUrls: string[] = [];
    const fetchImpl = jest.fn((url: RequestInfo | URL) => {
      requestedUrls.push(String(url));
      return new Promise<Response>(() => undefined);
    }) as unknown as typeof fetch;

    const prefetcher = createFragmentPrefetcher({
      isMobile: false,
      getSignals: () => ({
        speedTier: 'fast',
        memoryPressure: 'low',
        strategy: 'auto',
      }),
      fetchImpl,
    });

    const { hls, fragments } = createFakeHls();
    const media = createFakeMedia();
    prefetcher.attach(hls, media as unknown as HTMLMediaElement);

    // 起播首片期间让路，不发起预取，全部带宽留给 seg-0
    hls.emit('hlsFragLoading', { frag: fragments[0] });
    expect(requestedUrls).toEqual([]);
    expect(prefetcher.getStats().yielding).toBe(true);

    // 首片下载完成后解除让路；下一片开始加载时启用 1 路流水线预取
    hls.emit('hlsFragLoaded', { frag: fragments[0] });
    expect(prefetcher.getStats().yielding).toBe(false);

    hls.emit('hlsFragLoading', { frag: fragments[1] });
    expect(requestedUrls).toEqual(['https://cdn.example.com/seg-2.ts']);
    expect(prefetcher.getStats().concurrency).toBe(1);

    prefetcher.dispose();
  });

  it('prefetches upcoming fragments concurrently on slow sources and serves claims with real timings', async () => {
    let clock = 1000;
    const signals: PrefetchSignals = {
      speedTier: 'slow',
      memoryPressure: 'low',
      strategy: 'auto',
    };
    const requestedUrls: string[] = [];
    const deferreds = new Map<
      string,
      ReturnType<typeof createDeferredResponse>
    >();
    const fetchImpl = jest.fn((url: RequestInfo | URL) => {
      const urlStr = String(url);
      requestedUrls.push(urlStr);
      const d = createDeferredResponse(2048);
      deferreds.set(urlStr, d);
      return d.promise;
    }) as unknown as typeof fetch;

    const onActivate = jest.fn();
    const prefetcher = createFragmentPrefetcher({
      isMobile: false,
      getSignals: () => signals,
      resolveUrl: (u) => `${u}?token=1`,
      onActivate,
      fetchImpl,
      perfNow: () => clock,
    });

    const { hls, fragments } = createFakeHls();
    prefetcher.attach(hls);

    // 首片让路并完成
    hls.emit('hlsFragLoading', { frag: fragments[0] });
    expect(requestedUrls).toEqual([]);
    hls.emit('hlsFragLoaded', { frag: fragments[0] });

    // 加载第 1 片 -> 慢源并发 2 路预取第 2、3 片
    hls.emit('hlsFragLoading', { frag: fragments[1] });
    expect(onActivate).toHaveBeenCalledWith(2);
    expect(requestedUrls).toEqual([
      'https://cdn.example.com/seg-2.ts?token=1',
      'https://cdn.example.com/seg-3.ts?token=1',
    ]);

    // 第 2 片完成
    clock = 1800;
    deferreds.get('https://cdn.example.com/seg-2.ts?token=1')?.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));

    // 空出并发槽位后自动续预取第 4 片（lookahead = concurrency + 1 = 3）
    expect(requestedUrls).toContain('https://cdn.example.com/seg-4.ts?token=1');

    // loader 领取第 2 片
    const claim = prefetcher.claim('https://cdn.example.com/seg-2.ts');
    expect(claim).not.toBeNull();
    if (!claim) throw new Error('expected claim');
    const result = await claim.promise;
    expect(result.bytes).toBe(2048);
    expect(result.startedAt).toBe(1000);
    expect(result.endAt).toBe(1800);
    // 领取后缓存条目被移除，不重复命中
    expect(prefetcher.claim('https://cdn.example.com/seg-2.ts')).toBeNull();
    expect(prefetcher.getStats().hits).toBe(1);

    prefetcher.dispose();
  });

  it('skips live streams and byte-range fragments', () => {
    const fetchImpl = jest.fn() as unknown as typeof fetch;
    const prefetcher = createFragmentPrefetcher({
      isMobile: false,
      getSignals: () => ({
        speedTier: 'very_slow',
        memoryPressure: 'low',
        strategy: 'auto',
      }),
      fetchImpl,
    });

    const live = createFakeHls({ live: true });
    prefetcher.attach(live.hls);
    live.hls.emit('hlsFragLoaded', { frag: live.fragments[0] });
    live.hls.emit('hlsFragLoading', { frag: live.fragments[1] });
    expect(fetchImpl).not.toHaveBeenCalled();

    const byteRange = createFakeHls({ byteRange: true });
    prefetcher.attach(byteRange.hls);
    byteRange.hls.emit('hlsFragLoaded', { frag: byteRange.fragments[0] });
    byteRange.hls.emit('hlsFragLoading', { frag: byteRange.fragments[1] });
    expect(fetchImpl).not.toHaveBeenCalled();

    prefetcher.dispose();
  });

  it('aborts stale prefetches and yields for urgent post-seek fragment when seeking to unbuffered area', () => {
    const abortedSignals: AbortSignal[] = [];
    const requestedUrls: string[] = [];
    const fetchImpl = jest.fn((url: RequestInfo | URL, init?: RequestInit) => {
      requestedUrls.push(String(url));
      if (init?.signal) abortedSignals.push(init.signal);
      return new Promise<Response>(() => undefined);
    }) as unknown as typeof fetch;

    const prefetcher = createFragmentPrefetcher({
      isMobile: false,
      getSignals: () => ({
        speedTier: 'slow',
        memoryPressure: 'low',
        strategy: 'auto',
      }),
      fetchImpl,
    });

    const { hls, fragments } = createFakeHls({ fragCount: 20 });
    const media = createFakeMedia({
      currentTime: 0,
      bufferedRanges: [[0, 10]],
    });
    prefetcher.attach(hls, media as unknown as HTMLMediaElement);
    hls.emit('hlsFragLoading', { frag: fragments[1] });
    expect(abortedSignals).toHaveLength(2);
    expect(abortedSignals.every((s) => !s.aborted)).toBe(true);

    // 拖动到未缓冲的 60s（第 12 片）：立即中止旧预取并对目标首片让路
    media.currentTime = 60;
    media.emit('seeking');
    expect(abortedSignals[0].aborted).toBe(true);
    expect(abortedSignals[1].aborted).toBe(true);
    expect(prefetcher.claim(fragments[2].url)).toBeNull();
    expect(prefetcher.getStats().yielding).toBe(true);

    // 拖动后的首个目标分片（seg-12）下载期间不发预取
    const countBeforeSeekFrag = requestedUrls.length;
    hls.emit('hlsFragLoading', { frag: fragments[12] });
    expect(requestedUrls).toHaveLength(countBeforeSeekFrag);

    // 目标分片完成后解除让路，seg-13 立即恢复并发预取
    hls.emit('hlsFragLoaded', { frag: fragments[12] });
    hls.emit('hlsFragLoading', { frag: fragments[13] });
    expect(requestedUrls.slice(countBeforeSeekFrag)).toEqual([
      'https://cdn.example.com/seg-14.ts',
      'https://cdn.example.com/seg-15.ts',
    ]);

    prefetcher.dispose();
  });

  it('does not yield when seeking inside an already-buffered range', () => {
    const requestedUrls: string[] = [];
    const fetchImpl = jest.fn((url: RequestInfo | URL) => {
      requestedUrls.push(String(url));
      return new Promise<Response>(() => undefined);
    }) as unknown as typeof fetch;

    const prefetcher = createFragmentPrefetcher({
      isMobile: false,
      getSignals: () => ({
        speedTier: 'fast',
        memoryPressure: 'low',
        strategy: 'auto',
      }),
      fetchImpl,
    });

    const { hls, fragments } = createFakeHls({ fragCount: 15 });
    const media = createFakeMedia({
      currentTime: 5,
      bufferedRanges: [[0, 40]],
    });
    prefetcher.attach(hls, media as unknown as HTMLMediaElement);

    // 拖到 20s，前向还有 20s 缓冲，无需让路
    media.currentTime = 20;
    media.emit('seeking');
    expect(prefetcher.getStats().yielding).toBe(false);

    hls.emit('hlsFragLoading', { frag: fragments[8] });
    expect(requestedUrls).toEqual(['https://cdn.example.com/seg-9.ts']);

    prefetcher.dispose();
  });

  it('scales concurrency down when switching from aggressive back to auto on a fast source', () => {
    let strategy: PrefetchSignals['strategy'] = 'aggressive';
    const fetchImpl = jest.fn(
      () => new Promise<Response>(() => undefined),
    ) as unknown as typeof fetch;

    const prefetcher = createFragmentPrefetcher({
      isMobile: false,
      getSignals: () => ({
        speedTier: 'fast',
        memoryPressure: 'low',
        strategy,
      }),
      fetchImpl,
    });

    const { hls, fragments } = createFakeHls({ fragCount: 10 });
    prefetcher.attach(hls);
    hls.emit('hlsFragLoaded', { frag: fragments[0] });
    hls.emit('hlsFragLoading', { frag: fragments[1] });
    expect(prefetcher.getStats().concurrency).toBe(3);

    strategy = 'auto';
    hls.emit('hlsFragLoading', { frag: fragments[2] });
    expect(prefetcher.getStats().concurrency).toBe(1);

    prefetcher.dispose();
  });

  it('rejects claim promise when prefetch fetch fails so loader can fall back', async () => {
    const deferred = createDeferredResponse(0, false);
    const fetchImpl = jest.fn(
      () => deferred.promise,
    ) as unknown as typeof fetch;

    const prefetcher = createFragmentPrefetcher({
      isMobile: false,
      getSignals: () => ({
        speedTier: 'slow',
        memoryPressure: 'low',
        strategy: 'auto',
      }),
      fetchImpl,
    });

    const { hls, fragments } = createFakeHls({ fragCount: 4 });
    prefetcher.attach(hls);
    hls.emit('hlsFragLoaded', { frag: fragments[0] });
    hls.emit('hlsFragLoading', { frag: fragments[1] });

    const claim = prefetcher.claim(fragments[2].url);
    expect(claim).not.toBeNull();
    if (!claim) throw new Error('expected claim');
    deferred.resolve(); // HTTP 503
    await expect(claim.promise).rejects.toThrow('HTTP 503');

    prefetcher.dispose();
  });
});
