import type { HlsConfig } from 'hls.js';
import type { MutableRefObject } from 'react';

import { filterAdsFromM3U8, filterAdsFromM3U8Async } from '@/lib/ad-filter';

import {
  consumePrefetchedManifest,
  consumePrefetchedSegment,
} from './episodePrefetch';
import { fetchFragmentWithStallWatchdog } from './fragmentFetch';
import type { PrefetchClaim } from './fragmentPrefetcher';
import { appendSourceFragmentParam } from './fragmentUrlParams';
import { stripMpegTsPrefix } from './mpegTs';

type HlsConstructor = typeof import('hls.js').default;

type HlsLoaderContext = {
  type?: string;
  url?: string;
  rangeStart?: number;
  rangeEnd?: number;
  frag?: { sn?: number | string };
};

type HlsLoaderResponse = {
  url?: string;
  data?: unknown;
  code?: number;
};

type HlsLoaderStats = {
  aborted: boolean;
  loaded: number;
  total: number;
  bwEstimate: number;
  loading: { start: number; first: number; end: number };
};

type HlsLoaderCallbacks = {
  onSuccess?: (
    response: HlsLoaderResponse,
    stats: unknown,
    context: HlsLoaderContext,
    networkDetails: unknown,
  ) => void;
  onError?: (
    response: { code: number; text: string },
    context: HlsLoaderContext,
    networkDetails: unknown,
    stats: unknown,
  ) => void;
  onTimeout?: (
    stats: unknown,
    context: HlsLoaderContext,
    networkDetails: unknown,
  ) => void;
  onAbort?: (
    stats: unknown,
    context: HlsLoaderContext,
    networkDetails: unknown,
  ) => void;
  onProgress?: (
    stats: unknown,
    context: HlsLoaderContext,
    data: unknown,
    networkDetails: unknown,
  ) => void;
};

type HlsLoaderConfiguration = {
  timeout?: number;
  loadPolicy?: { maxLoadTimeMs?: number };
};

/** hls.js BaseLoader 的内部字段：从预取缓存或对冲请求交付时需要按原生 loader 的方式维护 */
type LoaderInternals = {
  stats: HlsLoaderStats | null;
  context: HlsLoaderContext | null;
  config: unknown;
  callbacks: HlsLoaderCallbacks | null;
};

export interface AdFilterHlsLoaderDeps {
  /** 是否启用去广告（实时读取，开关切换后对新请求立即生效） */
  blockAdEnabledRef: MutableRefObject<boolean>;
  /** 自定义去广告规则代码（异步加载，可能为空字符串） */
  customAdFilterCodeRef: MutableRefObject<string>;
  /** 当前源标识，用于选择对应的去广告规则 */
  source: string;
  /** 慢源并发预取器：命中时直接从缓存交付分片，并在首片首字节到达时提前解除让路 */
  fragmentPrefetcher?: {
    claim: (url: string | undefined | null) => PrefetchClaim | null;
    notifyUrgentProgress?: (sn?: number) => void;
  } | null;
  /** 可选自定义 fetch（主要用于单测注入对冲请求） */
  fetchImpl?: typeof fetch;
  /** 可选时钟注入（单测用） */
  perfNow?: () => number;
  /** 急需分片超过该时长无进展时发起对冲请求（毫秒）；<=0 关闭，默认 4500ms */
  hedgeDelayMs?: number;
  /** 急需分片连续无新字节的硬中断超时（毫秒）；<=0 关闭，默认 8000ms */
  noProgressTimeoutMs?: number;
}

const DEFAULT_HEDGE_DELAY_MS = 4_500;
const DEFAULT_URGENT_NO_PROGRESS_TIMEOUT_MS = 8_000;

function unrefTimerIfPossible(timer: ReturnType<typeof setTimeout>): void {
  if (
    typeof timer === 'object' &&
    timer !== null &&
    'unref' in timer &&
    typeof (timer as { unref?: unknown }).unref === 'function'
  ) {
    (timer as { unref: () => void }).unref();
  }
}

/**
 * 构造带去广告、内存预热直喂与对冲抗假死能力的自定义 hls.js loader：
 * - manifest / level 优先命中跨集内存预热缓存，并按去广告规则重写 m3u8 文本；
 * - fragment 优先命中慢源并发预取或跨集内存预热，自动剥离 mpegts 前缀；
 * - 急需分片（起播/拖动/在途预取停滞）超过 4.5s 无进展自动发起对冲请求竞速，
 *   连续 8s 无新字节立即超时重连，避免单条 TCP 假死白等 90~120s。
 */
export function createAdFilterHlsLoader(
  Hls: HlsConstructor,
  deps: AdFilterHlsLoaderDeps,
) {
  const {
    blockAdEnabledRef,
    customAdFilterCodeRef,
    source,
    fragmentPrefetcher,
  } = deps;
  const perfNow =
    deps.perfNow ??
    (() =>
      typeof performance !== 'undefined' ? performance.now() : Date.now());
  const hedgeDelayMs =
    typeof deps.hedgeDelayMs === 'number'
      ? deps.hedgeDelayMs
      : DEFAULT_HEDGE_DELAY_MS;
  const noProgressTimeoutMs =
    typeof deps.noProgressTimeoutMs === 'number'
      ? deps.noProgressTimeoutMs
      : DEFAULT_URGENT_NO_PROGRESS_TIMEOUT_MS;

  const resolveFetchImpl = (): typeof fetch | undefined => {
    if (deps.fetchImpl) return deps.fetchImpl;
    return typeof fetch === 'function' ? fetch.bind(globalThis) : undefined;
  };

  return class CustomHlsJsLoader extends Hls.DefaultConfig.loader {
    constructor(config: HlsConfig) {
      super(config);
      let cancelled = false;
      let servingClaim: PrefetchClaim | null = null;
      let servingTimer: ReturnType<typeof setTimeout> | null = null;
      let hedgeTimer: ReturnType<typeof setTimeout> | null = null;
      let stallWatchdogTimer: ReturnType<typeof setTimeout> | null = null;
      let hedgeController: AbortController | null = null;
      let suppressNativeAbort = false;

      const internals = this as unknown as LoaderInternals;
      const lifecycleTarget = this as unknown as {
        abort?: (...args: unknown[]) => unknown;
        destroy?: (...args: unknown[]) => unknown;
      };

      const clearAuxiliaryWatchers = () => {
        if (servingTimer) {
          clearTimeout(servingTimer);
          servingTimer = null;
        }
        if (hedgeTimer) {
          clearTimeout(hedgeTimer);
          hedgeTimer = null;
        }
        if (stallWatchdogTimer) {
          clearTimeout(stallWatchdogTimer);
          stallWatchdogTimer = null;
        }
        if (hedgeController) {
          hedgeController.abort();
          hedgeController = null;
        }
      };

      const releaseClaim = () => {
        clearAuxiliaryWatchers();
        if (servingClaim) {
          servingClaim.cancel();
          servingClaim = null;
          if (internals.stats) internals.stats.aborted = true;
        }
      };

      const rawAbort =
        typeof lifecycleTarget.abort === 'function'
          ? lifecycleTarget.abort.bind(this)
          : null;
      if (rawAbort) {
        lifecycleTarget.abort = (...args: unknown[]) => {
          cancelled = true;
          releaseClaim();
          return rawAbort(...args);
        };
      }
      const rawDestroy =
        typeof lifecycleTarget.destroy === 'function'
          ? lifecycleTarget.destroy.bind(this)
          : null;
      if (rawDestroy) {
        lifecycleTarget.destroy = (...args: unknown[]) => {
          cancelled = true;
          releaseClaim();
          return rawDestroy(...args);
        };
      }

      const load = this.load.bind(this);

      const populateStatsFromFragment = (
        stats: HlsLoaderStats,
        fragment: {
          startedAt: number;
          firstByteAt: number;
          endAt: number;
          bytes: number;
        },
      ) => {
        stats.loading.start = fragment.startedAt;
        stats.loading.first = fragment.firstByteAt;
        stats.loading.end = fragment.endAt;
        stats.loaded = stats.total = fragment.bytes;
        const transferMs = Math.max(1, fragment.endAt - fragment.firstByteAt);
        stats.bwEstimate = (fragment.bytes * 8000) / transferMs;
      };

      const serveFromPrefetch = (
        claim: PrefetchClaim,
        context: HlsLoaderContext,
        conf: unknown,
        callbacks: HlsLoaderCallbacks,
      ) => {
        const stats = internals.stats;
        if (!stats) {
          claim.cancel();
          load(context, conf, callbacks);
          return;
        }
        // 与 BaseLoader.load 保持一致的状态，使 abort() 能正常回调 onAbort
        internals.context = context;
        internals.config = conf;
        internals.callbacks = callbacks;
        stats.loading.start = perfNow();
        stats.loading.first = 0;
        stats.loaded = 0;
        stats.aborted = false;
        servingClaim = claim;

        const loaderConf = (conf || {}) as HlsLoaderConfiguration;
        const timeoutMs =
          loaderConf.timeout ?? loaderConf.loadPolicy?.maxLoadTimeMs ?? 0;
        let settled = false;

        if (timeoutMs > 0) {
          servingTimer = setTimeout(() => {
            if (settled || cancelled) return;
            settled = true;
            clearAuxiliaryWatchers();
            servingClaim = null;
            claim.cancel();
            callbacks.onTimeout?.(stats, context, null);
          }, timeoutMs);
          unrefTimerIfPossible(servingTimer);
        }

        const deliverSuccess = (fragment: {
          url: string;
          data: ArrayBuffer;
          bytes: number;
          startedAt: number;
          firstByteAt: number;
          endAt: number;
        }) => {
          if (settled) return;
          settled = true;
          clearAuxiliaryWatchers();
          servingClaim = null;
          if (cancelled || !internals.callbacks || !internals.stats) return;
          populateStatsFromFragment(stats, fragment);
          callbacks.onSuccess?.(
            { url: fragment.url, data: fragment.data, code: 200 },
            stats,
            context,
            null,
          );
        };

        // 如果领取的是在途预取且长时间无进展，发起对冲请求竞速
        const fetchImpl = resolveFetchImpl();
        const progressNow = claim.getProgress?.();
        const shouldArmClaimHedge =
          Boolean(fetchImpl) &&
          hedgeDelayMs > 0 &&
          typeof context.url === 'string' &&
          (!progressNow || progressNow.status === 'loading');

        if (shouldArmClaimHedge && fetchImpl && context.url) {
          const hedgeUrl = context.url;
          const scheduleClaimHedge = (delayMs: number) => {
            hedgeTimer = setTimeout(() => {
              hedgeTimer = null;
              if (settled || cancelled) return;
              const latest = claim.getProgress?.();
              if (latest && latest.status === 'done') return;
              if (
                latest &&
                latest.firstByteAt > 0 &&
                perfNow() - latest.lastProgressAt < hedgeDelayMs
              ) {
                const remain = Math.max(
                  200,
                  hedgeDelayMs - (perfNow() - latest.lastProgressAt),
                );
                scheduleClaimHedge(remain);
                return;
              }
              hedgeController = new AbortController();
              void fetchFragmentWithStallWatchdog(hedgeUrl, {
                fetchImpl,
                signal: hedgeController.signal,
                noProgressTimeoutMs,
                maxLoadTimeMs: timeoutMs > 0 ? timeoutMs : 45_000,
                perfNow,
                mode: 'cors',
                credentials: 'same-origin',
              })
                .then((hedged) => {
                  if (settled || cancelled) return;
                  claim.cancel();
                  deliverSuccess(hedged);
                })
                .catch(() => {
                  // 对冲失败时静默让原预取链路继续或走回退
                });
            }, delayMs);
            unrefTimerIfPossible(hedgeTimer);
          };
          scheduleClaimHedge(hedgeDelayMs);
        }

        claim.promise.then(
          (fragment) => {
            deliverSuccess(fragment);
          },
          () => {
            if (settled) return;
            settled = true;
            clearAuxiliaryWatchers();
            servingClaim = null;
            if (cancelled) return;
            // 预取失败：重置为未使用状态后回退到 hls.js 原生加载
            stats.loading.start = 0;
            stats.loading.first = 0;
            stats.loading.end = 0;
            stats.aborted = false;
            internals.context = null;
            internals.config = null;
            internals.callbacks = null;
            loadWithUrgentProtection(context, conf, callbacks);
          },
        );
      };

      const loadWithUrgentProtection = (
        context: HlsLoaderContext,
        conf: unknown,
        callbacks: HlsLoaderCallbacks,
      ) => {
        if (
          context.type !== 'media-fragment' ||
          context.rangeEnd ||
          typeof context.url !== 'string'
        ) {
          load(context, conf, callbacks);
          return;
        }

        const targetUrl = context.url;
        const fragSn =
          typeof context.frag?.sn === 'number' ? context.frag.sn : undefined;
        let nativeSettled = false;
        let notifiedUrgentProgress = false;
        let lastLoadedBytes = 0;
        let lastProgressAt = perfNow();

        const loaderConf = (conf || {}) as HlsLoaderConfiguration;
        const configuredTimeoutMs =
          loaderConf.timeout ?? loaderConf.loadPolicy?.maxLoadTimeMs ?? 0;
        const effectiveNoProgressMs =
          noProgressTimeoutMs > 0
            ? configuredTimeoutMs > 0
              ? Math.min(noProgressTimeoutMs, configuredTimeoutMs)
              : noProgressTimeoutMs
            : 0;

        const origOnSuccess = callbacks.onSuccess;
        const origOnError = callbacks.onError;
        const origOnTimeout = callbacks.onTimeout;
        const origOnAbort = callbacks.onAbort;
        const origOnProgress = callbacks.onProgress;

        const armNoProgressWatchdog = () => {
          if (stallWatchdogTimer) {
            clearTimeout(stallWatchdogTimer);
            stallWatchdogTimer = null;
          }
          if (effectiveNoProgressMs <= 0) return;
          stallWatchdogTimer = setTimeout(() => {
            stallWatchdogTimer = null;
            if (nativeSettled || cancelled) return;
            nativeSettled = true;
            clearAuxiliaryWatchers();
            suppressNativeAbort = true;
            try {
              rawAbort?.();
            } finally {
              suppressNativeAbort = false;
            }
            origOnTimeout?.(internals.stats, context, null);
          }, effectiveNoProgressMs);
          unrefTimerIfPossible(stallWatchdogTimer);
        };

        const fetchImpl = resolveFetchImpl();
        const scheduleNativeHedge = (delayMs: number) => {
          if (!fetchImpl || hedgeDelayMs <= 0) return;
          hedgeTimer = setTimeout(() => {
            hedgeTimer = null;
            if (nativeSettled || cancelled) return;
            if (
              lastLoadedBytes > 0 &&
              perfNow() - lastProgressAt < hedgeDelayMs
            ) {
              const remain = Math.max(
                200,
                hedgeDelayMs - (perfNow() - lastProgressAt),
              );
              scheduleNativeHedge(remain);
              return;
            }
            hedgeController = new AbortController();
            void fetchFragmentWithStallWatchdog(targetUrl, {
              fetchImpl,
              signal: hedgeController.signal,
              noProgressTimeoutMs:
                effectiveNoProgressMs > 0
                  ? effectiveNoProgressMs
                  : DEFAULT_URGENT_NO_PROGRESS_TIMEOUT_MS,
              maxLoadTimeMs:
                configuredTimeoutMs > 0 ? configuredTimeoutMs : 45_000,
              perfNow,
              mode: 'cors',
              credentials: 'same-origin',
              onFirstByte: () => {
                if (!notifiedUrgentProgress) {
                  notifiedUrgentProgress = true;
                  fragmentPrefetcher?.notifyUrgentProgress?.(fragSn);
                }
              },
            })
              .then((hedged) => {
                if (nativeSettled || cancelled) return;
                nativeSettled = true;
                clearAuxiliaryWatchers();
                suppressNativeAbort = true;
                try {
                  rawAbort?.();
                } finally {
                  suppressNativeAbort = false;
                }
                const stats = internals.stats;
                if (stats) {
                  stats.aborted = false;
                  populateStatsFromFragment(stats, hedged);
                }
                origOnSuccess?.(
                  { url: hedged.url, data: hedged.data, code: 200 },
                  stats,
                  context,
                  null,
                );
              })
              .catch(() => {
                // 对冲失败时继续等待原生加载或看门狗兜底
              });
          }, delayMs);
          unrefTimerIfPossible(hedgeTimer);
        };

        const wrappedCallbacks: HlsLoaderCallbacks = {
          ...callbacks,
          onProgress: (stats, ctx, data, networkDetails) => {
            if (nativeSettled || cancelled) return;
            const loaded =
              stats && typeof stats === 'object'
                ? Number((stats as { loaded?: unknown }).loaded ?? 0)
                : 0;
            if (loaded > lastLoadedBytes) {
              lastLoadedBytes = loaded;
              lastProgressAt = perfNow();
              armNoProgressWatchdog();
              if (!notifiedUrgentProgress) {
                notifiedUrgentProgress = true;
                fragmentPrefetcher?.notifyUrgentProgress?.(fragSn);
              }
            }
            origOnProgress?.(stats, ctx, data, networkDetails);
          },
          onSuccess: (response, stats, ctx, networkDetails) => {
            if (nativeSettled) return;
            nativeSettled = true;
            clearAuxiliaryWatchers();
            origOnSuccess?.(response, stats, ctx, networkDetails);
          },
          onError: (response, ctx, networkDetails, stats) => {
            if (nativeSettled) return;
            nativeSettled = true;
            clearAuxiliaryWatchers();
            origOnError?.(response, ctx, networkDetails, stats);
          },
          onTimeout: (stats, ctx, networkDetails) => {
            if (nativeSettled) return;
            nativeSettled = true;
            clearAuxiliaryWatchers();
            origOnTimeout?.(stats, ctx, networkDetails);
          },
          onAbort: (stats, ctx, networkDetails) => {
            if (suppressNativeAbort) return;
            nativeSettled = true;
            clearAuxiliaryWatchers();
            origOnAbort?.(stats, ctx, networkDetails);
          },
        };

        armNoProgressWatchdog();
        scheduleNativeHedge(hedgeDelayMs);
        load(context, conf, wrappedCallbacks);
      };

      this.load = function (
        context: HlsLoaderContext,
        conf: unknown,
        callbacks: HlsLoaderCallbacks,
      ) {
        cancelled = false;
        clearAuxiliaryWatchers();
        let prefetchClaim: PrefetchClaim | null = null;

        if (context.type === 'manifest' || context.type === 'level') {
          const onSuccess = callbacks.onSuccess;
          if (typeof onSuccess === 'function') {
            callbacks.onSuccess = function (
              response: HlsLoaderResponse,
              stats: unknown,
              ctx: HlsLoaderContext,
            ) {
              if (
                !blockAdEnabledRef.current ||
                !response.data ||
                typeof response.data !== 'string'
              ) {
                return onSuccess(response, stats, ctx, null);
              }

              const customCode = customAdFilterCodeRef.current.trim();
              if (!customCode) {
                response.data = filterAdsFromM3U8(response.data, {
                  type: source,
                });
                return onSuccess(response, stats, ctx, null);
              }

              void filterAdsFromM3U8Async(response.data, {
                type: source,
                customCode,
                onCustomError: (error) => {
                  console.error(
                    '执行自定义去广告代码失败，使用默认规则:',
                    error,
                  );
                },
              }).then((filtered) => {
                if (cancelled) return;
                response.data = filtered;
                onSuccess(response, stats, ctx, null);
              });
            };
          }

          // 优先命中跨集内存预热清单，零网络等待直接交付（依然走上方去广告拦截）
          const cachedManifest = consumePrefetchedManifest(context.url);
          if (cachedManifest && internals.stats) {
            const stats = internals.stats;
            internals.context = context;
            internals.config = conf;
            internals.callbacks = callbacks;
            const now = perfNow();
            stats.loading.start = now;
            stats.loading.first = now;
            stats.loading.end = now;
            stats.loaded = stats.total = cachedManifest.text.length;
            stats.aborted = false;
            Promise.resolve().then(() => {
              if (cancelled || !internals.callbacks || !internals.stats) return;
              callbacks.onSuccess?.(
                {
                  url: cachedManifest.url,
                  data: cachedManifest.text,
                  code: 200,
                },
                stats,
                context,
                null,
              );
            });
            return;
          }
        } else if (context.type === 'media-fragment') {
          const rawUrl = context.url;
          // 预取缓存以 hls.js 原始分片地址为键（改写防盗链参数之前）
          if (fragmentPrefetcher && !context.rangeEnd) {
            prefetchClaim = fragmentPrefetcher.claim(rawUrl);
          }
          // hls.js 1.5+ 分片请求的 context.type 是 'media-fragment'（非 'fragment'）
          // 部分 CDN（如爱奇艺源）要求 ts 分片请求携带防盗链参数
          if (typeof context.url === 'string') {
            context.url = appendSourceFragmentParam(source, context.url);
          }
          // 并发预取未命中时，检查跨集内存预热分片缓存（切集首 1~2 片零等待直喂）
          if (!prefetchClaim && !context.rangeEnd) {
            const cachedSegment =
              consumePrefetchedSegment(rawUrl) ??
              consumePrefetchedSegment(context.url);
            if (cachedSegment) {
              prefetchClaim = {
                promise: Promise.resolve(cachedSegment),
                cancel: () => undefined,
                getProgress: () => ({
                  status: 'done',
                  startedAt: cachedSegment.startedAt,
                  firstByteAt: cachedSegment.firstByteAt,
                  lastProgressAt: cachedSegment.endAt,
                  receivedBytes: cachedSegment.bytes,
                }),
              };
            }
          }
          const onSuccess = callbacks.onSuccess;
          if (typeof onSuccess === 'function') {
            callbacks.onSuccess = function (
              response: HlsLoaderResponse,
              stats: unknown,
              ctx: HlsLoaderContext,
            ) {
              response.data = stripMpegTsPrefix(response.data);
              return onSuccess(response, stats, ctx, null);
            };
          }
        }
        if (prefetchClaim) {
          serveFromPrefetch(prefetchClaim, context, conf, callbacks);
          return;
        }
        loadWithUrgentProtection(context, conf, callbacks);
      };
    }
  };
}
