/**
 * 豆瓣代理智能探测模块
 * 优先级: 阿里云CDN > 腾讯云CDN > 其他CDN > 直连
 */

// 代理类型定义
export type DoubanDataProxyType =
  | 'cmliussss-cdn-ali'
  | 'cmliussss-cdn-tencent'
  | 'cors-proxy-zwei'
  | 'direct';

export type DoubanImageProxyType =
  | 'cmliussss-cdn-ali'
  | 'cmliussss-cdn-tencent'
  | 'img3'
  | 'server'
  | 'direct';

// 探测结果接口
interface ProbeResult {
  type: string;
  latency: number; // ms, -1 表示不可用
  available: boolean;
  timestamp: number;
}

// 缓存配置
const CACHE_KEY_DATA = 'douban-proxy-probe-data';
const CACHE_KEY_IMAGE = 'douban-proxy-probe-image';
const CACHE_DURATION = 30 * 60 * 1000; // 30分钟缓存

// 数据代理端点配置（按优先级排序）
const DATA_PROXY_ENDPOINTS: Array<{
  type: DoubanDataProxyType;
  testUrl: string;
  name: string;
}> = [
  {
    type: 'cmliussss-cdn-ali',
    testUrl:
      'https://m.douban.cmliussss.com/rexxar/api/v2/movie/recommend?count=1',
    name: '阿里云CDN',
  },
  {
    type: 'cmliussss-cdn-tencent',
    testUrl:
      'https://m.douban.cmliussss.net/rexxar/api/v2/movie/recommend?count=1',
    name: '腾讯云CDN',
  },
  {
    type: 'cors-proxy-zwei',
    testUrl:
      'https://ciao-cors.is-an.org/https://m.douban.com/rexxar/api/v2/movie/recommend?count=1',
    name: 'Zwei代理',
  },
];

// 图片代理端点配置（按优先级排序）
const IMAGE_PROXY_ENDPOINTS: Array<{
  type: DoubanImageProxyType;
  testUrl: string;
  name: string;
}> = [
  {
    type: 'cmliussss-cdn-ali',
    // 使用一个小的豆瓣图片测试
    testUrl:
      'https://img.doubanio.cmliussss.com/view/photo/s_ratio_poster/public/p2884182275.jpg',
    name: '阿里云CDN',
  },
  {
    type: 'cmliussss-cdn-tencent',
    testUrl:
      'https://img.doubanio.cmliussss.net/view/photo/s_ratio_poster/public/p2884182275.jpg',
    name: '腾讯云CDN',
  },
  {
    type: 'img3',
    testUrl:
      'https://img3.doubanio.com/view/photo/s_ratio_poster/public/p2884182275.jpg',
    name: '豆瓣官方CDN',
  },
];

function pickBestImageProxy(types: DoubanImageProxyType[]): DoubanImageProxyType {
  // 图片优先走第三方 CDN，避免豆瓣官方图片域名被限流/拦截（418/403等）
  const priority: DoubanImageProxyType[] = [
    'cmliussss-cdn-ali',
    'cmliussss-cdn-tencent',
    'img3',
    'direct',
  ];

  for (const type of priority) {
    if (types.includes(type)) return type;
  }
  return types[0] || 'direct';
}

/**
 * 探测单个端点的延迟
 */
async function probeEndpoint(
  url: string,
  timeout = 5000
): Promise<{ latency: number; available: boolean }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  const startTime = performance.now();

  try {
    const _response = await fetch(url, {
      method: 'HEAD',
      mode: 'no-cors', // 允许跨域探测
      signal: controller.signal,
      cache: 'no-store',
    });

    clearTimeout(timeoutId);
    const latency = Math.round(performance.now() - startTime);

    // no-cors 模式下无法读取 response.ok，但如果没抛错就认为可用
    return { latency, available: true };
  } catch (error) {
    clearTimeout(timeoutId);

    // 尝试使用 GET 请求（某些 CDN 不支持 HEAD）
    try {
      const getController = new AbortController();
      const getTimeoutId = setTimeout(() => getController.abort(), timeout);
      const getStartTime = performance.now();

      await fetch(url, {
        method: 'GET',
        mode: 'no-cors',
        signal: getController.signal,
        cache: 'no-store',
      });

      clearTimeout(getTimeoutId);
      const latency = Math.round(performance.now() - getStartTime);
      return { latency, available: true };
    } catch {
      return { latency: -1, available: false };
    }
  }
}

/**
 * 从缓存获取探测结果
 */
function getCachedProbeResult(cacheKey: string): ProbeResult[] | null {
  if (typeof localStorage === 'undefined') return null;

  try {
    const cached = localStorage.getItem(cacheKey);
    if (!cached) return null;

    const { results, timestamp } = JSON.parse(cached);
    if (Date.now() - timestamp > CACHE_DURATION) {
      localStorage.removeItem(cacheKey);
      return null;
    }

    return results;
  } catch {
    return null;
  }
}

/**
 * 缓存探测结果
 */
function setCachedProbeResult(cacheKey: string, results: ProbeResult[]): void {
  if (typeof localStorage === 'undefined') return;

  try {
    localStorage.setItem(
      cacheKey,
      JSON.stringify({ results, timestamp: Date.now() })
    );
  } catch {
    // 忽略存储错误
  }
}

/**
 * 探测所有数据代理端点并返回最优选择
 */
export async function probeDataProxies(): Promise<{
  best: DoubanDataProxyType;
  results: ProbeResult[];
}> {
  // 检查缓存
  const cached = getCachedProbeResult(CACHE_KEY_DATA);
  if (cached && cached.length > 0) {
    const available = cached.filter((r) => r.available);
    if (available.length > 0) {
      // 按延迟排序，返回最快的
      available.sort((a, b) => a.latency - b.latency);
      return {
        best: available[0].type as DoubanDataProxyType,
        results: cached,
      };
    }
  }

  const results: ProbeResult[] = [];

  // 并行探测所有端点
  const probePromises = DATA_PROXY_ENDPOINTS.map(async (endpoint) => {
    const { latency, available } = await probeEndpoint(endpoint.testUrl);
    const result: ProbeResult = {
      type: endpoint.type,
      latency,
      available,
      timestamp: Date.now(),
    };
    return result;
  });

  const probeResults = await Promise.all(probePromises);
  results.push(...probeResults);

  // 缓存结果
  setCachedProbeResult(CACHE_KEY_DATA, results);

  // 找出最优可用代理
  const available = results.filter((r) => r.available);
  if (available.length > 0) {
    // 按延迟排序
    available.sort((a, b) => a.latency - b.latency);
    return { best: available[0].type as DoubanDataProxyType, results };
  }

  // 所有代理都不可用，回退到直连
  return { best: 'direct', results };
}

/**
 * 探测所有图片代理端点并返回最优选择
 */
export async function probeImageProxies(): Promise<{
  best: DoubanImageProxyType;
  results: ProbeResult[];
}> {
  // 检查缓存
  const cached = getCachedProbeResult(CACHE_KEY_IMAGE);
  if (cached && cached.length > 0) {
    const available = cached.filter((r) => r.available);
    if (available.length > 0) {
      const bestType = pickBestImageProxy(
        available.map((r) => r.type as DoubanImageProxyType)
      );
      return {
        best: bestType,
        results: cached,
      };
    }
  }

  const results: ProbeResult[] = [];

  // 并行探测所有端点
  const probePromises = IMAGE_PROXY_ENDPOINTS.map(async (endpoint) => {
    const { latency, available } = await probeEndpoint(endpoint.testUrl);
    const result: ProbeResult = {
      type: endpoint.type,
      latency,
      available,
      timestamp: Date.now(),
    };
    return result;
  });

  const probeResults = await Promise.all(probePromises);
  results.push(...probeResults);

  // 缓存结果
  setCachedProbeResult(CACHE_KEY_IMAGE, results);

  // 找出最优可用代理
  const available = results.filter((r) => r.available);
  if (available.length > 0) {
    const bestType = pickBestImageProxy(
      available.map((r) => r.type as DoubanImageProxyType)
    );
    return { best: bestType, results };
  }

  // 所有代理都不可用，回退到直连
  return { best: 'direct', results };
}

// 单例模式：存储当前最优代理
let currentBestDataProxy: DoubanDataProxyType | null = null;
let currentBestImageProxy: DoubanImageProxyType | null = null;
let probeInProgress = false;

/**
 * 获取当前最优数据代理（带懒加载探测）
 */
export async function getBestDataProxy(): Promise<DoubanDataProxyType> {
  // 如果已有结果，直接返回
  if (currentBestDataProxy) {
    return currentBestDataProxy;
  }

  // 检查缓存
  const cached = getCachedProbeResult(CACHE_KEY_DATA);
  if (cached && cached.length > 0) {
    const available = cached.filter((r) => r.available);
    if (available.length > 0) {
      available.sort((a, b) => a.latency - b.latency);
      currentBestDataProxy = available[0].type as DoubanDataProxyType;
      return currentBestDataProxy;
    }
  }

  // 默认使用阿里云CDN，同时后台探测
  if (!probeInProgress) {
    probeInProgress = true;
    probeDataProxies()
      .then(({ best }) => {
        currentBestDataProxy = best;
      })
      .finally(() => {
        probeInProgress = false;
      });
  }

  // 返回默认值（阿里云CDN优先）
  return 'cmliussss-cdn-ali';
}

/**
 * 获取当前最优图片代理（带懒加载探测）
 */
export async function getBestImageProxy(): Promise<DoubanImageProxyType> {
  if (currentBestImageProxy) {
    return currentBestImageProxy;
  }

  // 检查缓存
  const cached = getCachedProbeResult(CACHE_KEY_IMAGE);
  if (cached && cached.length > 0) {
    const available = cached.filter((r) => r.available);
    if (available.length > 0) {
      currentBestImageProxy = pickBestImageProxy(
        available.map((r) => r.type as DoubanImageProxyType)
      );
      return currentBestImageProxy;
    }
  }

  // 默认使用阿里云CDN，同时后台探测
  if (!probeInProgress) {
    probeInProgress = true;
    probeImageProxies()
      .then(({ best }) => {
        currentBestImageProxy = best;
      })
      .finally(() => {
        probeInProgress = false;
      });
  }

  return 'cmliussss-cdn-ali';
}

export function getBestDataProxySync(): DoubanDataProxyType {
  if (currentBestDataProxy) {
    return currentBestDataProxy;
  }

  const cached = getCachedProbeResult(CACHE_KEY_DATA);
  if (cached && cached.length > 0) {
    const available = cached.filter((r) => r.available);
    if (available.length > 0) {
      available.sort((a, b) => a.latency - b.latency);
      currentBestDataProxy = available[0].type as DoubanDataProxyType;
      return currentBestDataProxy;
    }
  }

  if (!probeInProgress) {
    probeInProgress = true;
    probeDataProxies()
      .then(({ best }) => {
        currentBestDataProxy = best;
      })
      .finally(() => {
        probeInProgress = false;
      });
  }

  return 'cmliussss-cdn-ali';
}

export function getBestImageProxySync(): DoubanImageProxyType {
  if (currentBestImageProxy) {
    return currentBestImageProxy;
  }

  const cached = getCachedProbeResult(CACHE_KEY_IMAGE);
  if (cached && cached.length > 0) {
    const available = cached.filter((r) => r.available);
    if (available.length > 0) {
      currentBestImageProxy = pickBestImageProxy(
        available.map((r) => r.type as DoubanImageProxyType)
      );
      return currentBestImageProxy;
    }
  }

  if (!probeInProgress) {
    probeInProgress = true;
    probeImageProxies()
      .then(({ best }) => {
        currentBestImageProxy = best;
      })
      .finally(() => {
        probeInProgress = false;
      });
  }

  return 'cmliussss-cdn-ali';
}

/**
 * 清除探测缓存（用于手动刷新）
 */
export function clearProbeCache(): void {
  if (typeof localStorage === 'undefined') return;

  localStorage.removeItem(CACHE_KEY_DATA);
  localStorage.removeItem(CACHE_KEY_IMAGE);
  currentBestDataProxy = null;
  currentBestImageProxy = null;
}

/**
 * 初始化探测（应用启动时调用）
 */
export async function initProxyDetection(): Promise<void> {
  if (typeof window === 'undefined') return;

  // 后台并行探测
  Promise.all([probeDataProxies(), probeImageProxies()]).then(
    ([dataResult, imageResult]) => {
      currentBestDataProxy = dataResult.best;
      currentBestImageProxy = imageResult.best;
    }
  );
}
