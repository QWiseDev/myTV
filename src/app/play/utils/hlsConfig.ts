/**
 * HLS 配置工具
 * 根据设备类型和性能优化 HLS.js 配置
 */

import type { HlsConfig } from 'hls.js';
import Hls from 'hls.js';

interface DeviceInfo {
  isMobile: boolean;
  isIOS: boolean;
  isIOS13: boolean;
}

interface HlsConfigOptions {
  deviceInfo: DeviceInfo;
  blockAdEnabled: boolean;
  customLoader?: HlsConfig['loader'];
}

type PlayerHlsConfig = Partial<HlsConfig> & Record<string, unknown>;

interface HlsErrorData {
  type?: string;
  details?: string;
  fatal?: boolean;
  response?: unknown;
  networkDetails?: unknown;
  err?: unknown;
  error?: unknown;
  context?: {
    url?: string;
  };
  url?: string;
}

export type HlsRuntimeInstance = InstanceType<typeof Hls> & {
  levels: Array<{ height?: number }>;
  currentLevel: number;
};

const MANIFEST_LIKE_ERROR_DETAILS = new Set<unknown>([
  'manifestLoadError',
  'levelLoadError',
  'fragLoadError',
  Hls.ErrorDetails.MANIFEST_LOAD_ERROR,
  Hls.ErrorDetails.LEVEL_LOAD_ERROR,
  Hls.ErrorDetails.FRAG_LOAD_ERROR,
]);

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : null;
}

export function extractHlsHttpStatus(errorData: unknown): number | null {
  const errorRecord = asRecord(errorData);
  const candidates = [
    errorRecord?.response,
    errorRecord?.networkDetails,
    errorRecord?.err,
    errorData,
  ];

  for (const candidate of candidates) {
    const candidateRecord = asRecord(candidate);
    if (!candidateRecord) {
      continue;
    }

    const status = candidateRecord.status;
    const code = candidateRecord.code;
    const numericStatus =
      typeof status === 'number'
        ? status
        : typeof code === 'number'
          ? code
          : null;

    if (typeof numericStatus === 'number' && Number.isFinite(numericStatus)) {
      return numericStatus;
    }
  }

  return null;
}

export function isServerUnavailableManifestError(errorData: unknown): boolean {
  const status = extractHlsHttpStatus(errorData);
  const errorRecord = asRecord(errorData);

  return (
    typeof status === 'number' &&
    status >= 500 &&
    MANIFEST_LIKE_ERROR_DETAILS.has(errorRecord?.details)
  );
}

export function isRecoverableFragmentParsingError(errorData: unknown): boolean {
  return asRecord(errorData)?.details === Hls.ErrorDetails.FRAG_PARSING_ERROR;
}

export function isRecoverableTimestampAppendError(errorData: unknown): boolean {
  const errorRecord = asRecord(errorData);
  if (
    !errorRecord ||
    errorRecord.details !== Hls.ErrorDetails.BUFFER_APPEND_ERROR
  ) {
    return false;
  }

  const errRecord = asRecord(errorRecord.err);
  const message =
    typeof errRecord?.message === 'string'
      ? errRecord.message
      : typeof errorRecord.error === 'string'
        ? errorRecord.error
        : '';

  return message.toLowerCase().includes('timestamp');
}

/**
 * 🚀 内存优化：根据内存压力获取自适应HLS配置
 */
export function getAdaptiveHlsConfig(
  options: HlsConfigOptions,
  memoryPressure?: 'low' | 'medium' | 'high' | 'critical',
): PlayerHlsConfig {
  const baseConfig = getOptimizedHlsConfig(options);

  if (!memoryPressure || memoryPressure === 'low') {
    return baseConfig;
  }

  // 根据内存压力调整配置
  return {
    ...baseConfig,

    // 🚀 激进的内存优化配置
    maxBufferLength:
      memoryPressure === 'critical'
        ? 2
        : memoryPressure === 'high'
          ? 3
          : memoryPressure === 'medium'
            ? 5
            : baseConfig.maxBufferLength,

    backBufferLength:
      memoryPressure === 'critical'
        ? 0.5
        : memoryPressure === 'high'
          ? 1
          : memoryPressure === 'medium'
            ? 2
            : baseConfig.backBufferLength,

    maxBufferSize:
      memoryPressure === 'critical'
        ? 8 * 1000 * 1000
        : memoryPressure === 'high'
          ? 12 * 1000 * 1000
          : memoryPressure === 'medium'
            ? 20 * 1000 * 1000
            : baseConfig.maxBufferSize,

    maxMaxBufferLength:
      memoryPressure === 'critical'
        ? 10
        : memoryPressure === 'high'
          ? 30
          : memoryPressure === 'medium'
            ? 60
            : baseConfig.maxMaxBufferLength,

    // 进一步减少网络超时和重试
    maxLoadingDelay:
      memoryPressure === 'critical' ? 1 : baseConfig.maxLoadingDelay,
    fragLoadPolicy: {
      default: {
        maxTimeToFirstByteMs:
          memoryPressure === 'critical'
            ? 3000
            : (baseConfig.fragLoadPolicy?.default?.maxTimeToFirstByteMs ??
              8000),
        maxLoadTimeMs:
          memoryPressure === 'critical'
            ? 30000
            : (baseConfig.fragLoadPolicy?.default?.maxLoadTimeMs ?? 30000),
        timeoutRetry: {
          maxNumRetry: Math.max(
            1,
            (baseConfig.fragLoadPolicy?.default?.timeoutRetry?.maxNumRetry ||
              2) - 1,
          ),
          retryDelayMs: 0,
          maxRetryDelayMs: 0,
        },
        errorRetry: {
          maxNumRetry: Math.max(
            1,
            (baseConfig.fragLoadPolicy?.default?.errorRetry?.maxNumRetry || 3) -
              1,
          ),
          retryDelayMs: memoryPressure === 'critical' ? 500 : 1000,
          maxRetryDelayMs: memoryPressure === 'critical' ? 2000 : 4000,
        },
      },
    },

    // 关闭额外的特性以节省CPU
    enableWebVTT: false,
    preferManagedMediaSource: memoryPressure !== 'critical',
    nudgeOffset: 0.1, // 减少偏移计算
    nudgeMaxRetry: 1, // 减少重试次数
  };
}

/**
 * 获取优化的 HLS 配置
 * 参考 HLS.js 官方源码的最佳实践
 */
export function getOptimizedHlsConfig(
  options: HlsConfigOptions,
): PlayerHlsConfig {
  const { deviceInfo, customLoader } = options;
  const { isMobile, isIOS, isIOS13 } = deviceInfo;

  return {
    debug: false,
    // ✅ 优化：智能使用 Worker，避免额外线程开销
    enableWorker: !isMobile, // 移动设备关闭 Worker 避免电池消耗
    // 参考 HLS.js config.ts：移动设备关闭低延迟模式以节省资源
    lowLatencyMode: false, // ✅ 强制关闭低延迟模式，降低 CPU 占用

    // 增强的视频兼容性配置
    preferManagedMediaSource: true, // 优先使用Managed Media Source以提升兼容性
    capLevelToPlayerSize: true, // 限制码率到播放器大小，减少过载
    capLevelOnFPSDrop: true, // 当帧率下降时自动降低码率
    autoStartLoad: true,
    startLevel: -1, // 自动选择起始码率级别

    // 🎯 增强的缓冲和MediaSource配置 - 提升编码兼容性
    // ✅ 优化：增加缓冲长度，改善网速慢时的播放体验
    maxBufferLength: isMobile
      ? isIOS13
        ? 12
        : isIOS
          ? 15
          : 20 // iOS13+: 12s, iOS: 15s, Android: 20s
      : 25, // ✅ 桌面从 15s 增到 25s，改善卡顿
    backBufferLength: isMobile
      ? isIOS13
        ? 8
        : isIOS
          ? 12
          : 15 // iOS13+更保守
      : 15, // ✅ 桌面从 10s 增到 15s

    /* 缓冲大小配置 - 增强视频编码兼容性 */
    // ✅ 优化：减少缓冲区大小，降低内存占用
    maxBufferSize: isMobile
      ? isIOS13
        ? 30 * 1000 * 1000 // 增加iOS13+缓冲以处理复杂编码
        : isIOS
          ? 40 * 1000 * 1000 // 增加iOS缓冲
          : 50 * 1000 * 1000 // 增加Android缓冲
      : 40 * 1000 * 1000, // ✅ 桌面从 80MB 降到 40MB，减少内存压力

    // 增强的MediaSource配置
    maxAudioBufferSize: 30 * 1000 * 1000, // ✅ 从 60MB 降到 30MB
    maxVideoBufferSize: isMobile ? 50 * 1000 * 1000 : 60 * 1000 * 1000, // ✅ 桌面从 100MB 降到 60MB

    /* 网络加载优化 - 参考 defaultLoadPolicy */
    maxLoadingDelay: isMobile ? (isIOS13 ? 2 : 3) : 4, // iOS13+设备更快超时
    maxBufferHole: isMobile ? (isIOS13 ? 0.05 : 0.1) : 0.1, // 减少缓冲洞容忍度

    /* Fragment管理 - 参考官方配置 */
    liveDurationInfinity: false, // 避免无限缓冲 (官方默认false)
    liveBackBufferLength: isMobile ? (isIOS13 ? 3 : 5) : undefined, // 已废弃，保持兼容

    /* 高级优化配置 - 参考 StreamControllerConfig */
    maxMaxBufferLength: isMobile ? (isIOS13 ? 90 : 180) : 180, // ✅ 从 120s 增到 180s，允许更多缓冲应对慢网速
    maxFragLookUpTolerance: isMobile ? 0.1 : 0.25, // 片段查找容忍度

    /* ABR优化 - 参考 ABRControllerConfig */
    abrEwmaFastLive: isMobile ? 2 : 3, // 移动端更快的码率切换
    abrEwmaSlowLive: isMobile ? 6 : 9,
    abrBandWidthFactor: isMobile ? 0.8 : 0.95, // 移动端更保守的带宽估计

    /* 启动优化 */
    startFragPrefetch: !isMobile, // 移动端关闭预取以节省资源
    testBandwidth: !isIOS13, // iOS13+关闭带宽测试以快速启动

    /* Loader配置 - 参考官方 fragLoadPolicy */
    fragLoadPolicy: {
      default: {
        maxTimeToFirstByteMs: isMobile ? 6000 : 10000,
        maxLoadTimeMs: isMobile ? 60000 : 120000,
        timeoutRetry: {
          maxNumRetry: isMobile ? 2 : 4,
          retryDelayMs: 0,
          maxRetryDelayMs: 0,
        },
        errorRetry: {
          maxNumRetry: isMobile ? 3 : 6,
          retryDelayMs: 1000,
          maxRetryDelayMs: isMobile ? 4000 : 8000,
        },
      },
    },

    /* 自定义loader */
    loader: customLoader || Hls.DefaultConfig.loader,
  };
}

/**
 * HLS 错误处理
 */
export function handleHlsError(
  event: unknown,
  data: HlsErrorData,
  hls: HlsRuntimeInstance,
  video: HTMLVideoElement,
  onFatalError?: (errorMessage: string) => void,
): void {
  console.error('HLS Error:', event, data);

  // 构建用户友好的错误信息
  const getErrorMessage = (errorData: HlsErrorData): string => {
    if (errorData.type === Hls.ErrorTypes.NETWORK_ERROR) {
      // 提取具体网络错误信息
      const url = errorData.context?.url || errorData.url || '未知地址';
      const details = errorData.details || '';
      let message = `网络错误`;

      // 尝试从错误中提取更多详细信息
      if (details === 'manifestLoadError') {
        message = `无法加载播放列表 (manifestLoadError)`;
      } else if (details === 'levelLoadError') {
        message = `无法加载播放级别 (levelLoadError)`;
      } else if (details === 'fragLoadError') {
        message = `无法加载视频片段 (fragLoadError)`;
      }

      // 尝试获取底层网络错误
      const networkError =
        errorData.response || errorData.networkDetails || errorData.err;
      const networkErrorRecord = asRecord(networkError);
      if (networkErrorRecord) {
        if (networkErrorRecord.code) {
          message += ` - 错误代码: ${networkErrorRecord.code}`;
        }
        if (networkErrorRecord.status) {
          message += ` - HTTP状态: ${networkErrorRecord.status}`;
        }
        if (networkErrorRecord.statusText) {
          message += ` - ${networkErrorRecord.statusText}`;
        }
      }

      message += `\n地址: ${url}`;

      return message;
    }

    if (errorData.type === Hls.ErrorTypes.MEDIA_ERROR) {
      return `媒体错误 - 视频编码或格式不兼容`;
    }

    if (errorData.type === Hls.ErrorTypes.OTHER_ERROR) {
      return `其他错误: ${errorData.details || errorData.type}`;
    }

    return `播放错误: ${errorData.details || errorData.type}`;
  };

  // 提取原始网络错误详情
  const extractNetworkErrorDetails = (
    errorData: HlsErrorData,
  ): string | null => {
    // 尝试从各种可能的属性中获取错误信息
    const details = errorData.details || '';
    const networkError =
      errorData.response || errorData.networkDetails || errorData.err;

    if (details === 'manifestLoadError' && networkError) {
      const networkErrorRecord = asRecord(networkError);
      if (typeof networkErrorRecord?.message === 'string') {
        return networkErrorRecord.message;
      }
      if (typeof networkError === 'string') {
        return networkError;
      }
    }

    return null;
  };

  // hls.js 1.6.x 增强：处理片段解析错误（针对initPTS修复）
  if (isRecoverableFragmentParsingError(data)) {
    console.log('片段解析错误，尝试重新加载...');
    hls.startLoad();
    return;
  }

  // hls.js 1.6.x 增强：处理时间戳相关错误（直播回搜修复）
  if (isRecoverableTimestampAppendError(data)) {
    console.log('时间戳错误，清理缓冲区并重新加载...');
    try {
      const currentTime = video.currentTime;
      hls.trigger(Hls.Events.BUFFER_RESET, undefined);
      hls.startLoad(currentTime);
    } catch (e) {
      console.warn('缓冲区重置失败:', e);
      hls.startLoad();
    }
    return;
  }

  if (data.fatal) {
    const errorMessage = getErrorMessage(data);

    switch (data.type) {
      case Hls.ErrorTypes.NETWORK_ERROR: {
        const status = extractHlsHttpStatus(data);

        // 上游 5xx 往往会重试刷屏，直接交给上层自动切源
        if (isServerUnavailableManifestError(data)) {
          console.warn(`检测到上游 ${status}，停止当前源并触发切源`);
          try {
            hls.destroy();
          } catch (e) {
            console.warn('销毁 HLS 实例失败:', e);
          }
          if (onFatalError) {
            onFatalError(
              `${errorMessage}\n\n上游服务暂不可用（HTTP ${status}），已尝试切换其他播放源`,
            );
          }
          return;
        }

        console.log('网络错误，尝试恢复...');
        hls.startLoad();

        // 获取详细错误信息并传递给回调
        const networkDetails = extractNetworkErrorDetails(data);

        // manifest 级别错误直接触发回调
        if (data.details === 'manifestLoadError') {
          setTimeout(() => {
            if (onFatalError) {
              onFatalError(
                errorMessage +
                  (networkDetails ? `\n\n详情: ${networkDetails}` : ''),
              );
            }
          }, 500);
        }
        break;
      }
      case Hls.ErrorTypes.MEDIA_ERROR:
        console.log('媒体错误，尝试恢复...', data);

        // 尝试恢复媒体错误
        try {
          hls.recoverMediaError();

          // 如果恢复失败，尝试降级处理
          if (
            data.details === Hls.ErrorDetails.MSE_ERROR ||
            data.details === Hls.ErrorDetails.MSE_UNSUPPORTED_CODEC
          ) {
            console.log('检测到编码兼容性问题，尝试降级处理...');

            // 尝试重新加载更低码率的级别
            setTimeout(() => {
              if (hls.levels && hls.levels.length > 0) {
                // 选择最低的码率级别以提高兼容性
                const lowestLevel = Math.min(
                  ...hls.levels.map((level) => level.height || 0),
                );
                hls.currentLevel = hls.levels.findIndex(
                  (level) => level.height === lowestLevel,
                );
                hls.startLoad(video.currentTime || 0);
              }
            }, 1000);
          }
          return;
        } catch (error) {
          console.error('媒体错误恢复失败:', error);
          if (onFatalError) {
            onFatalError(errorMessage + '\n\n建议：尝试刷新页面或检查网络连接');
          }
        }
        break;
      default:
        console.log('无法恢复的错误');
        hls.destroy();
        if (onFatalError) {
          onFatalError(errorMessage);
        }
        break;
    }
  } else {
    // 非致命错误也记录，但可以通过回调通知用户
    const errorMessage = getErrorMessage(data);
    console.warn('非致命HLS错误:', errorMessage);
  }
}

/**
 * 🚀 内存优化：初始化自适应HLS实例
 */
export function initAdaptiveHls(
  video: HTMLVideoElement,
  url: string,
  options: HlsConfigOptions,
  memoryPressure?: 'low' | 'medium' | 'high' | 'critical',
  onError?: (event: unknown, data: HlsErrorData) => void,
): HlsRuntimeInstance | null {
  if (!Hls) {
    console.error('HLS.js 未加载');
    return null;
  }

  // 清理旧的 HLS 实例
  if (video.hls) {
    video.hls.destroy();
  }

  // 🚀 使用自适应配置
  const hlsConfig = memoryPressure
    ? getAdaptiveHlsConfig(options, memoryPressure)
    : getOptimizedHlsConfig(options);

  // 内存压力日志
  if (memoryPressure && memoryPressure !== 'low') {
    console.log(`🧠 HLS配置自适应: 内存压力=${memoryPressure}`);
    console.log('📊 缓冲配置:', {
      maxBufferLength: hlsConfig.maxBufferLength,
      backBufferLength: hlsConfig.backBufferLength,
      maxBufferSize: hlsConfig.maxBufferSize,
    });
  }

  // 创建新的 HLS 实例
  const hls = new Hls(hlsConfig as Partial<HlsConfig>) as HlsRuntimeInstance;

  hls.loadSource(url);
  hls.attachMedia(video);
  video.hls = hls;

  // 错误处理
  hls.on(Hls.Events.ERROR, (event, data) => {
    if (onError) {
      onError(event, data);
    } else {
      handleHlsError(event, data, hls, video);
    }
  });

  return hls;
}

/**
 * 初始化 HLS 实例
 */
export function initHls(
  video: HTMLVideoElement,
  url: string,
  options: HlsConfigOptions,
  onError?: (event: unknown, data: HlsErrorData) => void,
): HlsRuntimeInstance | null {
  return initAdaptiveHls(video, url, options, undefined, onError);
}
