import type { HlsConfig } from 'hls.js';
import type { MutableRefObject } from 'react';

import { filterAdsFromM3U8 } from '@/lib/ad-filter';

import { stripMpegTsPrefix } from './mpegTs';

type HlsConstructor = typeof import('hls.js').default;

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
      const load = this.load.bind(this);
      this.load = function (
        context: HlsLoaderContext,
        conf: unknown,
        callbacks: HlsLoaderCallbacks,
      ) {
        if (context.type === 'manifest' || context.type === 'level') {
          const onSuccess = callbacks.onSuccess;
          if (typeof onSuccess === 'function') {
            callbacks.onSuccess = function (
              response: HlsLoaderResponse,
              stats: unknown,
              ctx: HlsLoaderContext,
            ) {
              if (
                blockAdEnabledRef.current &&
                response.data &&
                typeof response.data === 'string'
              ) {
                response.data = filterAdsFromM3U8(response.data, {
                  type: source,
                  customCode: customAdFilterCodeRef.current,
                  onCustomError: (error) => {
                    console.error(
                      '执行自定义去广告代码失败，使用默认规则:',
                      error,
                    );
                  },
                });
              }
              return onSuccess(response, stats, ctx, null);
            };
          }
        } else if (context.type === 'fragment') {
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
