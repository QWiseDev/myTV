/**
 * 客户端 API 请求缓存工具
 * 用于优化重复请求，如 /api/detail 被多次调用的问题
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  promise?: Promise<T>; // 用于请求去重
}

// 缓存配置
const CACHE_CONFIG = {
  // 不同类型数据的TTL（毫秒）
  TTL: {
    detail: 5 * 60 * 1000, // 视频详情：5分钟
    search: 3 * 60 * 1000, // 搜索结果：3分钟（可能更新较频繁）
    videoInfo: 2 * 60 * 1000, // 视频信息：2分钟
    default: 1 * 60 * 1000, // 默认：1分钟
  } as Record<string, number>,
  // 最大缓存条目数
  MAX_SIZE: 50,
};

// 缓存存储
const requestCache = new Map<string, CacheEntry<any>>();
const pendingRequests = new Map<string, Promise<any>>();

async function extractErrorMessage(response: Response): Promise<string | null> {
  try {
    const contentType = response.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      const json = await response.json();
      return (json && (json.error || json.message || json.msg)) || null;
    }

    const text = await response.text();
    if (/just a moment/i.test(text) && /cloudflare|cdn-cgi/i.test(text)) {
      return '上游接口触发 Cloudflare 验证';
    }

    try {
      const json = JSON.parse(text);
      return (json && (json.error || json.message || json.msg)) || null;
    } catch {
      return null;
    }
  } catch {
    return null;
  }
}

/**
 * 生成缓存键
 */
function generateCacheKey(url: string, params?: Record<string, any>): string {
  const paramStr = params ? `:${JSON.stringify(params)}` : '';
  return `${url}${paramStr}`;
}

/**
 * 从 URL 提取缓存类型
 */
function getCacheTypeFromUrl(url: string): string {
  if (url.includes('/api/detail')) return 'detail';
  if (url.includes('/api/search')) return 'search';
  if (url.includes('/api/video-info')) return 'videoInfo';
  return 'default';
}

/**
 * 清理过期缓存
 */
function cleanupExpiredCache(): void {
  const now = Date.now();
  for (const [key, entry] of Array.from(requestCache.entries())) {
    const cacheType = getCacheTypeFromUrl(key);
    const ttl = CACHE_CONFIG.TTL[cacheType] || CACHE_CONFIG.TTL.default;

    if (now - entry.timestamp > ttl) {
      requestCache.delete(key);
    }
  }
}

/**
 * 限制缓存大小（LRU策略）
 */
function enforceMaxCacheSize(): void {
  if (requestCache.size <= CACHE_CONFIG.MAX_SIZE) return;

  // 按照时间排序，删除最旧的条目
  const entries = Array.from(requestCache.entries());
  entries.sort((a, b) => a[1].timestamp - b[1].timestamp);

  // 删除多余的条目（保留最新的MAX_SIZE个）
  const toDelete = entries.length - CACHE_CONFIG.MAX_SIZE;
  for (let i = 0; i < toDelete; i++) {
    requestCache.delete(entries[i][0]);
  }
}

/**
 * 从缓存获取数据
 */
function getFromCache<T>(url: string, params?: Record<string, any>): T | null {
  cleanupExpiredCache();

  const cacheKey = generateCacheKey(url, params);
  const cached = requestCache.get(cacheKey);

  if (!cached) return null;

  // 检查是否过期
  const cacheType = getCacheTypeFromUrl(url);
  const ttl = CACHE_CONFIG.TTL[cacheType] || CACHE_CONFIG.TTL.default;

  if (Date.now() - cached.timestamp > ttl) {
    requestCache.delete(cacheKey);
    return null;
  }

  return cached.data as T;
}

/**
 * 保存到缓存
 */
function saveToCache<T>(url: string, data: T, params?: Record<string, any>): void {
  const cacheKey = generateCacheKey(url, params);
  requestCache.set(cacheKey, {
    data,
    timestamp: Date.now(),
  });
  enforceMaxCacheSize();
}

/**
 * 清理特定 URL 的缓存
 */
export function clearCacheForUrl(url: string): void {
  const keys = Array.from(requestCache.keys());
  for (const key of keys) {
    if (key.startsWith(url)) {
      requestCache.delete(key);
    }
  }
}

/**
 * 清空所有缓存
 */
export function clearAllCache(): void {
  requestCache.clear();
  pendingRequests.clear();
}

/**
 * 带缓存的 fetch wrapper
 * @param url 请求 URL
 * @param options fetch 选项
 * @param params 请求参数（用于缓存键）
 * @returns 响应数据
 */
export async function cachedFetch<T = any>(
  url: string,
  options?: RequestInit,
  params?: Record<string, any>
): Promise<T> {
  // 先检查缓存（只对 GET 请求启用缓存）
  if ((!options || options.method === 'GET' || !options.method)) {
    const cached = getFromCache<T>(url, params);
    if (cached) {
      return cached;
    }
  }

  // 检查是否已有正在进行的相同请求（去重）
  const cacheKey = generateCacheKey(url, params);
  const pending = pendingRequests.get(cacheKey);
  if (pending) {
    return pending as Promise<T>;
  }

  // 创建新的请求
  const requestPromise = (async () => {
    try {
      const response = await fetch(url, options);

      if (!response.ok) {
        const message = await extractErrorMessage(response);
        throw new Error(
          message
            ? `HTTP error! status: ${response.status} - ${message}`
            : `HTTP error! status: ${response.status}`
        );
      }

      const data = await response.json();

      // 对成功的 GET 请求结果进行缓存
      if (response.ok && (!options || options.method === 'GET' || !options.method)) {
        saveToCache(url, data, params);
      }

      return data as T;
    } finally {
      // 清理 pending 请求
      pendingRequests.delete(cacheKey);
    }
  })();

  // 保存 pending 请求
  pendingRequests.set(cacheKey, requestPromise);

  return requestPromise;
}

/**
 * 带缓存的 GET 请求（便捷函数）
 * @param url 请求 URL（参数可以直接写在 URL 中，或单独传入 params）
 * @param params 查询参数
 */
export async function cachedGet<T = any>(
  url: string,
  params?: Record<string, string | number>
): Promise<T> {
  // 构建完整的 URL
  const fullUrl = params && Object.keys(params).length > 0
    ? `${url}${url.includes('?') ? '&' : '?'}${new URLSearchParams(params as Record<string, string>).toString()}`
    : url;

  return cachedFetch<T>(fullUrl, undefined, params);
}
