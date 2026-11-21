import type { HLSLevel } from './smartCache';
import { smartCache } from './smartCache';

export interface StreamInfo {
  level: number;
  bitrate: number;
  width: number;
  height: number;
  name: string;
  resolution: string;
  bandwidthText: string;
  codecSet?: string;
  frameRate?: string;
}

export interface HLSStreamInfo {
  levels: StreamInfo[];
  currentLevel: number;
  autoLevel: boolean;
  totalLevels: number;
  maxResolution?: string;
  minResolution?: string;
  maxBandwidth?: number;
  minBandwidth?: number;
}

export interface HlsInstanceLike {
  levels?: HLSLevel[];
  currentLevel?: number;
  autoLevelEnabled?: boolean;
  on: (event: string, listener: () => void) => void;
  off: (event: string, listener: () => void) => void;
}

/**
 * 获取 HLS 流信息
 * @param hlsInstance HLS.js 实例
 * @param m3u8Url 可选的 M3U8 URL，用于从缓存读取
 * @returns 流信息对象
 */
export function getHLSStreamInfo(
  hlsInstance: HlsInstanceLike | null | undefined,
  m3u8Url?: string,
): HLSStreamInfo | null {
  // ✅ 优先从缓存读取完整流信息
  if (m3u8Url) {
    try {
      const cached = smartCache.get(m3u8Url);

      if (cached?.levels && Array.isArray(cached.levels)) {
        const levels = cached.levels.map((level, index): StreamInfo => {
          const resolution = `${level.width}x${level.height}`;
          const bandwidthText = formatBandwidth(level.bitrate);

          return {
            level: index,
            bitrate: level.bitrate,
            width: level.width || 0,
            height: level.height || 0,
            name: level.name || `${level.height}p`,
            resolution,
            bandwidthText,
            codecSet: level.codecSet,
            frameRate: level.frameRate?.toString(),
          };
        });

        return {
          levels,
          currentLevel: hlsInstance?.currentLevel ?? -1,
          autoLevel: hlsInstance?.autoLevelEnabled ?? true,
          totalLevels: levels.length,
          maxResolution: cached.maxResolution,
          minResolution: cached.minResolution,
          maxBandwidth: cached.maxBandwidth,
          minBandwidth: cached.minBandwidth,
        };
      }
    } catch (error) {
      console.warn('⚠️ 从缓存读取流信息失败，使用 HLS 实例:', error);
    }
  }

  // 回退到原有逻辑：从 HLS 实例读取
  if (!hlsInstance || !hlsInstance.levels || hlsInstance.levels.length === 0) {
    return null;
  }

  const levels = hlsInstance.levels.map((level, index): StreamInfo => {
    const resolution = `${level.width}x${level.height}`;
    const bandwidthText = formatBandwidth(level.bitrate);

    return {
      level: index,
      bitrate: level.bitrate,
      width: level.width || 0,
      height: level.height || 0,
      name: level.name || `Level ${index}`,
      resolution,
      bandwidthText,
      codecSet: level.codecSet,
    };
  });

  const currentLevel = hlsInstance.currentLevel ?? -1;
  const autoLevel = hlsInstance.autoLevelEnabled ?? true;

  // 计算最大最小分辨率
  const validLevels = levels.filter(
    (l: StreamInfo) => l.width > 0 && l.height > 0,
  );
  const sortedByResolution = validLevels.sort(
    (a: StreamInfo, b: StreamInfo) => b.width * b.height - a.width * a.height,
  );
  const maxResolution = sortedByResolution[0]?.resolution;
  const minResolution =
    sortedByResolution[sortedByResolution.length - 1]?.resolution;

  // 计算最大最小带宽
  const validBandwidths = levels
    .filter((l: StreamInfo) => l.bitrate > 0)
    .map((l: StreamInfo) => l.bitrate);
  const maxBandwidth =
    validBandwidths.length > 0 ? Math.max(...validBandwidths) : undefined;
  const minBandwidth =
    validBandwidths.length > 0 ? Math.min(...validBandwidths) : undefined;

  return {
    levels,
    currentLevel,
    autoLevel,
    totalLevels: levels.length,
    maxResolution,
    minResolution,
    maxBandwidth,
    minBandwidth,
  };
}

/**
 * 格式化带宽显示
 * @param bitrate 比特率 (bps)
 * @returns 格式化后的带宽字符串
 */
export function formatBandwidth(bitrate: number): string {
  if (!bitrate || bitrate <= 0) {
    return '未知';
  }

  if (bitrate >= 1000000) {
    return `${(bitrate / 1000000).toFixed(2)} Mbps`;
  } else if (bitrate >= 1000) {
    return `${Math.round(bitrate / 1000)} kbps`;
  } else {
    return `${bitrate} bps`;
  }
}
