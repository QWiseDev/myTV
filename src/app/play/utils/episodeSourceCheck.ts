import type { SearchResult } from '@/lib/types';

import { filterAdsFromM3U8 } from './helpers';

const CUSTOM_AD_FILTER_CODE_CACHE_KEY = 'custom_ad_filter_code_cache';

type HlsLoaderContext = {
  type?: string;
};

type HlsLoaderResponse = {
  data?: unknown;
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
  if (code === 0) return '跨域被拒或未开放 CORS';
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
  },
): Promise<{
  quality: string;
  loadSpeed: string;
  pingTimeMs: number;
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
  let fragStart = 0;

  let quality = '未知';
  let loadSpeed = '未知';
  // 0 表示未知：HLS 取 manifest TTFB，直链用串行 HEAD 探活
  let pingTimeMs = 0;

  // 动态导入 hls.js，避免在测试/SSR 环境下引入副作用
  let hlsInstance: { destroy: () => void } | null = null;

  const cleanup = (opts: { clearSrc?: boolean } = {}) => {
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
      const safeResolve = () => {
        if (done) return;
        done = true;
        clearTimeout(timeoutId);
        options.signal.removeEventListener('abort', onAbort);
        video.removeEventListener('loadedmetadata', onLoadedMetadata);
        video.removeEventListener('playing', onPlaying);
        video.removeEventListener('error', onVideoError);
        cleanup();
        resolve({ quality, loadSpeed, pingTimeMs });
      };

      const safeReject = (message: string, details?: string) => {
        if (done) return;
        done = true;
        clearTimeout(timeoutId);
        options.signal.removeEventListener('abort', onAbort);
        video.removeEventListener('loadedmetadata', onLoadedMetadata);
        video.removeEventListener('playing', onPlaying);
        video.removeEventListener('error', onVideoError);
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
          2: '网络错误或跨域限制',
          3: '解码失败，可能格式不受支持',
          4: '资源不可用或跨域限制',
        };
        void safeReject(
          messageMap[code] || '播放失败，可能被跨域限制',
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

          // 读取本地去广告开关（与 Play 页一致，默认开启）
          const blockAdEnabled = (() => {
            try {
              const v = localStorage.getItem('enable_blockad');
              if (v !== null) return v === 'true';
            } catch {
              // ignore
            }
            return true;
          })();
          const customAdFilterCode = (() => {
            try {
              return (
                localStorage.getItem(CUSTOM_AD_FILTER_CODE_CACHE_KEY) || ''
              );
            } catch {
              return '';
            }
          })();

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
                      response.data = filterAdsFromM3U8(response.data, {
                        type: options.adFilterType,
                        customCode: customAdFilterCode,
                      });
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
            loader: blockAdEnabled
              ? CustomHlsJsLoader
              : HlsCtor.DefaultConfig.loader,
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

          instance.on(HlsCtor.Events.FRAG_LOADING, () => {
            if (!hasFirstFrag) {
              fragStart = performance.now();
            }
          });

          instance.on(
            HlsCtor.Events.FRAG_LOADED,
            (_evt: unknown, data: unknown) => {
              if (hasFirstFrag) return;
              if (!data || typeof data !== 'object' || !('payload' in data))
                return;
              const payload = (data as { payload?: unknown }).payload;
              if (!(payload instanceof ArrayBuffer)) return;
              hasFirstFrag = true;
              const duration = performance.now() - fragStart;
              loadSpeed = formatSpeed(payload.byteLength, duration);
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
  ) => Promise<{ quality: string; loadSpeed: string; pingTimeMs: number }>;
  /** 命中未过期结果时直接复用，跳过真实探测（保留原始 checkedAt） */
  resolveCache?: (
    item: EpisodeSourceCheckPlanItem,
  ) => EpisodeSourceCheckResult | null;
  onUpdate: (next: EpisodeSourceCheckResult) => void;
}): Promise<void> {
  const { plan, signal, resolveUrl, probeUrl, resolveCache, onUpdate } = params;

  const emit = (patch: Omit<EpisodeSourceCheckResult, 'checkedAt'>) => {
    onUpdate({ ...patch, checkedAt: Date.now() });
  };

  for (let idx = 0; idx < plan.length; idx += 1) {
    const item = plan[idx];
    if (signal.aborted) {
      for (let i = idx; i < plan.length; i += 1) {
        emit({
          sourceKey: plan[i].sourceKey,
          episodeIndex: plan[i].episodeIndex,
          status: 'cancelled',
          message: '已取消',
        });
      }
      return;
    }

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
        message: '可播放',
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
}
