/**
 * 设备检测工具模块（增强版）
 */

export interface DeviceInfo {
  userAgent: string;
  isIOS: boolean;
  isIOS13: boolean;
  isAndroid: boolean;
  isMobile: boolean;
  isTablet: boolean;
  isSafari: boolean;
  isChrome: boolean;
  isWebKit: boolean;
  isEdge: boolean;
  isFirefox: boolean;
  devicePerformance: 'high' | 'medium' | 'low';
  supportsAirPlay: boolean;
  supportsChromecast: boolean;
}

interface WindowWithMSStream extends Window {
  MSStream?: unknown;
}

interface PerformanceWithMemory extends Performance {
  memory?: {
    jsHeapSizeLimit?: number;
  };
}

export const getUserAgent = () => {
  if (typeof window === 'undefined') return '';
  return navigator.userAgent;
};

export const detectDevice = (): DeviceInfo => {
  const userAgent = getUserAgent();
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return {
      userAgent,
      isIOS: false,
      isIOS13: false,
      isAndroid: false,
      isMobile: false,
      isTablet: false,
      isSafari: false,
      isChrome: false,
      isWebKit: false,
      isEdge: false,
      isFirefox: false,
      devicePerformance: 'medium',
      supportsAirPlay: false,
      supportsChromecast: false,
    };
  }

  const isIOS =
    /iPad|iPhone|iPod/.test(userAgent) &&
    !(window as WindowWithMSStream).MSStream;
  const isIOS13 = isIOS && /OS 1[3-9]|OS [2-9][0-9]/.test(userAgent);
  const isAndroid = /Android/i.test(userAgent);
  const isMobile =
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      userAgent,
    );
  const isTablet = /iPad|Android(?!.*Mobile)/i.test(userAgent);
  const isSafari = /^(?:(?!chrome|android).)*safari/i.test(userAgent);
  const isWebKit = isSafari || isIOS;
  const isEdge = /Edg/i.test(userAgent);
  const isFirefox = /Firefox/i.test(userAgent);

  const isChrome =
    /Chrome/i.test(userAgent) &&
    !/Edg/i.test(userAgent) &&
    !/OPR/i.test(userAgent) &&
    !/SamsungBrowser/i.test(userAgent) &&
    !/OPPO/i.test(userAgent) &&
    !/OppoBrowser/i.test(userAgent) &&
    !/HeyTapBrowser/i.test(userAgent) &&
    !/OnePlus/i.test(userAgent) &&
    !/Xiaomi/i.test(userAgent) &&
    !/MIUI/i.test(userAgent) &&
    !/Huawei/i.test(userAgent) &&
    !/Vivo/i.test(userAgent) &&
    !/UCBrowser/i.test(userAgent) &&
    !/QQBrowser/i.test(userAgent) &&
    !/Baidu/i.test(userAgent) &&
    !/SogouMobileBrowser/i.test(userAgent);

  const devicePerformance = getDevicePerformance();

  return {
    userAgent,
    isIOS,
    isIOS13,
    isAndroid,
    isMobile,
    isTablet,
    isSafari,
    isChrome,
    isWebKit,
    isEdge,
    isFirefox,
    devicePerformance,
    supportsAirPlay: isIOS || isSafari,
    supportsChromecast: isChrome && !isIOS,
  };
};

export const getDevicePerformance = (): 'high' | 'medium' | 'low' => {
  if (typeof navigator === 'undefined' || typeof performance === 'undefined') {
    return 'medium';
  }

  const hardwareConcurrency = navigator.hardwareConcurrency || 2;
  const memory =
    (performance as PerformanceWithMemory).memory?.jsHeapSizeLimit || 0;

  // 使用更简单的方式避免循环依赖
  const userAgent = getUserAgent();
  const isMobile =
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      userAgent,
    );

  let score = 0;
  score += Math.min(hardwareConcurrency / 4, 1) * 0.5;
  score += Math.min(memory / (1024 * 1024 * 1024), 1) * 0.3;
  score += (isMobile ? 0.2 : 0.5) * 0.2;

  if (score > 0.7) return 'high';
  if (score > 0.4) return 'medium';
  return 'low';
};

/**
 * 打印设备检测结果（用于调试）
 */
export function logDeviceInfo(deviceInfo: DeviceInfo): void {
  console.log('🔍 设备检测结果:', {
    userAgent: deviceInfo.userAgent,
    设备类型: {
      移动设备: deviceInfo.isMobile ? '✅' : '❌',
      iOS: deviceInfo.isIOS ? '✅' : '❌',
      'iOS 13+': deviceInfo.isIOS13 ? '✅' : '❌',
      Android: deviceInfo.isAndroid ? '✅' : '❌',
      平板: deviceInfo.isTablet ? '✅' : '❌',
    },
    浏览器类型: {
      Safari: deviceInfo.isSafari ? '✅' : '❌',
      Chrome: deviceInfo.isChrome ? '✅' : '❌',
      WebKit: deviceInfo.isWebKit ? '✅' : '❌',
      Edge: deviceInfo.isEdge ? '✅' : '❌',
      Firefox: deviceInfo.isFirefox ? '✅' : '❌',
    },
    设备性能: deviceInfo.devicePerformance,
    投屏支持: {
      AirPlay: deviceInfo.supportsAirPlay ? '✅ 显示' : '❌ 隐藏',
      Chromecast: deviceInfo.supportsChromecast ? '✅ 显示' : '❌ 隐藏',
    },
    投屏策略: deviceInfo.supportsAirPlay
      ? '🍎 AirPlay (WebKit)'
      : deviceInfo.supportsChromecast
        ? '📺 Chromecast (Cast API)'
        : '❌ 不支持投屏',
  });
}
