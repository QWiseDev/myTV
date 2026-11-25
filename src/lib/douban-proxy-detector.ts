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

function pickBestImageProxy(
  types: DoubanImageProxyType[],
): DoubanImageProxyType {
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
 * - corsMode = true 时直接用 GET 校验 response.ok，避免 no-cors 把 403/502 误判为可用，
 *   且省去 HEAD 失败后再等一轮 GET 的双倍超时。
 */
async function probeEndpoint(
  url: string,
  options: { timeout?: number; corsMode?: boolean } = {},
): Promise<{ latency: number; available: boolean }> {
  const { timeout = 2500, corsMode = false } = options;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  const startTime = performance.now();

  try {
    const response = await fetch(url, {
      method: corsMode ? 'GET' : 'HEAD',
      mode: corsMode ? 'cors' : 'no-cors',
      signal: controller.signal,
      cache: 'no-store',
    });

    clearTimeout(timeoutId);
    if (corsMode && !response.ok) {
      return { latency: -1, available: false };
    }
    const latency = Math.round(performance.now() - startTime);
    return { latency, available: true };
  } catch {
    clearTimeout(timeoutId);
    if (corsMode) {
      return { latency: -1, available: false };
    }

    // 图片 no-cors 模式下部分 CDN 不支持 HEAD，回退一次 GET
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
      JSON.stringify({ results, timestamp: Date.now() }),
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
    const { latency, available } = await probeEndpoint(endpoint.testUrl, {
      corsMode: true,
    });
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
        available.map((r) => r.type as DoubanImageProxyType),
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
      available.map((r) => r.type as DoubanImageProxyType),
    );
    return { best: bestType, results };
  }

  // 所有代理都不可用，回退到直连
  return { best: 'direct', results };
}

// 单例模式：存储当前最优代理（数据探测与图片探测使用独立锁，互不阻塞）
let currentBestDataProxy: DoubanDataProxyType | null = null;
let currentBestImageProxy: DoubanImageProxyType | null = null;
let dataProbeInProgress = false;
let imageProbeInProgress = false;

/**
 * 运行期某个数据代理失败时立即降级到下一个可用代理（或 direct），
 * 避免 30 分钟缓存期内持续把首屏请求发往已失效 CDN。
 */
export function markDataProxyFailed(failedType: DoubanDataProxyType): void {
  if (failedType === 'direct') return;

  const cached = getCachedProbeResult(CACHE_KEY_DATA);
  if (cached && cached.length > 0) {
    const updated = cached.map((item) =>
      item.type === failedType
        ? { ...item, available: false, latency: -1, timestamp: Date.now() }
        : item,
    );
    setCachedProbeResult(CACHE_KEY_DATA, updated);

    const nextAvailable = updated
      .filter((r) => r.available)
      .sort((a, b) => a.latency - b.latency)[0];
    currentBestDataProxy =
      (nextAvailable?.type as DoubanDataProxyType | undefined) || 'direct';
    return;
  }

  if (currentBestDataProxy === failedType || currentBestDataProxy === null) {
    currentBestDataProxy = 'direct';
  }
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
    currentBestDataProxy = 'direct';
    return currentBestDataProxy;
  }

  if (!dataProbeInProgress) {
    dataProbeInProgress = true;
    probeDataProxies()
      .then(({ best }) => {
        currentBestDataProxy = best;
      })
      .finally(() => {
        dataProbeInProgress = false;
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
        available.map((r) => r.type as DoubanImageProxyType),
      );
      return currentBestImageProxy;
    }
    currentBestImageProxy = 'direct';
    return currentBestImageProxy;
  }

  if (!imageProbeInProgress) {
    imageProbeInProgress = true;
    probeImageProxies()
      .then(({ best }) => {
        currentBestImageProxy = best;
      })
      .finally(() => {
        imageProbeInProgress = false;
      });
  }

  return 'cmliussss-cdn-ali';
}
