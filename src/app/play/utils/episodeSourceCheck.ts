import type { SearchResult } from '@/lib/types';

import { appendSourceFragmentParam } from './fragmentUrlParams';
import {
  filterAdsFromM3U8,
  filterAdsFromM3U8Async,
  parseSpeedToKBps,
} from './helpers';

/** 低于该速度（KB/s）的分片在 10s 起播窗口内极易超时失败，探测阶段直接判慢源异常 */
export const UNPLAYABLE_SLOW_SPEED_KBPS = 50;
/** 低于该速度（KB/s）的可播源在列表里标记为「较慢」（琥珀色），不误标为绿色流畅源 */
export const SLOW_SOURCE_SPEED_KBPS = 180;

export type EpisodeProbeSpeedTier = 'normal' | 'slow' | 'unknown';

export function classifyEpisodeProbeSpeed(
  loadSpeed?: string,
  slow?: boolean,
): EpisodeProbeSpeedTier {
  if (slow) return 'slow';
  if (!loadSpeed || loadSpeed === '未知') return 'unknown';
  const kbps = parseSpeedToKBps(loadSpeed);
  if (kbps <= 0) return 'unknown';
  return kbps < SLOW_SOURCE_SPEED_KBPS ? 'slow' : 'normal';
}

const CUSTOM_AD_FILTER_CODE_CACHE_KEY = 'custom_ad_filter_code_cache';

/**
 * 读取本地去广告开关与自定义去广告代码（与 Play 页保持一致，默认开启）。
 */
export function readLocalAdFilterSettings(): {
  enabled: boolean;
  customCode: string;
} {
  let enabled = true;
  let customCode = '';
  try {
    if (typeof localStorage !== 'undefined') {
      const v = localStorage.getItem('enable_blockad');
      if (v !== null) enabled = v === 'true';
      customCode = localStorage.getItem(CUSTOM_AD_FILTER_CODE_CACHE_KEY) || '';
    }
  } catch {
    // ignore storage errors
  }
  return { enabled, customCode };
}

type HlsLoaderContext = {
  type?: string;
  url?: string;
};

type HlsLoaderResponse = {
  data?: unknown;
  url?: string;
};

type HlsLoaderCallbacks = {
  onSuccess?: (
    response: HlsLoaderResponse,
    stats: unknown,
    ctx: HlsLoaderContext,
    networkDetails: unknown,
  ) => void;
};

type HlsLoaderInstance = {
  load: (
    context: HlsLoaderContext,
    conf: unknown,
    callbacks: HlsLoaderCallbacks,
  ) => void;
};

type HlsLoaderConstructor = new (config: unknown) => HlsLoaderInstance;

type HlsPlaybackCheckConfig = Record<string, unknown> & {
  loader?: HlsLoaderConstructor;
};

export type EpisodeSourceCheckStatus =
  | 'pending'
  | 'checking'
  | 'success'
  | 'error'
  | 'skipped'
  | 'cancelled';

export interface EpisodeSourceCheckResult {
  sourceKey: string;
  episodeIndex: number;
  status: EpisodeSourceCheckStatus;
  url?: string;
  quality?: string;
  loadSpeed?: string;
  /** 首字节延迟（ms），0 表示未知 */
  pingTimeMs?: number;
  /** 虽可播但实测速度偏慢，UI 降级展示避免误导 */
  slow?: boolean;
  message?: string;
  details?: string;
  checkedAt?: number;
}

export interface EpisodeSourceCheckPlanItem {
  source: SearchResult;
  sourceKey: string;
  episodeIndex: number;
  episodeData?: string;
  skippedReason?: string;
}

export function buildEpisodeSourceKey(
  source: Pick<SearchResult, 'source' | 'id'>,
): string {
  return `${String(source.source)}-${String(source.id)}`;
}

export function buildEpisodeProbeCacheKey(
  sourceKey: string,
  episodeIndex: number,
): string {
  return `${sourceKey}::episode-${episodeIndex}`;
}

/** 探测结果复用有效期：自动测速与手动检查在 TTL 内共用结果，避免重复下载 */
export const EPISODE_PROBE_CACHE_TTL_MS = 5 * 60 * 1000;

export function isFinalEpisodeProbeStatus(
  status: EpisodeSourceCheckStatus,
): boolean {
  return status === 'success' || status === 'error' || status === 'skipped';
}

/**
 * 判断探测结果是否仍可复用：
 * - 仅终态结果可复用（checking/cancelled 不算）
 * - checkedAt 为 0 的占位结果（如首屏预计算数据）不参与复用
 * - 播放地址变化（如详情补全后替换了 episodes）视为过期
 */
export function isEpisodeProbeResultFresh(
  result: EpisodeSourceCheckResult | undefined,
  currentUrl?: string,
  now: number = Date.now(),
): boolean {
  if (!result) return false;
  if (!isFinalEpisodeProbeStatus(result.status)) return false;
  if (!result.checkedAt) return false;
  if (now - result.checkedAt > EPISODE_PROBE_CACHE_TTL_MS) return false;
  if (currentUrl && result.url && result.url !== currentUrl) return false;
  return true;
}

interface NetworkInformationLike {
  downlink?: number;
  effectiveType?: string;
}

type NavigatorWithConnection = Navigator & {
  connection?: NetworkInformationLike;
  mozConnection?: NetworkInformationLike;
  webkitConnection?: NetworkInformationLike;
};

/**
 * 探测并发数（基于 Network Information API 动态调整，默认 2）。
 * 与播放源优选（sourcePreference）保持同一策略，避免大批量并发探测
 * 挤占正在播放的视频带宽并导致测速数字失真。
 */
export function getOptimalProbeConcurrency(): number {
  if (typeof navigator === 'undefined') return 2;
  const networkNavigator = navigator as NavigatorWithConnection;
  const connection =
    networkNavigator.connection ||
    networkNavigator.mozConnection ||
    networkNavigator.webkitConnection;
  if (connection) {
    const downlink = connection.downlink ?? 0;
    const effectiveType = connection.effectiveType;

    if (downlink > 10) return 4;
    if (downlink > 5) return 3;
    if (downlink > 2) return 2;
    if (effectiveType === '4g') return 3;
    if (effectiveType === '3g') return 2;
    return 1;
  }
  return 2;
}

export function isLikelyHlsUrl(url: string): boolean {
  return /\.m3u8(?:$|[?#])/i.test(url);
}

export function qualityFromHeight(height: number): string {
  if (!height || height <= 0) return '未知';
  if (height >= 2160) return '4K';
  if (height >= 1440) return '2K';
  if (height >= 1080) return '1080p';
  if (height >= 720) return '720p';
  if (height >= 480) return '480p';
  return 'SD';
}

export function formatSpeed(bytes: number, durationMs: number): string {
  if (!bytes || bytes <= 0 || !durationMs || durationMs <= 0) return '未知';
  const seconds = durationMs / 1000;
  const kbps = bytes / 1024 / seconds;
  if (kbps >= 1024) {
    return `${(kbps / 1024).toFixed(2)} MB/s`;
  }
  return `${kbps.toFixed(2)} KB/s`;
}

/**
 * 串行 HEAD 探活：仅在拿不到 hls.js 统计的直链场景使用。
 * 失败/超时/中止统一返回 0（表示未知），避免把超时伪装成真实延迟。
 */
export async function measurePingTimeMs(
  url: string,
  options: {
    signal?: AbortSignal;
    timeoutMs?: number;
  } = {},
): Promise<number> {
  const timeoutMs =
    typeof options.timeoutMs === 'number' ? options.timeoutMs : 2000;

  if (options.signal?.aborted) return 0;

  const start = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const onAbort = () => controller.abort();
  options.signal?.addEventListener('abort', onAbort, { once: true });

  try {
    await fetch(url, {
      method: 'HEAD',
      mode: 'no-cors',
      signal: controller.signal,
    });
  } catch {
    return 0;
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', onAbort);
  }

  return Math.round(performance.now() - start);
}

/**
 * 从 m3u8 文本中取首个可用的媒体分片相对地址（忽略注释、EXT-X-KEY 等标签）。
 * 返回绝对 URL；找不到返回 null。
 */
export function pickFirstMediaSegment(
  manifestText: string,
  baseUrl: string,
): string | null {
  if (!manifestText) return null;
  for (const rawLine of manifestText.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    try {
      return new URL(line, baseUrl).toString();
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * 从 m3u8 文本中读取声明的最大分辨率高度。
 * 支持两种写法：
 * - 主播放列表的 EXT-X-STREAM-INF 属性 `RESOLUTION=1920x1080`
 * - 媒体列表的 EXT-X-... 中单独的 `#EXT-X-RESOLUTION` 变体（少数源站自定义）
 * 多个候选时取最大高度；没有任何声明返回 0。
 */
export function pickDeclaredResolutionHeight(manifestText: string): number {
  if (!manifestText) return 0;

  let maxHeight = 0;
  const patterns = [
    /RESOLUTION\s*=\s*(\d{2,5})\s*[xX]\s*(\d{2,5})/g,
    /#EXT-X-RESOLUTION\s*[:=]\s*(\d{2,5})\s*[xX]\s*(\d{2,5})/g,
  ];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(manifestText)) !== null) {
      const height = Number.parseInt(match[2], 10);
      if (Number.isFinite(height) && height > maxHeight) {
        maxHeight = height;
      }
    }
  }

  return maxHeight;
}

export interface SegmentSpeedMeasurement {
  speed: string;
  reachable: boolean;
  status?: number;
  bytes: number;
  durationMs: number;
  ttfbMs?: number;
  timedOut?: boolean;
}

/**
 * 顺着 manifest 走到真正的媒体分片。
 *
 * 多码率主列表的首项往往是子 m3u8，直接对子列表测速只能读到几 KB 文本，
 * 因此只要首项仍是 m3u8 就再下钻一层，且不再要求外层缺少 RESOLUTION 声明。
 * 分辨率声明仍以外层（最大档）为准，仅在外层未声明时用子列表补。
 */
export async function followManifestToSegment(
  manifestText: string,
  baseUrl: string,
  options: {
    signal?: AbortSignal;
    cache?: RequestCache;
    filterAds?: boolean;
    adFilterType?: string;
    customAdFilterCode?: string;
  } = {},
): Promise<{ segmentUrl: string | null; declaredHeight: number }> {
  const applyFilter = async (text: string) =>
    options.filterAds
      ? filterAdsFromM3U8Async(text, {
          type: options.adFilterType,
          customCode: options.customAdFilterCode,
        })
      : text;

  const declaredHeightOuter = pickDeclaredResolutionHeight(manifestText);
  let declaredHeight = declaredHeightOuter;
  let segmentUrl = pickFirstMediaSegment(
    await applyFilter(manifestText),
    baseUrl,
  );

  if (!segmentUrl || !isLikelyHlsUrl(segmentUrl)) {
    return { segmentUrl, declaredHeight };
  }

  try {
    const response = await fetch(segmentUrl, {
      signal: options.signal,
      cache: options.cache ?? 'no-store',
    });
    if (!response.ok) return { segmentUrl, declaredHeight };
    const childText = await response.text();
    if (!/#EXT(?:M3U|-X-|INF)/i.test(childText)) {
      return { segmentUrl: null, declaredHeight };
    }

    if (declaredHeight === 0) {
      const childHeight = pickDeclaredResolutionHeight(childText);
      if (childHeight > 0) declaredHeight = childHeight;
    }

    // 重定向后的相对路径要基于最终地址解析
    const childBase = response.url || segmentUrl;
    const childSegment = pickFirstMediaSegment(
      await applyFilter(childText),
      childBase,
    );
    if (childSegment) segmentUrl = childSegment;
  } catch {
    // 子列表读取失败时保留外层信息
  }

  return { segmentUrl, declaredHeight };
}

/**
 * 以独立请求精确测量首个分片下载速度，并暴露明确的可达性信息供选源复用。
 */
export async function measureSegmentLoadSpeedDetailed(
  segmentUrl: string,
  options: {
    signal?: AbortSignal;
    timeoutMs?: number;
    /** 读够该字节数即可停止，避免为测速白下载整个分片 */
    maxBytes?: number;
    /** 被中止时也按已读字节给结论（慢源因此能显示低速而不是「未知」） */
    partialOnAbort?: boolean;
    /** 源 key：部分 CDN（如爱奇艺源）的分片请求须携带防盗链参数 */
    sourceKey?: string;
  } = {},
): Promise<SegmentSpeedMeasurement> {
  const timeoutMs =
    typeof options.timeoutMs === 'number' ? options.timeoutMs : 5000;
  const maxBytes =
    typeof options.maxBytes === 'number' ? options.maxBytes : 512 * 1024;
  const partialOnAbort = options.partialOnAbort === true;

  if (options.signal?.aborted) {
    return { speed: '未知', reachable: false, bytes: 0, durationMs: 0 };
  }

  // 样本下限：读取量太小或时间窗太短时，速度没有统计意义；
  // 若片段本身较小（>=16KB）但已稳定经历一段网络耗时，也允许结算真实低速/小分片速度。
  const MIN_SAMPLE_BYTES = 64 * 1024;
  const RELAXED_SAMPLE_BYTES = 16 * 1024;
  const MIN_SAMPLE_MS = 20;

  const isSampleValid = (
    sampleBytes: number,
    sampleDuration: number,
    isPartial: boolean,
    isTimedOut: boolean,
  ): boolean => {
    if (sampleBytes >= MIN_SAMPLE_BYTES && sampleDuration >= MIN_SAMPLE_MS) {
      return true;
    }
    if (sampleBytes >= RELAXED_SAMPLE_BYTES) {
      return isPartial ? sampleDuration >= 500 : sampleDuration >= 150;
    }
    // 完整跑完测速超时窗口仍只收到极少字节（如跨境限速 14 KB/s）：
    // 按实测字节算出真实极低速，避免丢弃为「未知」导致误判为可播源
    if (isTimedOut && sampleBytes > 0 && sampleDuration >= 1000) {
      return true;
    }
    return false;
  };

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const onAbort = () => controller.abort();
  options.signal?.addEventListener('abort', onAbort, { once: true });

  let bytes = 0;
  let headersOk = false;
  let status: number | undefined;
  let ttfbMs: number | undefined;
  // 从请求发出即开始计时：TTFB 与首个 chunk 的合并缓冲都计入窗口，
  // 否则慢首包会被算成高速，或快源因窗口过短被判成「未知」。
  const startedAt = performance.now();

  const reportPartial = (): SegmentSpeedMeasurement => {
    const duration = performance.now() - startedAt;
    if (options.signal?.aborted && !partialOnAbort) {
      return {
        speed: '未知',
        reachable: headersOk,
        status,
        bytes,
        durationMs: duration,
        ttfbMs,
        timedOut,
      };
    }
    if (!isSampleValid(bytes, duration, true, timedOut)) {
      return {
        speed: '未知',
        reachable: headersOk,
        status,
        bytes,
        durationMs: duration,
        ttfbMs,
        timedOut,
      };
    }
    return {
      speed: formatSpeed(bytes, duration),
      reachable: headersOk,
      status,
      bytes,
      durationMs: duration,
      ttfbMs,
      timedOut,
    };
  };

  try {
    const response = await fetch(
      appendSourceFragmentParam(options.sourceKey, segmentUrl),
      {
        signal: controller.signal,
        // 命中浏览器缓存时读到的是本地数据，测出来会是假高速，因此显式绕过缓存
        cache: 'no-store',
      },
    );
    ttfbMs = Math.max(1, Math.round(performance.now() - startedAt));
    status = response.status;
    if (!response.ok) {
      return {
        speed: '未知',
        reachable: false,
        status,
        bytes: 0,
        durationMs: performance.now() - startedAt,
        ttfbMs,
      };
    }
    headersOk = true;
    if (!response.body) {
      return {
        speed: '未知',
        reachable: true,
        status,
        bytes: 0,
        durationMs: performance.now() - startedAt,
        ttfbMs,
      };
    }

    const reader = response.body.getReader();

    while (bytes < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) bytes += value.byteLength;
    }
    const duration = performance.now() - startedAt;
    void reader.cancel().catch(() => undefined);

    if (!isSampleValid(bytes, duration, false, false)) {
      return {
        speed: '未知',
        reachable: true,
        status,
        bytes,
        durationMs: duration,
        ttfbMs,
        timedOut: false,
      };
    }
    return {
      speed: formatSpeed(bytes, duration),
      reachable: true,
      status,
      bytes,
      durationMs: duration,
      ttfbMs,
      timedOut: false,
    };
  } catch {
    if (headersOk && (timedOut || partialOnAbort)) {
      return reportPartial();
    }
    return {
      speed: '未知',
      reachable: false,
      status,
      bytes,
      durationMs: performance.now() - startedAt,
      ttfbMs,
      timedOut,
    };
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', onAbort);
  }
}

/**
 * 以独立请求精确测量首个分片下载速度。
 *
 * 为什么不复用 hls.js 的 stats：hls.js 会并发预加载多个分片，且其
 * loading.start 在跨域/自定义 loader 下不保证等于本次请求发出的时刻，
 * 实测会得出上百 MB/s 的假速度。这里用自建请求自己圈定窗口，
 * 只统计真正读到的字节，结论可重复。失败返回 '未知' 而非编造数值。
 */
export async function measureSegmentLoadSpeed(
  segmentUrl: string,
  options: {
    signal?: AbortSignal;
    timeoutMs?: number;
    /** 读够该字节数即可停止，避免为测速白下载整个分片 */
    maxBytes?: number;
    /** 被中止时也按已读字节给结论（慢源因此能显示低速而不是「未知」） */
    partialOnAbort?: boolean;
    /** 源 key：部分 CDN（如爱奇艺源）的分片请求须携带防盗链参数 */
    sourceKey?: string;
  } = {},
): Promise<string> {
  const result = await measureSegmentLoadSpeedDetailed(segmentUrl, options);
  return result.speed;
}

export class EpisodeSourceProbeError extends Error {
  details?: string;

  constructor(message: string, details?: string) {
    super(message);
    this.name = 'EpisodeSourceProbeError';
    this.details = details;
  }
}

function getHlsErrorReason(data: unknown): string {
  if (!data || typeof data !== 'object') return '未知 HLS 错误';

  const response =
    'response' in data &&
    typeof (data as { response?: unknown }).response === 'object'
      ? (data as { response?: { code?: unknown } }).response
      : undefined;
  const code = response?.code;
  if (code === 0) return '网络被拒（可能受地区/代理限制或未开放 CORS）';
  if (code === 403) return '403 禁止访问，可能需要白名单';

  const reason =
    'reason' in data &&
    typeof (data as { reason?: unknown }).reason === 'string'
      ? (data as { reason: string }).reason
      : undefined;
  const details =
    'details' in data &&
    typeof (data as { details?: unknown }).details === 'string'
      ? (data as { details: string }).details
      : undefined;

  return reason || details || '未知 HLS 错误';
}

function shouldUseNativeHls(video: HTMLVideoElement, url: string): boolean {
  // ✅ iPad 上尽量避免使用 hls.js（项目中已有 iPad 特殊处理避免崩溃）
  const ua = navigator.userAgent;
  const isIPad =
    /iPad/i.test(ua) ||
    (ua.includes('Macintosh') &&
      typeof navigator.maxTouchPoints === 'number' &&
      navigator.maxTouchPoints > 2);
  if (!isIPad) return false;
  if (!isLikelyHlsUrl(url)) return false;
  return video.canPlayType('application/vnd.apple.mpegurl') !== '';
}

export async function probePlayableMediaUrl(
  url: string,
  options: {
    timeoutMs: number;
    signal: AbortSignal;
    /** 传给自定义去广告代码的源类型，与主播放器的过滤口径保持一致 */
    adFilterType?: string;
    /** 源 key：部分 CDN（如爱奇艺源）的分片请求须携带防盗链参数 */
    sourceKey?: string;
  },
): Promise<{
  quality: string;
  loadSpeed: string;
  pingTimeMs: number;
  slow?: boolean;
}> {
  if (!url.trim()) {
    throw new EpisodeSourceProbeError('播放地址为空');
  }
  if (!/^https?:\/\//i.test(url)) {
    throw new EpisodeSourceProbeError('播放地址格式无效');
  }

  // 离屏 video：避免影响当前页面播放器
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'metadata';
  video.crossOrigin = 'anonymous';
  video.style.position = 'absolute';
  video.style.left = '-9999px';
  video.style.top = '-9999px';
  video.style.width = '1px';
  video.style.height = '1px';
  video.style.opacity = '0';

  document.body.appendChild(video);

  let done = false;
  let hasMetadata = false;
  let hasFirstFrag = false;
  let capturedSegmentUrl: string | null = null;
  // 等待分辨率而延后结算的一次性定时器
  let pendingResolveTimer: ReturnType<typeof setTimeout> | null = null;

  let quality = '未知';
  let loadSpeed = '未知';
  // 0 表示未知：HLS 取 manifest TTFB，直链用串行 HEAD 探活
  let pingTimeMs = 0;
  let speedMeasurement: SegmentSpeedMeasurement | null = null;

  const probeDeadline = Date.now() + options.timeoutMs;

  // 读取本地去广告开关（与 Play 页一致，默认开启）
  const { enabled: blockAdEnabled, customCode: customAdFilterCode } =
    readLocalAdFilterSettings();

  // 旁路测速专用中止开关：仅在探测彻底取消/退出时触发，避免后台继续下载
  const speedController = new AbortController();
  const abortSpeedProbe = () => {
    try {
      if (!speedController.signal.aborted) speedController.abort();
    } catch {
      // ignore
    }
  };
  options.signal.addEventListener('abort', abortSpeedProbe, { once: true });

  // 动态导入 hls.js，避免在测试/SSR 环境下引入副作用
  let hlsInstance: { destroy: () => void } | null = null;

  const cleanup = (opts: { clearSrc?: boolean } = {}) => {
    if (pendingResolveTimer) {
      clearTimeout(pendingResolveTimer);
      pendingResolveTimer = null;
    }
    options.signal.removeEventListener('abort', abortSpeedProbe);
    try {
      if (hlsInstance) {
        hlsInstance.destroy();
      }
    } catch {
      // ignore
    }
    hlsInstance = null;

    try {
      video.pause();
      if (opts.clearSrc !== false) {
        video.removeAttribute('src');
        video.load();
      }
    } catch {
      // ignore
    }

    try {
      video.remove();
    } catch {
      // ignore
    }
  };

  if (options.signal.aborted) {
    cleanup();
    throw new EpisodeSourceProbeError('已取消');
  }

  return new Promise((resolve, reject) => {
    void (async () => {
      const runIsolatedSpeedProbe = async (): Promise<void> => {
        if (options.signal.aborted || speedController.signal.aborted) return;
        const remainingMs = Math.max(0, probeDeadline - Date.now());
        if (remainingMs < 250) return;
        const speedTimeoutMs = Math.min(4500, remainingMs);
        const speedTimer = setTimeout(abortSpeedProbe, speedTimeoutMs);
        try {
          let targetSegmentUrl = capturedSegmentUrl;
          if (isLikelyHlsUrl(url) && !targetSegmentUrl) {
            const manifestResponse = await fetch(url, {
              signal: speedController.signal,
              cache: 'no-store',
            });
            if (manifestResponse.ok) {
              const manifestText = await manifestResponse.text();
              const manifestBase = manifestResponse.url || url;
              const followed = await followManifestToSegment(
                manifestText,
                manifestBase,
                {
                  signal: speedController.signal,
                  filterAds: blockAdEnabled,
                  adFilterType: options.adFilterType,
                  customAdFilterCode,
                },
              );
              if (followed.declaredHeight > 0 && quality === '未知') {
                quality = qualityFromHeight(followed.declaredHeight);
              }
              targetSegmentUrl = followed.segmentUrl;
            }
          } else if (!isLikelyHlsUrl(url) && !targetSegmentUrl) {
            targetSegmentUrl = url;
          }

          if (
            !targetSegmentUrl ||
            (isLikelyHlsUrl(url) && isLikelyHlsUrl(targetSegmentUrl)) ||
            options.signal.aborted ||
            speedController.signal.aborted
          ) {
            return;
          }

          const remainingForSegMs = Math.max(
            200,
            Math.min(
              isLikelyHlsUrl(url)
                ? speedTimeoutMs
                : Math.min(3000, speedTimeoutMs),
              probeDeadline - Date.now(),
            ),
          );
          const measurement = await measureSegmentLoadSpeedDetailed(
            targetSegmentUrl,
            {
              signal: speedController.signal,
              timeoutMs: remainingForSegMs,
              maxBytes: isLikelyHlsUrl(url) ? 512 * 1024 : 384 * 1024,
              partialOnAbort: true,
              sourceKey: options.sourceKey,
            },
          );
          speedMeasurement = measurement;
          if (measurement.speed !== '未知') {
            loadSpeed = measurement.speed;
          }
        } catch {
          // CORS 受限或直链测速失败时保留「未知」，不影响已确认的可播结果
        } finally {
          clearTimeout(speedTimer);
        }
      };

      const safeResolve = async () => {
        if (done) return;
        done = true;
        clearTimeout(timeoutId);
        options.signal.removeEventListener('abort', onAbort);
        video.removeEventListener('loadedmetadata', onLoadedMetadata);
        video.removeEventListener('playing', onPlaying);
        video.removeEventListener('error', onVideoError);

        // 必须在 cleanup() 之前读分辨率：cleanup 会 removeAttribute('src') +
        // load()，使 videoWidth/videoHeight 归零。
        if (quality === '未知' && video.videoHeight > 0) {
          quality = qualityFromHeight(video.videoHeight);
        }
        // 先销毁 hls.js / video 停止预加载，再以单路流式测速，消除自相抢带宽与 1200ms 截断
        cleanup();

        options.signal.addEventListener('abort', abortSpeedProbe, {
          once: true,
        });
        try {
          await runIsolatedSpeedProbe();
        } finally {
          options.signal.removeEventListener('abort', abortSpeedProbe);
        }

        if (options.signal.aborted) {
          reject(new EpisodeSourceProbeError('已取消'));
          return;
        }

        // 分片独立测速明显超时无字节，或实测速率低于最低可播门槛（如跨境限速 14 KB/s）：
        // 直接判异常而非误标绿色「可播」，避免用户点进去必撞 10 秒起播超时。
        if (
          speedMeasurement?.timedOut &&
          (!speedMeasurement.reachable || speedMeasurement.bytes === 0)
        ) {
          reject(
            new EpisodeSourceProbeError('分片测速超时（当前源过慢或不可用）'),
          );
          return;
        }
        const speedKbps = parseSpeedToKBps(loadSpeed);
        if (speedKbps > 0 && speedKbps < UNPLAYABLE_SLOW_SPEED_KBPS) {
          reject(new EpisodeSourceProbeError(`源速度过慢 (${loadSpeed})`));
          return;
        }
        const slow = speedKbps > 0 && speedKbps < SLOW_SOURCE_SPEED_KBPS;
        resolve({ quality, loadSpeed, pingTimeMs, slow });
      };

      const safeReject = (message: string, details?: string) => {
        if (done) return;
        done = true;
        clearTimeout(timeoutId);
        options.signal.removeEventListener('abort', onAbort);
        video.removeEventListener('loadedmetadata', onLoadedMetadata);
        video.removeEventListener('playing', onPlaying);
        video.removeEventListener('error', onVideoError);
        abortSpeedProbe();
        cleanup();
        reject(new EpisodeSourceProbeError(message, details));
      };

      const maybeResolve = () => {
        if (done) return;
        // ✅ 判定策略：优先 playing；退化为 metadata + 首分片
        if (video.readyState >= 3) {
          void safeResolve();
          return;
        }
        if (hasMetadata && (hasFirstFrag || !isLikelyHlsUrl(url))) {
          // HLS 源若尚未确认分辨率，短暂等待解码/多码率声明：
          // videoHeight 与 levels 声明都要等这一步，提前结算会永远拿不到分辨率。
          if (isLikelyHlsUrl(url) && quality === '未知') {
            if (!pendingResolveTimer) {
              pendingResolveTimer = setTimeout(() => {
                pendingResolveTimer = null;
                if (!done) void safeResolve();
              }, 1500);
            }
            return;
          }
          void safeResolve();
        }
      };

      const onAbort = () => {
        void safeReject('已取消');
      };

      const timeoutId = setTimeout(() => {
        void safeReject(`检测超时 (${options.timeoutMs}ms)`);
      }, options.timeoutMs);

      const onLoadedMetadata = () => {
        hasMetadata = true;
        // 直链直接读真实分辨率；HLS 先等 MANIFEST_PARSED 的 levels 声明，
        // 未拿到时再由下方 FRAG_LOADED 用 videoHeight 兜底（单码率 m3u8 无 height 声明）
        if (!isLikelyHlsUrl(url)) {
          quality = qualityFromHeight(video.videoHeight);
        }
        maybeResolve();
      };

      const onPlaying = () => {
        maybeResolve();
      };

      const onVideoError = () => {
        const mediaError = video.error;
        const code = mediaError?.code || 0;
        const messageMap: Record<number, string> = {
          1: '加载被用户中止',
          2: '网络错误（可能受地区/代理或跨域限制）',
          3: '解码失败，可能格式不受支持',
          4: '资源不可用（可能受地区/代理或跨域限制）',
        };
        void safeReject(
          messageMap[code] || '播放失败（可能受地区/代理或跨域限制）',
          mediaError?.message,
        );
      };

      video.addEventListener('loadedmetadata', onLoadedMetadata);
      video.addEventListener('playing', onPlaying);
      video.addEventListener('error', onVideoError);
      options.signal.addEventListener('abort', onAbort, { once: true });

      try {
        if (shouldUseNativeHls(video, url)) {
          pingTimeMs = await measurePingTimeMs(url, {
            signal: options.signal,
          });
          if (options.signal.aborted) {
            void safeReject('已取消');
            return;
          }
          video.src = url;
          video.load();
        } else if (isLikelyHlsUrl(url)) {
          const mod = await import('hls.js');
          const HlsCtor = mod.default;

          const BaseLoader = HlsCtor.DefaultConfig
            .loader as HlsLoaderConstructor;

          class CustomHlsJsLoader extends BaseLoader {
            constructor(config: unknown) {
              super(config);
              const originalLoad = this.load.bind(this);
              this.load = (
                context: HlsLoaderContext,
                conf: unknown,
                callbacks: HlsLoaderCallbacks,
              ) => {
                // 部分 CDN（如爱奇艺源）要求 ts 分片请求携带防盗链参数；
                // 同时在追加签名参数前记录原始首分片地址供单路测速复用，避免重复拉清单。
                if (
                  (context.type === 'media-fragment' ||
                    context.type === 'fragment') &&
                  typeof context.url === 'string'
                ) {
                  if (!capturedSegmentUrl) {
                    capturedSegmentUrl = context.url;
                  }
                  context.url = appendSourceFragmentParam(
                    options.sourceKey,
                    context.url,
                  );
                }
                const originalOnSuccess = callbacks.onSuccess;
                if (typeof originalOnSuccess === 'function') {
                  callbacks.onSuccess = (
                    response,
                    stats,
                    ctx,
                    networkDetails,
                  ) => {
                    if (
                      (context.type === 'manifest' ||
                        context.type === 'level') &&
                      typeof response?.data === 'string'
                    ) {
                      const recordFirstSegment = (manifestText: string) => {
                        response.data = manifestText;
                        const manifestBase =
                          response.url ||
                          (typeof context.url === 'string' ? context.url : url);
                        const firstSeg = pickFirstMediaSegment(
                          manifestText,
                          manifestBase,
                        );
                        if (firstSeg && !isLikelyHlsUrl(firstSeg)) {
                          capturedSegmentUrl = firstSeg;
                        }
                      };

                      if (!blockAdEnabled) {
                        recordFirstSegment(response.data);
                        return originalOnSuccess(
                          response,
                          stats,
                          ctx,
                          networkDetails,
                        );
                      }

                      const trimmedCustom = customAdFilterCode.trim();
                      if (!trimmedCustom) {
                        recordFirstSegment(
                          filterAdsFromM3U8(response.data, {
                            type: options.adFilterType,
                          }),
                        );
                        return originalOnSuccess(
                          response,
                          stats,
                          ctx,
                          networkDetails,
                        );
                      }

                      void filterAdsFromM3U8Async(response.data, {
                        type: options.adFilterType,
                        customCode: trimmedCustom,
                      }).then((filtered) => {
                        if (done || options.signal.aborted) return;
                        recordFirstSegment(filtered);
                        originalOnSuccess(response, stats, ctx, networkDetails);
                      });
                      return;
                    }
                    return originalOnSuccess(
                      response,
                      stats,
                      ctx,
                      networkDetails,
                    );
                  };
                }

                return originalLoad(context, conf, callbacks);
              };
            }
          }

          const hlsConfig: HlsPlaybackCheckConfig = {
            debug: false,
            enableWorker: false,
            lowLatencyMode: false,
            startLevel: -1,
            maxBufferLength: 2,
            backBufferLength: 0,
            maxBufferSize: 2 * 1024 * 1024,
            loader: CustomHlsJsLoader,
          };

          const instance = new HlsCtor(hlsConfig);
          hlsInstance = instance;

          instance.on(
            HlsCtor.Events.MANIFEST_LOADED,
            (_evt: unknown, data: unknown) => {
              // ping 取 manifest 请求的 TTFB（hls.js 统计）：
              // 位于真实媒体路径上，且早于分片下载、不受其并发干扰
              if (!data || typeof data !== 'object' || !('stats' in data))
                return;
              const loading = (
                data as {
                  stats?: { loading?: { start?: number; first?: number } };
                }
              ).stats?.loading;
              const start = loading?.start;
              const first = loading?.first;
              if (
                typeof start === 'number' &&
                typeof first === 'number' &&
                start > 0 &&
                first >= start
              ) {
                pingTimeMs = Math.round(first - start);
              }
            },
          );

          instance.on(
            HlsCtor.Events.MANIFEST_PARSED,
            (_evt: unknown, data: unknown) => {
              if (!data || typeof data !== 'object' || !('levels' in data))
                return;
              const levels = Array.isArray(
                (data as { levels?: unknown }).levels,
              )
                ? ((data as { levels: Array<{ height?: number }> })
                    .levels as Array<{
                    height?: number;
                  }>)
                : [];
              const heights = levels
                .map((l) => (typeof l.height === 'number' ? l.height : 0))
                .filter((h) => h > 0);
              const maxHeight = heights.length > 0 ? Math.max(...heights) : 0;
              quality = qualityFromHeight(maxHeight);
            },
          );

          instance.on(
            HlsCtor.Events.FRAG_LOADED,
            (_evt: unknown, data: unknown) => {
              if (hasFirstFrag) return;
              if (!data || typeof data !== 'object') return;
              const fragUrl = (data as { frag?: { url?: unknown } }).frag?.url;
              if (
                typeof fragUrl === 'string' &&
                !capturedSegmentUrl &&
                !isLikelyHlsUrl(fragUrl)
              ) {
                capturedSegmentUrl = fragUrl;
              }
              // 分片到达即可判定可播；速度在 cleanup 后独立单路测速提供
              // （hls.js 并发预加载下其内部计时不可靠，见 measureSegmentLoadSpeed 注释）
              hasFirstFrag = true;
              // 分辨率兜底：单码率 m3u8 的 levels[].height 常为 0，
              // 此时读离屏 video 解码出的真实高度（最可靠）
              if (quality === '未知' && video.videoHeight > 0) {
                quality = qualityFromHeight(video.videoHeight);
              }
              maybeResolve();
            },
          );

          instance.on(HlsCtor.Events.ERROR, (_evt: unknown, data: unknown) => {
            const fatal =
              !!data &&
              typeof data === 'object' &&
              'fatal' in data &&
              Boolean((data as { fatal?: unknown }).fatal);
            if (fatal) {
              void safeReject(`HLS 错误：${getHlsErrorReason(data)}`);
            }
          });

          instance.loadSource(url);
          instance.attachMedia(video);
          // autoStartLoad 兼容：手动启动
          try {
            instance.startLoad(0);
          } catch {
            // ignore
          }
        } else {
          pingTimeMs = await measurePingTimeMs(url, {
            signal: options.signal,
          });
          if (options.signal.aborted) {
            void safeReject('已取消');
            return;
          }
          video.src = url;
          video.load();
        }

        const playPromise = video.play();
        if (playPromise && typeof playPromise.catch === 'function') {
          playPromise.catch((err: unknown) => {
            const message =
              err instanceof Error &&
              (err.message.includes('NotAllowedError') ||
                err.message.includes('AbortError'))
                ? '浏览器阻止了自动播放，将改用加载判定'
                : err instanceof Error
                  ? err.message
                  : '浏览器拒绝播放该流';

            // autoplay 被拦截不应直接判失败：让 maybeResolve 通过 metadata+分片兜底
            if (message.includes('自动播放')) {
              return;
            }
            void safeReject(message);
          });
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : '检测失败';
        void safeReject(message);
      }
    })().catch((e) => {
      // 兜底：不应走到这里（内部已处理 safeReject）
      const message = e instanceof Error ? e.message : '检测失败';
      reject(new EpisodeSourceProbeError(message));
    });
  });
}

export function planEpisodeSourceChecks(params: {
  sources: SearchResult[];
  episodeIndex: number;
  currentSource?: string;
  currentId?: string;
}): EpisodeSourceCheckPlanItem[] {
  const { sources, episodeIndex, currentSource, currentId } = params;
  const sorted = [...sources].sort((a, b) => {
    const aIsCurrent =
      a.source?.toString() === currentSource?.toString() &&
      a.id?.toString() === currentId?.toString();
    const bIsCurrent =
      b.source?.toString() === currentSource?.toString() &&
      b.id?.toString() === currentId?.toString();
    if (aIsCurrent && !bIsCurrent) return -1;
    if (!aIsCurrent && bIsCurrent) return 1;
    return 0;
  });

  return sorted.map((source) => {
    const sourceKey = buildEpisodeSourceKey(source);
    const episodes = source.episodes || [];
    if (!Array.isArray(episodes) || episodes.length === 0) {
      return {
        source,
        sourceKey,
        episodeIndex,
        skippedReason: '无播放地址',
      };
    }
    if (episodeIndex < 0 || episodeIndex >= episodes.length) {
      return {
        source,
        sourceKey,
        episodeIndex,
        skippedReason: '无此集',
      };
    }
    const episodeData = (episodes[episodeIndex] || '').trim();
    if (!episodeData) {
      return {
        source,
        sourceKey,
        episodeIndex,
        skippedReason: '播放地址为空',
      };
    }
    return {
      source,
      sourceKey,
      episodeIndex,
      episodeData,
    };
  });
}

export async function runEpisodeSourceChecks(params: {
  plan: EpisodeSourceCheckPlanItem[];
  signal: AbortSignal;
  resolveUrl: (
    item: EpisodeSourceCheckPlanItem,
    signal: AbortSignal,
  ) => Promise<{ url?: string; skippedReason?: string }>;
  probeUrl: (
    url: string,
    signal: AbortSignal,
    item: EpisodeSourceCheckPlanItem,
  ) => Promise<{
    quality: string;
    loadSpeed: string;
    pingTimeMs: number;
    slow?: boolean;
  }>;
  /** 命中未过期结果时直接复用，跳过真实探测（保留原始 checkedAt） */
  resolveCache?: (
    item: EpisodeSourceCheckPlanItem,
  ) => EpisodeSourceCheckResult | null;
  /** 最大探测并发数（默认 1 串行，保证测速不受互抢带宽影响） */
  concurrency?: number;
  onUpdate: (next: EpisodeSourceCheckResult) => void;
}): Promise<void> {
  const {
    plan,
    signal,
    resolveUrl,
    probeUrl,
    resolveCache,
    concurrency: rawConcurrency,
    onUpdate,
  } = params;

  const emit = (patch: Omit<EpisodeSourceCheckResult, 'checkedAt'>) => {
    onUpdate({ ...patch, checkedAt: Date.now() });
  };

  const concurrency = Math.max(1, Math.floor(rawConcurrency ?? 1));
  let cursor = 0;

  const worker = async (): Promise<void> => {
    while (cursor < plan.length) {
      if (signal.aborted) {
        while (cursor < plan.length) {
          const cancelledItem = plan[cursor];
          cursor += 1;
          emit({
            sourceKey: cancelledItem.sourceKey,
            episodeIndex: cancelledItem.episodeIndex,
            status: 'cancelled',
            message: '已取消',
          });
        }
        return;
      }

      const item = plan[cursor];
      cursor += 1;

      if (item.skippedReason) {
        emit({
          sourceKey: item.sourceKey,
          episodeIndex: item.episodeIndex,
          status: 'skipped',
          message: item.skippedReason,
        });
        continue;
      }

      if (resolveCache) {
        const cached = resolveCache(item);
        if (cached && isFinalEpisodeProbeStatus(cached.status)) {
          onUpdate(cached);
          continue;
        }
      }

      emit({
        sourceKey: item.sourceKey,
        episodeIndex: item.episodeIndex,
        status: 'checking',
        message: '检测中',
      });

      try {
        const resolved = await resolveUrl(item, signal);
        if (resolved.skippedReason) {
          emit({
            sourceKey: item.sourceKey,
            episodeIndex: item.episodeIndex,
            status: 'skipped',
            message: resolved.skippedReason,
          });
          continue;
        }

        const url = (resolved.url || '').trim();
        if (!url) {
          emit({
            sourceKey: item.sourceKey,
            episodeIndex: item.episodeIndex,
            status: 'error',
            message: '解析后播放地址为空',
          });
          continue;
        }

        const metrics = await probeUrl(url, signal, item);
        emit({
          sourceKey: item.sourceKey,
          episodeIndex: item.episodeIndex,
          status: 'success',
          url,
          quality: metrics.quality,
          loadSpeed: metrics.loadSpeed,
          pingTimeMs: metrics.pingTimeMs,
          slow: metrics.slow,
          message: metrics.slow ? '速度偏慢' : '可播放',
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : '检测失败';
        const details =
          err instanceof EpisodeSourceProbeError ? err.details : undefined;

        emit({
          sourceKey: item.sourceKey,
          episodeIndex: item.episodeIndex,
          status: signal.aborted ? 'cancelled' : 'error',
          message: signal.aborted ? '已取消' : message,
          details,
        });
      }
    }
  };

  await Promise.all(
    Array.from(
      { length: Math.min(concurrency, Math.max(1, plan.length)) },
      () => worker(),
    ),
  );
}
