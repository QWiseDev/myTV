import type { HlsConfig } from 'hls.js';
import type { MutableRefObject } from 'react';

import { filterAdsFromM3U8, filterAdsFromM3U8Async } from '@/lib/ad-filter';

import { appendSourceFragmentParam } from './fragmentUrlParams';
import { stripMpegTsPrefix } from './mpegTs';

type HlsConstructor = typeof import('hls.js').default;

type HlsLoaderContext = {
  type?: string;
  url?: string;
};

type HlsLoaderResponse = {
  data?: unknown;
};

type HlsLoaderCallbacks = {
  onSuccess?: (
    response: HlsLoaderResponse,
    stats: unknown,
    context: HlsLoaderContext,
    networkDetails: unknown,
  ) => void;
};

export interface AdFilterHlsLoaderDeps {
  /** 是否启用去广告（实时读取，开关切换后对新请求立即生效） */
  blockAdEnabledRef: MutableRefObject<boolean>;
  /** 自定义去广告规则代码（异步加载，可能为空字符串） */
  customAdFilterCodeRef: MutableRefObject<string>;
  /** 当前源标识，用于选择对应的去广告规则 */
  source: string;
}

/**
 * 构造带去广告能力的自定义 hls.js loader：
 * - manifest / level 响应按去广告规则重写 m3u8 文本（含自定义规则代码）；
 * - fragment 请求按源配置追加防盗链参数（如爱奇艺源的 domianurl）；
 * - fragment 响应剥离 mpegts 前缀，保证 ArtPlayer 可正常解码。
 */
export function createAdFilterHlsLoader(
  Hls: HlsConstructor,
  deps: AdFilterHlsLoaderDeps,
) {
  const { blockAdEnabledRef, customAdFilterCodeRef, source } = deps;

  return class CustomHlsJsLoader extends Hls.DefaultConfig.loader {
    constructor(config: HlsConfig) {
      super(config);
      let cancelled = false;
      const lifecycleTarget = this as unknown as {
        abort?: (...args: unknown[]) => unknown;
        destroy?: (...args: unknown[]) => unknown;
      };
      const rawAbort =
        typeof lifecycleTarget.abort === 'function'
          ? lifecycleTarget.abort.bind(this)
          : null;
      if (rawAbort) {
        lifecycleTarget.abort = (...args: unknown[]) => {
          cancelled = true;
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
          return rawDestroy(...args);
        };
      }

      const load = this.load.bind(this);
      this.load = function (
        context: HlsLoaderContext,
        conf: unknown,
        callbacks: HlsLoaderCallbacks,
      ) {
        cancelled = false;
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
        } else if (context.type === 'media-fragment') {
          // hls.js 1.5+ 分片请求的 context.type 是 'media-fragment'（非 'fragment'）
          // 部分 CDN（如爱奇艺源）要求 ts 分片请求携带防盗链参数
          if (typeof context.url === 'string') {
            context.url = appendSourceFragmentParam(source, context.url);
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
        load(context, conf, callbacks);
      };
    }
  };
}
