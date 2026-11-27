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

export const IMAGE_PLACEHOLDER_URL = '/logo.svg';

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
  proxyType: DoubanImageProxyType | 'custom',
): string {
  switch (proxyType) {
    case 'custom': {
      const proxyUrl = getConfiguredImageProxyUrl();
      return proxyUrl
        ? `${proxyUrl}${encodeURIComponent(originalUrl)}`
        : applyDoubanImageProxy(originalUrl, 'cmliussss-cdn-ali');
    }
    case 'server':
      return `/api/image-proxy?url=${encodeURIComponent(originalUrl)}`;
    case 'cmliussss-cdn-ali':
      return originalUrl.replace(
        /img\d+\.doubanio\.com/g,
        'img.doubanio.cmliussss.com',
      );
    case 'cmliussss-cdn-tencent':
      return originalUrl.replace(
        /img\d+\.doubanio\.com/g,
        'img.doubanio.cmliussss.net',
      );
    case 'img3':
      return originalUrl.replace(/img\d+\.doubanio\.com/g, 'img3.doubanio.com');
    case 'direct':
    default:
      return originalUrl;
  }
}

function isOfficialDoubanImageUrl(url: string): boolean {
  try {
    return /^img\d*\.doubanio\.com$/.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

function isBangumiImageUrl(url: string): boolean {
  try {
    return new URL(url).hostname === 'lain.bgm.tv';
  } catch {
    return false;
  }
}

export function isKnownInvalidImageUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    return (
      parsedUrl.hostname === '018.shoutu.net' &&
      parsedUrl.pathname === '/static/images/logo.jpg'
    );
  } catch {
    return false;
  }
}

export function isUsableImageUrl(
  url: string | null | undefined,
): url is string {
  const trimmedUrl = url?.trim();
  return Boolean(
    trimmedUrl &&
    trimmedUrl !== IMAGE_PLACEHOLDER_URL &&
    !isKnownInvalidImageUrl(trimmedUrl),
  );
}

export function selectUsableImageUrl(
  ...urls: Array<string | null | undefined>
): string {
  for (const url of urls) {
    const trimmedUrl = url?.trim();
    if (isUsableImageUrl(trimmedUrl)) {
      return trimmedUrl;
    }
  }

  return '';
}

function getServerImageProxyUrl(originalUrl: string): string {
  return `/api/image-proxy?url=${encodeURIComponent(originalUrl)}`;
}

export function processImageUrl(originalUrl: string): string {
  if (isKnownInvalidImageUrl(originalUrl)) {
    return IMAGE_PLACEHOLDER_URL;
  }

  if (isBangumiImageUrl(originalUrl)) {
    return getServerImageProxyUrl(originalUrl);
  }

  if (!originalUrl || !originalUrl.includes('doubanio.com')) {
    return originalUrl;
  }

  const processedUrl = applyDoubanImageProxy(
    originalUrl,
    getConfiguredImageProxyType(),
  );

  if (isOfficialDoubanImageUrl(processedUrl)) {
    return applyDoubanImageProxy(originalUrl, 'cmliussss-cdn-ali');
  }

  return processedUrl;
}

export function getImageFallbackUrls(originalUrl: string): string[] {
  if (isKnownInvalidImageUrl(originalUrl)) {
    return [IMAGE_PLACEHOLDER_URL];
  }

  if (isBangumiImageUrl(originalUrl)) {
    return [getServerImageProxyUrl(originalUrl), IMAGE_PLACEHOLDER_URL];
  }

  if (!originalUrl || !originalUrl.includes('doubanio.com')) {
    return [originalUrl, IMAGE_PLACEHOLDER_URL].filter(Boolean);
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
    new Set([
      ...proxyTypes.map((proxyType) =>
        applyDoubanImageProxy(originalUrl, proxyType),
      ),
      IMAGE_PLACEHOLDER_URL,
    ]),
  ).filter(Boolean);
}

const DIRECT_VIDEO_EXT_RE = /\.(?:mp4|webm|mkv|mov|flv|avi)(?:$|[?#])/i;

interface M3u8StreamLevelInfo {
  width: number;
  height: number;
  bitrate: number;
  name?: string;
}

export interface VideoResolutionProbeResult {
  quality: string;
  loadSpeed: string;
  pingTime: number;
  success?: boolean;
  levels?: M3u8StreamLevelInfo[];
  maxResolution?: string;
  minResolution?: string;
  maxBandwidth?: number;
  minBandwidth?: number;
}

/**
 * 从 m3u8 / 直链地址探测视频清晰度与真实媒体分片下载速度
 * @param m3u8Url 播放列表或直链 URL
 * @param timeout 超时时间（毫秒），默认 5000ms
 * @returns Promise<VideoResolutionProbeResult> 视频清晰度、实测下载速度与响应延迟
 */
export async function getVideoResolutionFromM3u8(
  m3u8Url: string,
  timeout = 5000,
  options?: {
    sourceKey?: string;
    adFilterType?: string;
    signal?: AbortSignal;
    maxBytes?: number;
  },
): Promise<VideoResolutionProbeResult> {
  const normalizedUrl = (m3u8Url || '').trim();
  if (!normalizedUrl || !/^https?:\/\//i.test(normalizedUrl)) {
    return {
      quality: '未知',
      loadSpeed: '未知',
      pingTime: 9999,
      success: false,
    };
  }

  const [{ smartCache }, episodeCheck] = await Promise.all([
    import('@/app/play/utils/smartCache'),
    import('@/app/play/utils/episodeSourceCheck'),
  ]);

  const cached = smartCache.get(normalizedUrl);
  if (cached && cached.success) {
    return {
      quality: cached.quality,
      loadSpeed: cached.loadSpeed,
      pingTime: cached.pingTime,
      success: true,
      levels: cached.levels,
      maxResolution: cached.maxResolution,
      minResolution: cached.minResolution,
      maxBandwidth: cached.maxBandwidth,
      minBandwidth: cached.minBandwidth,
    };
  }

  const recordFailure = (observedPing = 9999): VideoResolutionProbeResult => {
    const failed: VideoResolutionProbeResult = {
      quality: '未知',
      loadSpeed: '未知',
      pingTime: 9999,
      success: false,
    };
    smartCache.set(normalizedUrl, {
      quality: '未知',
      loadSpeed: '未知',
      pingTime: observedPing,
      success: false,
    });
    return failed;
  };

  const controller = new AbortController();
  const timeoutMs = Math.max(500, timeout);
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const onExternalAbort = () => controller.abort();
  options?.signal?.addEventListener('abort', onExternalAbort, { once: true });

  const sampleBytes =
    options?.maxBytes ?? (isMobile || isIPad ? 256 * 1024 : 384 * 1024);
  const deadline = performance.now() + timeoutMs;

  try {
    if (DIRECT_VIDEO_EXT_RE.test(normalizedUrl)) {
      const directSeg = await episodeCheck.measureSegmentLoadSpeedDetailed(
        normalizedUrl,
        {
          signal: controller.signal,
          timeoutMs,
          maxBytes: sampleBytes,
          partialOnAbort: true,
          sourceKey: options?.sourceKey,
        },
      );
      if (!directSeg.reachable) {
        return recordFailure();
      }
      const pingTime = Math.max(
        1,
        Math.round(
          directSeg.ttfbMs ?? Math.min(directSeg.durationMs, timeoutMs),
        ),
      );
      const result: VideoResolutionProbeResult = {
        quality: '未知',
        loadSpeed: directSeg.speed,
        pingTime,
        success: true,
      };
      smartCache.set(normalizedUrl, {
        ...result,
        success: true,
      });
      return result;
    }

    const pingStart = performance.now();
    const response = await fetch(normalizedUrl, {
      signal: controller.signal,
      cache: 'no-store',
    });
    const pingTime = Math.max(1, Math.round(performance.now() - pingStart));

    if (!response.ok) {
      return recordFailure(pingTime);
    }

    const text =
      typeof response.text === 'function' ? await response.text() : '';
    if (!/#EXT(?:M3U|-X-|INF)/i.test(text)) {
      return recordFailure(pingTime);
    }

    const lines = text.split('\n');
    const levels: M3u8StreamLevelInfo[] = [];

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

    const sortedLevels = [...levels].sort(
      (a, b) => b.height - a.height || b.bitrate - a.bitrate,
    );
    const best = sortedLevels[0];
    const worst = sortedLevels[sortedLevels.length - 1];

    let quality = best ? episodeCheck.qualityFromHeight(best.height) : '未知';

    const adFilterSettings = episodeCheck.readLocalAdFilterSettings();
    const { segmentUrl, declaredHeight } =
      await episodeCheck.followManifestToSegment(
        text,
        response.url || normalizedUrl,
        {
          signal: controller.signal,
          cache: 'no-store',
          filterAds: adFilterSettings.enabled,
          adFilterType: options?.adFilterType,
          customAdFilterCode: adFilterSettings.customCode,
        },
      );

    if (quality === '未知' && declaredHeight > 0) {
      quality = episodeCheck.qualityFromHeight(declaredHeight);
    }

    // 子播放列表下钻失败或未解析出媒体分片时，不把 .m3u8 当作媒体分片重复请求或误判可达
    if (!segmentUrl || episodeCheck.isLikelyHlsUrl(segmentUrl)) {
      return recordFailure(pingTime);
    }

    const remainingMs = Math.max(400, Math.round(deadline - performance.now()));
    const segResult = await episodeCheck.measureSegmentLoadSpeedDetailed(
      segmentUrl,
      {
        signal: controller.signal,
        timeoutMs: remainingMs,
        maxBytes: sampleBytes,
        partialOnAbort: true,
        sourceKey: options?.sourceKey,
      },
    );

    if (!segResult.reachable) {
      return recordFailure(pingTime);
    }

    const result: VideoResolutionProbeResult = {
      quality,
      loadSpeed: segResult.speed,
      pingTime,
      success: true,
      ...(sortedLevels.length > 0
        ? {
            levels: sortedLevels,
            maxResolution: `${best.width}x${best.height}`,
            minResolution: `${worst.width}x${worst.height}`,
            maxBandwidth: best.bitrate,
            minBandwidth: worst.bitrate,
          }
        : {}),
    };

    smartCache.set(normalizedUrl, {
      ...result,
      success: true,
    });
    return result;
  } catch {
    return recordFailure();
  } finally {
    clearTimeout(timeoutId);
    options?.signal?.removeEventListener('abort', onExternalAbort);
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
