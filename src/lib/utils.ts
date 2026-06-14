import he from 'he';

import type { DoubanImageProxyType } from './douban-proxy-detector';
import { getBestImageProxySync } from './douban-proxy-detector';

// 增强的设备检测逻辑，参考最新的设备特征
const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '';

// iOS 设备检测 (包括 iPad 的新版本检测)
const hasMsStream = typeof window !== 'undefined' && 'MSStream' in window;
const isIOS = /iPad|iPhone|iPod/i.test(userAgent) && !hasMsStream;
const isIOS13Plus =
  isIOS ||
  (userAgent.includes('Macintosh') &&
    typeof navigator !== 'undefined' &&
    navigator.maxTouchPoints >= 1);

// iPad 专门检测 (包括新的 iPad Pro)
const isIPad =
  /iPad/i.test(userAgent) ||
  (userAgent.includes('Macintosh') &&
    typeof navigator !== 'undefined' &&
    navigator.maxTouchPoints > 2);

// Android 设备检测
const isAndroid = /Android/i.test(userAgent);

// 移动设备检测 (更精确的判断)
const isMobile =
  isIOS13Plus ||
  isAndroid ||
  /webOS|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);

// 平板设备检测
const isTablet =
  isIPad ||
  (isAndroid && !/Mobile/i.test(userAgent)) ||
  (typeof screen !== 'undefined' && screen.width >= 768);

// Safari 浏览器检测 (更精确)
const isSafari =
  /^(?:(?!chrome|android).)*safari/i.test(userAgent) && !isAndroid;

// WebKit 检测
const isWebKit = /WebKit/i.test(userAgent);

// 设备性能等级估算
const getDevicePerformanceLevel = (): 'low' | 'medium' | 'high' => {
  if (typeof navigator === 'undefined') return 'medium';

  // 基于硬件并发数判断
  const cores = navigator.hardwareConcurrency || 4;

  if (isMobile) {
    return cores >= 6 ? 'medium' : 'low';
  } else {
    return cores >= 8 ? 'high' : cores >= 4 ? 'medium' : 'low';
  }
};

const devicePerformance = getDevicePerformanceLevel();

// 导出设备检测结果供其他模块使用
export {
  devicePerformance,
  getDevicePerformanceLevel,
  isAndroid,
  isIOS,
  isIOS13Plus,
  isIPad,
  isMobile,
  isSafari,
  isTablet,
  isWebKit,
};

const DOUBAN_IMAGE_PROXY_TYPES: DoubanImageProxyType[] = [
  'cmliussss-cdn-ali',
  'cmliussss-cdn-tencent',
  'img3',
  'direct',
  'server',
];

// 豆瓣图自动 fallback 链：第三方 CDN（不限 Referer，浏览器可直连）优先，
// /api/image-proxy（服务端带 Referer）兜底。不含 direct/img3 等官方域名——
// 浏览器 no-referrer 直连豆瓣官方域名必被 418 限流，留之只会浪费注定失败的请求。
const DOUBAN_IMAGE_FALLBACK_TYPES: DoubanImageProxyType[] = [
  'cmliussss-cdn-ali',
  'cmliussss-cdn-tencent',
  'server',
];

function getRuntimeConfigValue(key: string): string {
  if (typeof window === 'undefined') return '';
  const runtimeConfig = (
    window as Window & { RUNTIME_CONFIG?: Record<string, string> }
  ).RUNTIME_CONFIG;
  return runtimeConfig?.[key] || '';
}

function getLocalStorageValue(key: string): string {
  if (typeof localStorage === 'undefined') return '';

  try {
    return localStorage.getItem(key) || '';
  } catch {
    return '';
  }
}

function getConfiguredImageProxyType(): DoubanImageProxyType | 'custom' {
  const configuredType =
    getLocalStorageValue('doubanImageProxyType') ||
    getRuntimeConfigValue('DOUBAN_IMAGE_PROXY_TYPE');

  if (configuredType === 'custom') return 'custom';
  if (
    DOUBAN_IMAGE_PROXY_TYPES.includes(configuredType as DoubanImageProxyType)
  ) {
    return configuredType as DoubanImageProxyType;
  }

  return getBestImageProxySync();
}

function getConfiguredImageProxyUrl(): string {
  return (
    getLocalStorageValue('doubanImageProxyUrl') ||
    getRuntimeConfigValue('DOUBAN_IMAGE_PROXY')
  );
}

function applyDoubanImageProxy(
  originalUrl: string,
  proxyType: DoubanImageProxyType | 'custom'
): string {
  switch (proxyType) {
    case 'custom': {
      const proxyUrl = getConfiguredImageProxyUrl();
      return proxyUrl
        ? `${proxyUrl}${encodeURIComponent(originalUrl)}`
        : originalUrl;
    }
    case 'server':
      return `/api/image-proxy?url=${encodeURIComponent(originalUrl)}`;
    case 'cmliussss-cdn-ali':
      return originalUrl.replace(
        /img\d+\.doubanio\.com/g,
        'img.doubanio.cmliussss.com'
      );
    case 'cmliussss-cdn-tencent':
      return originalUrl.replace(
        /img\d+\.doubanio\.com/g,
        'img.doubanio.cmliussss.net'
      );
    case 'img3':
      return originalUrl.replace(/img\d+\.doubanio\.com/g, 'img3.doubanio.com');
    case 'direct':
    default:
      return originalUrl;
  }
}

export function processImageUrl(originalUrl: string): string {
  if (!originalUrl || !originalUrl.includes('doubanio.com')) {
    return originalUrl;
  }

  return applyDoubanImageProxy(originalUrl, getConfiguredImageProxyType());
}

export function getImageFallbackUrls(originalUrl: string): string[] {
  if (!originalUrl || !originalUrl.includes('doubanio.com')) {
    return [originalUrl].filter(Boolean);
  }

  const preferredType = getConfiguredImageProxyType();
  // 过滤掉豆瓣官方域名直连类型（direct/img3）：浏览器以 no-referrer 加载
  // img*.doubanio.com / img3.doubanio.com 必被 418 限流，留在链中只会浪费一次
  // 注定失败的请求。豆瓣图改走第三方 CDN（不限 Referer）+ image-proxy 兜底。
  const proxyTypes: Array<DoubanImageProxyType | 'custom'> = [
    preferredType,
    ...DOUBAN_IMAGE_FALLBACK_TYPES,
  ].filter((type) => type !== 'direct' && type !== 'img3');

  // 兜底：若配置导致全部被过滤，至少保留阿里云 CDN
  if (proxyTypes.length === 0) {
    proxyTypes.push('cmliussss-cdn-ali');
  }

  return Array.from(
    new Set(
      proxyTypes.map((proxyType) =>
        applyDoubanImageProxy(originalUrl, proxyType)
      )
    )
  ).filter(Boolean);
}

/**
 * 从m3u8地址获取视频质量等级和网络信息
 * @param m3u8Url m3u8播放列表的URL
 * @param timeout 超时时间（毫秒），默认5000ms
 * @returns Promise<{quality: string, loadSpeed: string, pingTime: number}> 视频质量等级和网络信息
 */
export async function getVideoResolutionFromM3u8(
  m3u8Url: string,
  timeout = 5000
): Promise<{
  quality: string;
  loadSpeed: string;
  pingTime: number;
}> {
  // 动态导入智能缓存
  const { smartCache } = await import('@/app/play/utils/smartCache');

  // 尝试从智能缓存获取
  const cached = smartCache.get(m3u8Url);
  if (cached) {
    return {
      quality: cached.quality,
      loadSpeed: cached.loadSpeed,
      pingTime: cached.pingTime,
    };
  }

  const userAgent = navigator.userAgent;
  const isMobile =
    /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);

  try {
    // 检测是否为iPad（无论什么浏览器）
    const isIPad = /iPad/i.test(userAgent);

    if (isIPad) {
      // iPad使用文本解析避免崩溃
      console.log('iPad检测，使用文本解析避免崩溃');

      const startTime = performance.now();
      try {
        const response = await fetch(m3u8Url, {
          signal: AbortSignal.timeout(Math.min(timeout, 3000)),
        });
        const text = await response.text();
        const pingTime = Math.round(performance.now() - startTime);

        // ✅ 解析主播放列表获取分辨率信息
        const resolutions: Array<{
          width: number;
          height: number;
          bitrate: number;
        }> = [];
        const lines = text.split('\n');

        for (let i = 0; i < lines.length; i++) {
          if (lines[i].startsWith('#EXT-X-STREAM-INF:')) {
            const resMatch = lines[i].match(/RESOLUTION=(\d+)x(\d+)/);
            const bandwidthMatch = lines[i].match(/BANDWIDTH=(\d+)/);

            if (resMatch) {
              resolutions.push({
                width: parseInt(resMatch[1]),
                height: parseInt(resMatch[2]),
                bitrate: bandwidthMatch ? parseInt(bandwidthMatch[1]) : 0,
              });
            }
          }
        }

        if (resolutions.length > 0) {
          // 按分辨率降序排序
          resolutions.sort((a, b) => b.height - a.height || b.width - a.width);
          const best = resolutions[0];
          const worst = resolutions[resolutions.length - 1];
          const height = best.height;

          const quality =
            height >= 2160
              ? '4K'
              : height >= 1440
              ? '2K'
              : height >= 1080
              ? '1080p'
              : height >= 720
              ? '720p'
              : height >= 480
              ? '480p'
              : height > 0
              ? 'SD'
              : '未知';

          const result = {
            quality,
            loadSpeed: '未知', // iPad 不测速避免崩溃
            pingTime,
            levels: resolutions.map((r) => ({
              width: r.width,
              height: r.height,
              bitrate: r.bitrate,
              name: `${r.height}p`,
            })),
            maxResolution: `${best.width}x${best.height}`,
            minResolution: `${worst.width}x${worst.height}`,
            maxBandwidth: best.bitrate,
            minBandwidth: worst.bitrate,
          };

          // 缓存结果
          smartCache.set(m3u8Url, {
            ...result,
            success: true,
          });

          console.log(
            `✅ iPad 文本解析成功: ${quality} (${resolutions.length}个清晰度)`
          );
          return result;
        }

        // 没有找到分辨率信息，可能是媒体播放列表（非主列表）
        console.log('⚠️ iPad: 未找到分辨率信息，可能是媒体播放列表');
        return {
          quality: '未知',
          loadSpeed: '未知',
          pingTime,
        };
      } catch (error) {
        console.warn('⚠️ iPad 文本解析失败:', error);
        return {
          quality: '未知',
          loadSpeed: '未知',
          pingTime: 9999,
        };
      }
    }

    // 尝试快速路径：仅解析清单（不挂载video，不加载分片）
    const tryFastManifest = async (): Promise<{
      quality: string;
      loadSpeed: string;
      pingTime: number;
      levels?: Array<{
        width: number;
        height: number;
        bitrate: number;
        name: string;
      }>;
      maxResolution?: string;
      minResolution?: string;
      maxBandwidth?: number;
      minBandwidth?: number;
    } | null> => {
      const pingStartFast = performance.now();

      try {
        const response = await fetch(m3u8Url, {
          signal: AbortSignal.timeout(Math.min(timeout, isMobile ? 2500 : 3500)),
        });
        const pingTimeFast = Math.round(performance.now() - pingStartFast);

        if (!response.ok) {
          return {
            quality: '未知',
            loadSpeed: '未知',
            pingTime: pingTimeFast,
          };
        }

        const text = await response.text();
        const lines = text.split('\n');
        const levels: Array<{
          width: number;
          height: number;
          bitrate: number;
          name: string;
        }> = [];

        for (const rawLine of lines) {
          const line = rawLine.trim();
          if (!line.startsWith('#EXT-X-STREAM-INF:')) {
            continue;
          }

          const resMatch = line.match(/RESOLUTION=(\d+)x(\d+)/);
          if (!resMatch) {
            continue;
          }

          const bandwidthMatch = line.match(/BANDWIDTH=(\d+)/);
          const width = parseInt(resMatch[1], 10);
          const height = parseInt(resMatch[2], 10);
          const bitrate = bandwidthMatch ? parseInt(bandwidthMatch[1], 10) : 0;

          levels.push({
            width,
            height,
            bitrate,
            name: `${height}p`,
          });
        }

        if (levels.length === 0) {
          return {
            quality: '未知',
            loadSpeed: '未知',
            pingTime: pingTimeFast,
          };
        }

        const sortedLevels = [...levels].sort(
          (a, b) => b.height - a.height || b.bitrate - a.bitrate
        );
        const best = sortedLevels[0];
        const worst = sortedLevels[sortedLevels.length - 1];

        const quality =
          best.height >= 2160
            ? '4K'
            : best.height >= 1440
            ? '2K'
            : best.height >= 1080
            ? '1080p'
            : best.height >= 720
            ? '720p'
            : best.height >= 480
            ? '480p'
            : best.height > 0
            ? 'SD'
            : '未知';

        const speedKBps = best.bitrate > 0 ? best.bitrate / 8 / 1024 : 0;
        const loadSpeed =
          speedKBps >= 1024
            ? `${(speedKBps / 1024).toFixed(2)} MB/s`
            : speedKBps > 0
            ? `${speedKBps.toFixed(2)} KB/s`
            : '未知';

        return {
          quality,
          loadSpeed,
          pingTime: pingTimeFast,
          levels: sortedLevels,
          maxResolution: `${best.width}x${best.height}`,
          minResolution: `${worst.width}x${worst.height}`,
          maxBandwidth: best.bitrate,
          minBandwidth: worst.bitrate,
        };
      } catch {
        return null;
      }
    };

    const fast = await tryFastManifest();
    if (fast) {
      // 使用智能缓存
      smartCache.set(m3u8Url, {
        ...fast,
        success: true,
      });
      return fast;
    }

    const fallback = { quality: '未知', loadSpeed: '未知', pingTime: 9999 };
    smartCache.set(m3u8Url, {
      ...fallback,
      success: false,
    });
    return fallback;
  } catch (error) {
    // 快速失败返回占位数据，避免阻塞
    const fallback = { quality: '未知', loadSpeed: '未知', pingTime: 9999 };
    // 使用智能缓存
    smartCache.set(m3u8Url, {
      ...fallback,
      success: false,
    });
    return fallback;
  }
}

export function cleanHtmlTags(text: string): string {
  if (!text) return '';

  const cleanedText = text
    .replace(/<[^>]+>/g, '\n') // 将 HTML 标签替换为换行
    .replace(/\n+/g, '\n') // 将多个连续换行合并为一个
    .replace(/[ \t]+/g, ' ') // 将多个连续空格和制表符合并为一个空格，但保留换行符
    .replace(/^\n+|\n+$/g, '') // 去掉首尾换行
    .trim(); // 去掉首尾空格

  // 使用 he 库解码 HTML 实体
  return he.decode(cleanedText);
}

/**
 * 判断剧集是否已完结
 * @param remarks 备注信息（如"已完结"、"更新至20集"、"HD"等）
 * @returns 是否已完结
 */
export function isSeriesCompleted(remarks?: string): boolean {
  if (!remarks) return false;

  // 匹配规则：
  // - "完结" 或 "已完结"
  // - "全XX集"（如"全30集"）
  // - 单独的"完"（但不包括"完整"）
  return /完结|已完结|全\d+集|完(?!整)/.test(remarks);
}
