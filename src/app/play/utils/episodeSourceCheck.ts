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

export function isLikelyHlsUrl(url: string): boolean {
  return /\.m3u8($|\?)/i.test(url);
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

export async function measurePingTimeMs(
  url: string,
  options: {
    signal?: AbortSignal;
    timeoutMs?: number;
  } = {},
): Promise<number> {
  const timeoutMs =
    typeof options.timeoutMs === 'number' ? options.timeoutMs : 2000;
  const start = performance.now();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const onAbort = () => controller.abort();
  if (options.signal) {
    if (options.signal.aborted) {
      clearTimeout(timer);
      return Math.round(performance.now() - start);
    }
    options.signal.addEventListener('abort', onAbort, { once: true });
  }

  try {
    await fetch(url, {
      method: 'HEAD',
      mode: 'no-cors',
      signal: controller.signal,
    });
  } catch {
    // ignore
  } finally {
    clearTimeout(timer);
    if (options.signal) {
      options.signal.removeEventListener('abort', onAbort);
    }
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

  const pingPromise = measurePingTimeMs(url, { signal: options.signal });

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
      const safeResolve = async () => {
        if (done) return;
        done = true;
        const pingTimeMs = await pingPromise;
        clearTimeout(timeoutId);
        options.signal.removeEventListener('abort', onAbort);
        video.removeEventListener('loadedmetadata', onLoadedMetadata);
        video.removeEventListener('playing', onPlaying);
        video.removeEventListener('error', onVideoError);
        cleanup();
        resolve({ quality, loadSpeed, pingTimeMs });
      };

      const safeReject = async (message: string, details?: string) => {
        if (done) return;
        done = true;
        await pingPromise;
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
  ) => Promise<{ quality: string; loadSpeed: string; pingTimeMs: number }>;
  onUpdate: (next: EpisodeSourceCheckResult) => void;
}): Promise<void> {
  const { plan, signal, resolveUrl, probeUrl, onUpdate } = params;

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

      const metrics = await probeUrl(url, signal);
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
