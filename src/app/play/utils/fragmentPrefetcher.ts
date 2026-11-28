/**
 * 全源分级并发分片预取（含起播/拖动让路）
 *
 * hls.js 同一时刻只下载一个媒体分片。本模块在点播播放中提前并发下载
 * 「当前分片之后」的若干分片并缓存在内存，hls.js 请求到这些分片时由自定义 loader
 * 直接从缓存交付（见 hlsAdFilterLoader）：
 * - 快源 / 普通源：1 路流水线预取（总连接 = 2），消除分片间 TTFB 空窗、抗单分片回源抖动；
 * - 慢源 / 历史慢源：2 路并发；极慢源 / 强力模式：桌面 3 路、移动端 2 路；
 * - 起播首片与拖动到未缓冲区域后的首片期间暂停预取，把全部带宽让给当前急需出画的分片；
 * - 仅点播（非直播）、非 byte-range 分片；省流策略、系统省流、内存压力下关闭；
 * - 下载失败时 loader 回退到 hls.js 原生加载，不影响原有重试/切源逻辑。
 */

import { getForwardBufferedSeconds, readNetworkHint } from './dynamicBuffer';

export type PrefetchSpeedTier = 'fast' | 'normal' | 'slow' | 'very_slow';
export type PrefetchMemoryPressure = 'low' | 'medium' | 'high' | 'critical';
export type PrefetchStrategy = 'auto' | 'aggressive' | 'balanced';

export interface PrefetchSignals {
  speedTier: PrefetchSpeedTier;
  memoryPressure: PrefetchMemoryPressure;
  strategy?: PrefetchStrategy;
}

export interface PrefetchedFragment {
  url: string;
  data: ArrayBuffer;
  bytes: number;
  /** performance.now() 口径的真实网络时间点，用于向 hls.js 报告准确测速 */
  startedAt: number;
  firstByteAt: number;
  endAt: number;
}

export interface PrefetchClaim {
  promise: Promise<PrefetchedFragment>;
  /** loader 被 hls.js 中止时调用，放弃尚未完成的下载 */
  cancel: () => void;
}

export interface PrefetchFragmentLike {
  sn?: number | string;
  level?: number;
  url?: string;
  start?: number;
  duration?: number;
  type?: string;
  byteRange?: number[];
}

export interface PrefetchHlsLike {
  levels?: Array<{
    height?: number;
    details?: {
      live?: boolean;
      fragments?: PrefetchFragmentLike[];
    } | null;
  }>;
  config?: {
    maxBufferLength?: number;
    fragLoadPolicy?: { default?: { maxLoadTimeMs?: number } };
  };
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  off?: (event: string, listener: (...args: unknown[]) => void) => void;
}

export interface FragmentPrefetcherOptions {
  isMobile: boolean;
  getSignals: () => PrefetchSignals | null | undefined;
  /** attach 时调用一次：持久化历史表明该源偏慢时，首片即开启预取 */
  isHistoricallySlow?: () => boolean;
  /** 发起请求前改写 URL（如追加防盗链参数），与 loader 保持一致 */
  resolveUrl?: (url: string) => string;
  onActivate?: (concurrency: number) => void;
  fetchImpl?: typeof fetch;
  perfNow?: () => number;
}

export interface FragmentPrefetcherStats {
  active: boolean;
  yielding: boolean;
  concurrency: number;
  started: number;
  hits: number;
  failed: number;
  discarded: number;
  cachedBytes: number;
  pending: number;
}

export interface FragmentPrefetcher {
  attach: (
    hls: PrefetchHlsLike | null | undefined,
    media?: HTMLMediaElement | null,
  ) => void;
  detach: () => void;
  claim: (url: string | undefined | null) => PrefetchClaim | null;
  getStats: () => FragmentPrefetcherStats;
  dispose: () => void;
}

const HLS_FRAG_LOADING = 'hlsFragLoading';
const HLS_FRAG_LOADED = 'hlsFragLoaded';
const HLS_DESTROYING = 'hlsDestroying';
const DESKTOP_BYTE_BUDGET = 120 * 1000 * 1000;
const MOBILE_BYTE_BUDGET = 40 * 1000 * 1000;
const DEFAULT_PREFETCH_TIMEOUT_MS = 90_000;
/** 超出 hls 前向缓冲目标的额外预取余量（秒） */
const HORIZON_SLACK_SECONDS = 10;
/** 起播或拖动后，前向缓冲达到该阈值即视为安全，无需再让路 */
const MIN_YIELD_BUFFER_SECONDS = 3;

interface PrefetchEntry {
  url: string;
  sn: number;
  level: number;
  controller: AbortController;
  status: 'loading' | 'done' | 'error';
  slotReleased: boolean;
  data: ArrayBuffer | null;
  bytes: number;
  startedAt: number;
  firstByteAt: number;
  endAt: number;
  error: unknown;
  settled: Promise<void>;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : null;
}

function hasByteRange(frag: PrefetchFragmentLike): boolean {
  const range = frag.byteRange;
  return Array.isArray(range) && range.length === 2 && range[1] > range[0];
}

function isRangeBuffered(
  media: HTMLMediaElement | null | undefined,
  start: number,
  end: number,
): boolean {
  if (!media?.buffered) return false;
  try {
    for (let i = 0; i < media.buffered.length; i += 1) {
      if (
        media.buffered.start(i) <= start + 0.05 &&
        media.buffered.end(i) >= end - 0.05
      ) {
        return true;
      }
    }
  } catch {
    return false;
  }
  return false;
}

/**
 * 根据测速档位与环境决定预取并发数；0 表示关闭。
 * - 省流/内存压力/系统省流 -> 0
 * - 快源/普通源 -> 1（流水线预取下一片）
 * - 慢源/历史慢源 -> 2
 * - 极慢源/强力模式 -> 桌面 3、移动 2
 */
export function resolvePrefetchConcurrency(
  signals: PrefetchSignals | null | undefined,
  options: {
    isMobile: boolean;
    historicallySlow?: boolean;
    saveData?: boolean;
  },
): number {
  if (options.saveData) return 0;
  if (!signals) return options.historicallySlow ? 2 : 1;
  if (signals.memoryPressure !== 'low') return 0;
  if (signals.strategy === 'balanced') return 0;

  const cap = options.isMobile ? 2 : 3;
  if (signals.strategy === 'aggressive' || signals.speedTier === 'very_slow') {
    return cap;
  }
  if (signals.speedTier === 'slow' || options.historicallySlow) {
    return 2;
  }
  return 1;
}

export function createFragmentPrefetcher(
  options: FragmentPrefetcherOptions,
): FragmentPrefetcher {
  const perfNow =
    options.perfNow ??
    (() =>
      typeof performance !== 'undefined' ? performance.now() : Date.now());
  const fetchImpl =
    options.fetchImpl ??
    (typeof fetch === 'function' ? fetch.bind(globalThis) : undefined);
  const byteBudget = options.isMobile
    ? MOBILE_BYTE_BUDGET
    : DESKTOP_BYTE_BUDGET;

  const entries = new Map<string, PrefetchEntry>();
  let hls: PrefetchHlsLike | null = null;
  let media: HTMLMediaElement | null = null;
  let unbind: (() => void) | null = null;
  let disposed = false;
  let activated = false;
  let historicallySlow = false;
  let concurrency = 0;
  let slowFloor = 0;
  let yieldingForUrgentFrag = true;
  let activeDownloads = 0;
  let currentSn: number | null = null;
  let currentLevel: number | null = null;
  const stats = { started: 0, hits: 0, failed: 0, discarded: 0 };

  const hasHealthyForwardBuffer = () =>
    Boolean(
      media && getForwardBufferedSeconds(media) >= MIN_YIELD_BUFFER_SECONDS,
    );

  const releaseDownloadSlot = (entry: PrefetchEntry) => {
    if (entry.slotReleased) return;
    entry.slotReleased = true;
    activeDownloads = Math.max(0, activeDownloads - 1);
  };

  const discardEntry = (entry: PrefetchEntry) => {
    entries.delete(entry.url);
    if (entry.status === 'loading') {
      entry.controller.abort();
      releaseDownloadSlot(entry);
    }
    stats.discarded += 1;
  };

  const clearAll = () => {
    for (const entry of Array.from(entries.values())) {
      discardEntry(entry);
    }
  };

  const cachedBytes = () => {
    let total = 0;
    entries.forEach((entry) => {
      total += entry.bytes;
    });
    return total;
  };

  const refreshConcurrency = () => {
    const signals = options.getSignals();
    const next = resolvePrefetchConcurrency(signals, {
      isMobile: options.isMobile,
      historicallySlow,
      saveData: readNetworkHint().saveData,
    });
    if (next <= 0) {
      concurrency = 0;
      return 0;
    }

    const isSlowSignal =
      historicallySlow ||
      signals?.speedTier === 'slow' ||
      signals?.speedTier === 'very_slow';
    if (isSlowSignal) {
      // 慢源提档后保留并发下限，避免并发期间单片测速波动引起档位来回振荡
      slowFloor = Math.max(slowFloor, next);
    }
    const target = Math.max(next, slowFloor);
    if (!activated) {
      activated = true;
      options.onActivate?.(target);
    }
    concurrency = target;
    return concurrency;
  };

  const startDownload = (
    frag: PrefetchFragmentLike & { url: string; sn: number },
  ) => {
    if (!fetchImpl) return;
    const controller = new AbortController();
    const entry: PrefetchEntry = {
      url: frag.url,
      sn: frag.sn,
      level: typeof frag.level === 'number' ? frag.level : 0,
      controller,
      status: 'loading',
      slotReleased: false,
      data: null,
      bytes: 0,
      startedAt: perfNow(),
      firstByteAt: 0,
      endAt: 0,
      error: null,
      settled: Promise.resolve(),
    };
    const timeoutMs =
      hls?.config?.fragLoadPolicy?.default?.maxLoadTimeMs ??
      DEFAULT_PREFETCH_TIMEOUT_MS;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const requestUrl = options.resolveUrl
      ? options.resolveUrl(frag.url)
      : frag.url;

    activeDownloads += 1;
    stats.started += 1;
    entries.set(entry.url, entry);

    entry.settled = fetchImpl(requestUrl, {
      signal: controller.signal,
      mode: 'cors',
      credentials: 'same-origin',
    })
      .then(async (response) => {
        entry.firstByteAt = perfNow();
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const data = await response.arrayBuffer();
        entry.data = data;
        entry.bytes = data.byteLength;
        entry.endAt = perfNow();
        entry.status = 'done';
      })
      .catch((error: unknown) => {
        entry.status = 'error';
        entry.error = error;
        entry.data = null;
        entry.bytes = 0;
        if (entries.get(entry.url) === entry) {
          entries.delete(entry.url);
          stats.failed += 1;
        }
      })
      .finally(() => {
        clearTimeout(timeoutId);
        releaseDownloadSlot(entry);
        if (!disposed && hls) {
          schedule();
        }
      });
  };

  function schedule() {
    if (
      disposed ||
      !hls ||
      yieldingForUrgentFrag ||
      currentSn === null ||
      currentLevel === null
    ) {
      return;
    }
    if (refreshConcurrency() <= 0) return;

    const details = hls.levels?.[currentLevel]?.details;
    const fragments = details?.fragments;
    if (!details || details.live || !fragments || fragments.length === 0) {
      return;
    }
    const firstSn = fragments[0]?.sn;
    let currentIndex = typeof firstSn === 'number' ? currentSn - firstSn : -1;
    if (
      currentIndex < 0 ||
      currentIndex >= fragments.length ||
      fragments[currentIndex]?.sn !== currentSn
    ) {
      currentIndex = fragments.findIndex((f) => f?.sn === currentSn);
    }
    if (currentIndex < 0) return;

    const maxBufferLength =
      typeof hls.config?.maxBufferLength === 'number'
        ? hls.config.maxBufferLength
        : 60;
    const position =
      media && Number.isFinite(media.currentTime) ? media.currentTime : 0;
    const horizon = position + maxBufferLength + HORIZON_SLACK_SECONDS;
    const lookahead = concurrency + 1;

    for (
      let i = currentIndex + 1;
      i <= currentIndex + lookahead && i < fragments.length;
      i += 1
    ) {
      if (activeDownloads >= concurrency) break;
      if (cachedBytes() >= byteBudget) break;
      const frag = fragments[i];
      if (
        !frag ||
        typeof frag.url !== 'string' ||
        typeof frag.sn !== 'number'
      ) {
        continue;
      }
      if (entries.has(frag.url) || hasByteRange(frag)) continue;
      const start = typeof frag.start === 'number' ? frag.start : 0;
      const duration = typeof frag.duration === 'number' ? frag.duration : 0;
      if (start > horizon) break;
      if (isRangeBuffered(media, start, start + duration)) continue;
      startDownload({ ...frag, url: frag.url, sn: frag.sn });
    }
  }

  const onSeeking = () => {
    if (disposed) return;
    if (!hasHealthyForwardBuffer()) {
      yieldingForUrgentFrag = true;
      clearAll();
    }
  };

  const onFragLoading = (_event: unknown, data: unknown) => {
    if (disposed) return;
    const frag = asRecord(asRecord(data)?.frag);
    if (!frag) return;
    if (typeof frag.type === 'string' && frag.type !== 'main') return;
    if (typeof frag.sn !== 'number') return;
    const prevSn = currentSn;
    const isNonSequentialJump =
      prevSn !== null && (frag.sn < prevSn || frag.sn > prevSn + 1);
    currentSn = frag.sn;
    currentLevel = typeof frag.level === 'number' ? frag.level : 0;

    // 丢弃已越过、跨码率或因跳转远离当前位置的预取
    const upperSn = currentSn + 6;
    for (const entry of Array.from(entries.values())) {
      if (
        entry.level !== currentLevel ||
        entry.sn < currentSn ||
        entry.sn > upperSn
      ) {
        discardEntry(entry);
      }
    }

    // 拖动跳转到未缓冲区间时，先让路给目标首片，避免与其争抢带宽
    if (isNonSequentialJump && !hasHealthyForwardBuffer()) {
      yieldingForUrgentFrag = true;
      return;
    }

    if (yieldingForUrgentFrag) {
      if (hasHealthyForwardBuffer()) {
        yieldingForUrgentFrag = false;
      } else {
        return;
      }
    }

    schedule();
  };

  const onFragLoaded = (_event: unknown, data: unknown) => {
    if (disposed) return;
    const record = asRecord(data);
    const frag = asRecord(record?.frag);
    if (!frag) return;
    if (typeof frag.type === 'string' && frag.type !== 'main') return;
    if (typeof frag.sn !== 'number') return;
    const fragStats = asRecord(frag.stats) ?? asRecord(record?.stats);
    if (fragStats?.aborted === true) return;

    // 起播或拖动后的首个紧急分片已下载完成，解除让路状态，下一片立即开启并发预取
    yieldingForUrgentFrag = false;
  };

  const detach = () => {
    unbind?.();
    unbind = null;
    clearAll();
    hls = null;
    media = null;
    currentSn = null;
    currentLevel = null;
    slowFloor = 0;
    yieldingForUrgentFrag = true;
  };

  const attach = (
    nextHls: PrefetchHlsLike | null | undefined,
    nextMedia?: HTMLMediaElement | null,
  ) => {
    if (disposed) return;
    detach();
    if (!nextHls) return;
    hls = nextHls;
    media = nextMedia ?? null;
    activated = false;
    concurrency = 0;
    slowFloor = 0;
    yieldingForUrgentFrag = !hasHealthyForwardBuffer();
    try {
      historicallySlow = options.isHistoricallySlow?.() === true;
    } catch {
      historicallySlow = false;
    }

    const cleanups: Array<() => void> = [];
    if (typeof nextHls.on === 'function') {
      const instance = nextHls;
      const onDestroying = () => {
        if (hls === instance) detach();
      };
      instance.on?.(HLS_FRAG_LOADING, onFragLoading);
      instance.on?.(HLS_FRAG_LOADED, onFragLoaded);
      instance.on?.(HLS_DESTROYING, onDestroying);
      cleanups.push(() => {
        instance.off?.(HLS_FRAG_LOADING, onFragLoading);
        instance.off?.(HLS_FRAG_LOADED, onFragLoaded);
        instance.off?.(HLS_DESTROYING, onDestroying);
      });
    }
    if (media && typeof media.addEventListener === 'function') {
      const targetMedia = media;
      targetMedia.addEventListener('seeking', onSeeking);
      cleanups.push(() => {
        targetMedia.removeEventListener('seeking', onSeeking);
      });
    }
    unbind = () => {
      for (const fn of cleanups) fn();
    };
  };

  const claim = (url: string | undefined | null): PrefetchClaim | null => {
    if (disposed || !url) return null;
    const entry = entries.get(url);
    if (!entry) return null;
    entries.delete(url);
    stats.hits += 1;

    const promise = entry.settled.then(() => {
      if (entry.status === 'done' && entry.data) {
        return {
          url: entry.url,
          data: entry.data,
          bytes: entry.bytes,
          startedAt: entry.startedAt,
          firstByteAt: Math.max(entry.firstByteAt, entry.startedAt),
          endAt: Math.max(entry.endAt, entry.firstByteAt, entry.startedAt),
        };
      }
      throw entry.error instanceof Error
        ? entry.error
        : new Error('prefetch failed');
    });

    return {
      promise,
      cancel: () => {
        if (entry.status === 'loading') {
          entry.controller.abort();
        }
      },
    };
  };

  return {
    attach,
    detach,
    claim,
    getStats: () => ({
      active: activated && concurrency > 0 && !yieldingForUrgentFrag,
      yielding: yieldingForUrgentFrag,
      concurrency,
      ...stats,
      cachedBytes: cachedBytes(),
      pending: activeDownloads,
    }),
    dispose: () => {
      if (disposed) return;
      detach();
      disposed = true;
    },
  };
}
