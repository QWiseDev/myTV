/* eslint-disable @typescript-eslint/no-explicit-any -- hls.js loader 与错误事件回调的类型宽松写法，与原直播页实现逐字一致 */

import { devicePerformance, isMobile, isSafari } from '@/lib/utils';

type HlsConstructor = typeof import('hls.js').default;
type HlsConfigRuntime = typeof import('@/app/play/utils/hlsConfig');

/**
 * keyLoadError 计数容器。
 *
 * 调用方须在每次渲染时新建一个容器传入：原实现中计数器是组件函数体内
 * 每次渲染重新声明的 `let` 变量，hls 错误回调持有其创建时那次渲染的绑定，
 * 切换频道时的"重置"只作用于当次渲染的变量（对既有回调不可见）。
 * 以容器对象按引用传递可完整保留这一闭包语义，请勿改为模块级单例。
 */
export interface HlsKeyLoadErrorCounters {
  keyLoadErrorCount: number;
  lastErrorTime: number;
}

export interface M3u8LoaderCallbacks {
  /** 标记不支持/不可用的类型（原页面的 setUnsupportedType） */
  onUnsupportedType: (type: string) => void;
  /** 同步视频加载蒙层状态（原页面的 setIsVideoLoading） */
  onVideoLoadingChange: (loading: boolean) => void;
}

export interface M3u8LoaderOptions {
  /** 读取当前直播源 key（原实现闭包内读取 currentSourceRef.current?.key） */
  getSourceKey: () => string;
  /** keyLoadError 计数容器（每次渲染新建，见类型注释） */
  errorCounters: HlsKeyLoadErrorCounters;
  /** 页面状态回调 */
  callbacks: M3u8LoaderCallbacks;
}

// 错误重试阈值：10秒内超过3次keyLoadError就认为频道不可用
const MAX_KEY_ERRORS = 3;
const ERROR_TIMEOUT = 10000;

// 自定义 hls.js loader：为所有请求附加直播源参数，并按需追加浏览器直连参数
function createCustomHlsJsLoader(
  Hls: HlsConstructor,
  getSourceKey: () => string
) {
  return class CustomHlsJsLoader extends Hls.DefaultConfig.loader {
    constructor(config: any) {
      super(config);
      const load = this.load.bind(this);
      this.load = function (context: any, config: any, callbacks: any) {
        // 所有的请求都带一个 source 参数
        try {
          const url = new URL(context.url);
          url.searchParams.set('moontv-source', getSourceKey());
          context.url = url.toString();
        } catch (error) {
          // ignore
        }
        // 拦截manifest和level请求
        if (
          (context as any).type === 'manifest' ||
          (context as any).type === 'level'
        ) {
          // 判断是否浏览器直连
          const isLiveDirectConnectStr =
            localStorage.getItem('liveDirectConnect');
          const isLiveDirectConnect = isLiveDirectConnectStr === 'true';
          if (isLiveDirectConnect) {
            // 浏览器直连，使用 URL 对象处理参数
            try {
              const url = new URL(context.url);
              url.searchParams.set('allowCORS', 'true');
              context.url = url.toString();
            } catch (error) {
              // 如果 URL 解析失败，回退到字符串拼接
              context.url = context.url + '&allowCORS=true';
            }
          }
        }
        // 执行原始load方法
        load(context, config, callbacks);
      };
    }
  };
}

/**
 * 直播 m3u8 流加载与 hls.js 错误恢复状态机（自直播页原样外移）。
 *
 * 内含针对直播可靠性的防御性设计，调用方请勿"修复"：
 * - keyLoadError 指数退避重试与频道不可用判定（MAX_KEY_ERRORS / ERROR_TIMEOUT）；
 * - 片段解析错误、时间戳追加错误的兜底恢复；
 * - NETWORK_ERROR 重新拉取 manifest、MEDIA_ERROR 先 recoverMediaError
 *   再回退 swapAudioCodec 的防御性 try/catch 与静默降级分支。
 */
export function m3u8Loader(
  video: HTMLVideoElement,
  url: string,
  Hls: HlsConstructor,
  hlsRuntime: HlsConfigRuntime,
  { getSourceKey, errorCounters, callbacks }: M3u8LoaderOptions
) {
  const { onUnsupportedType, onVideoLoadingChange } = callbacks;

  if (!Hls) {
    console.error('HLS.js 未加载');
    return;
  }

  // 清理之前的 HLS 实例
  if (video.hls) {
    try {
      video.hls.destroy();
      video.hls = null;
    } catch (err) {
      console.warn('清理 HLS 实例时出错:', err);
    }
  }

  // 基于最新 hls.js 源码和设备性能的智能配置
  const hlsConfig = {
    debug: false,

    // Worker 配置 - 根据设备性能和浏览器能力
    enableWorker: !isMobile && !isSafari && devicePerformance !== 'low',

    // 低延迟模式 - 仅在高性能非移动设备上启用 (源码默认为true)
    lowLatencyMode: !isMobile && devicePerformance === 'high',

    // 缓冲管理优化 - 参考 hls.js 源码默认值进行设备优化
    backBufferLength: devicePerformance === 'low' ? 30 : Infinity, // 源码默认 Infinity
    maxBufferLength:
      devicePerformance === 'low'
        ? 20
        : devicePerformance === 'medium'
        ? 30
        : 30, // 源码默认 30
    maxBufferSize:
      devicePerformance === 'low'
        ? 30 * 1000 * 1000
        : devicePerformance === 'medium'
        ? 60 * 1000 * 1000
        : 60 * 1000 * 1000, // 源码默认 60MB
    maxBufferHole: 0.1, // 源码默认值，允许小的缓冲区空洞

    // Gap Controller 配置 - 缓冲区空洞处理 (源码中的默认值)
    nudgeOffset: 0.1, // 跳过小间隙的偏移量
    nudgeMaxRetry: 3, // 最大重试次数 (源码默认)

    // 自适应比特率优化 - 参考源码默认值
    abrEwmaDefaultEstimate:
      devicePerformance === 'low'
        ? 500000
        : devicePerformance === 'medium'
        ? 500000
        : 500000, // 源码默认 500k
    abrBandWidthFactor: 0.95, // 源码默认
    abrBandWidthUpFactor: 0.7, // 源码默认
    abrMaxWithRealBitrate: false, // 源码默认
    maxStarvationDelay: 4, // 源码默认
    maxLoadingDelay: 4, // 源码默认

    // 直播流特殊配置
    startLevel: undefined, // 源码默认，自动选择起始质量
    capLevelToPlayerSize: false, // 源码默认

    // 渐进式加载 (直播流建议关闭)
    progressive: false,

    // 浏览器特殊优化
    liveDurationInfinity: false, // 源码默认，Safari兼容

    // 移动设备网络优化 - 使用新的LoadPolicy配置
    ...(isMobile && {
      // 使用 fragLoadPolicy 替代旧的配置方式
      fragLoadPolicy: {
        default: {
          maxTimeToFirstByteMs: 8000,
          maxLoadTimeMs: 20000,
          timeoutRetry: {
            maxNumRetry: 2,
            retryDelayMs: 1000,
            maxRetryDelayMs: 8000,
            backoff: 'linear' as const,
          },
          errorRetry: {
            maxNumRetry: 3,
            retryDelayMs: 1000,
            maxRetryDelayMs: 8000,
            backoff: 'linear' as const,
          },
        },
      },
    }),

    loader: createCustomHlsJsLoader(Hls, getSourceKey),
  };

  const hls = new Hls(hlsConfig);

  hls.loadSource(url);
  hls.attachMedia(video);
  video.hls = hls;

  hls.on(Hls.Events.ERROR, function (event: any, data: any) {
    console.error('HLS Error:', event, data);

    // 使用最新版本的错误详情类型
    if (data.details === Hls.ErrorDetails.KEY_LOAD_ERROR) {
      const currentTime = Date.now();

      // 重置计数器（如果距离上次错误超过10秒）
      if (currentTime - errorCounters.lastErrorTime > ERROR_TIMEOUT) {
        errorCounters.keyLoadErrorCount = 0;
      }

      errorCounters.keyLoadErrorCount++;
      errorCounters.lastErrorTime = currentTime;

      console.warn(
        `KeyLoadError count: ${errorCounters.keyLoadErrorCount}/${MAX_KEY_ERRORS}`
      );

      // 如果短时间内keyLoadError次数过多，认为这个频道不可用
      if (errorCounters.keyLoadErrorCount >= MAX_KEY_ERRORS) {
        console.error('Too many keyLoadErrors, marking channel as unavailable');
        onUnsupportedType('channel-unavailable');
        onVideoLoadingChange(false);
        hls.destroy();
        return;
      }

      // 使用指数退避重试策略
      if (errorCounters.keyLoadErrorCount <= 2) {
        setTimeout(() => {
          try {
            hls.startLoad();
          } catch (e) {
            console.warn('Failed to restart load after key error:', e);
          }
        }, 1000 * errorCounters.keyLoadErrorCount);
      }
      return;
    }

    // hls.js 1.6.x 增强：处理片段解析错误（针对initPTS修复）
    if (hlsRuntime.isRecoverableFragmentParsingError(data)) {
      try {
        hls.startLoad();
      } catch (e) {
        console.warn('重新加载失败:', e);
      }
      return;
    }

    // hls.js 1.6.x 增强：处理直播中的时间戳错误（直播回搜修复）
    if (hlsRuntime.isRecoverableTimestampAppendError(data)) {
      try {
        // 对于直播，直接重新开始加载最新片段
        hls.trigger(Hls.Events.BUFFER_RESET, undefined);
        hls.startLoad();
      } catch (e) {
        console.warn('直播缓冲区重置失败:', e);
        hls.startLoad();
      }
      return;
    }

    // 处理其他特定错误类型
    if (data.details === Hls.ErrorDetails.BUFFER_INCOMPATIBLE_CODECS_ERROR) {
      console.error('Incompatible codecs error - fatal');
      onUnsupportedType('codec-incompatible');
      onVideoLoadingChange(false);
      hls.destroy();
      return;
    }

    if (data.fatal) {
      switch (data.type) {
        case Hls.ErrorTypes.NETWORK_ERROR:

          // 根据具体的网络错误类型进行处理
          if (data.details === Hls.ErrorDetails.MANIFEST_LOAD_ERROR) {
            setTimeout(() => {
              try {
                hls.loadSource(url);
              } catch (e) {
                console.error('Failed to reload source:', e);
              }
            }, 2000);
          } else {
            try {
              hls.startLoad();
            } catch (e) {
              console.error('Failed to restart after network error:', e);
            }
          }
          break;

        case Hls.ErrorTypes.MEDIA_ERROR:
          try {
            hls.recoverMediaError();
          } catch (e) {
            console.error(
              'Failed to recover from media error, trying audio codec swap:',
              e
            );
            try {
              // 使用音频编解码器交换作为备选方案
              hls.swapAudioCodec();
              hls.recoverMediaError();
            } catch (swapError) {
              console.error('Audio codec swap also failed:', swapError);
              onUnsupportedType('media-error');
              onVideoLoadingChange(false);
            }
          }
          break;

        default:
          onUnsupportedType('fatal-error');
          onVideoLoadingChange(false);
          hls.destroy();
          break;
      }
    }
  });

  // 添加性能监控和缓冲管理事件
  hls.on(Hls.Events.FRAG_LOADED, (event, data) => {
    if (
      data.frag.stats &&
      data.frag.stats.loading &&
      data.frag.stats.loaded
    ) {
      const loadTime =
        data.frag.stats.loading.end - data.frag.stats.loading.start;
      if (loadTime > 0 && data.frag.stats.loaded > 0) {
        const throughputBps = (data.frag.stats.loaded * 8 * 1000) / loadTime; // bits per second
        const _throughputMbps = throughputBps / 1000000;
      }
    }
  });

  // 监听缓冲区卡顿和自动恢复
  hls.on(Hls.Events.ERROR, (event, data) => {
    if (data.details === Hls.ErrorDetails.BUFFER_STALLED_ERROR) {
      console.warn('Buffer stalled, attempting recovery...');
      // 不做任何操作，让 HLS.js 自动处理
    } else if (data.details === Hls.ErrorDetails.BUFFER_SEEK_OVER_HOLE) {
      console.warn('Buffer hole detected, HLS.js will handle seeking...');
      // 不做任何操作，让 HLS.js 自动跳过空洞
    }
  });

}
