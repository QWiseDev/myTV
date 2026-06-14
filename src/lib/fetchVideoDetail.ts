import { getAvailableApiSites } from '@/lib/config';
import { SearchResult } from '@/lib/types';

import { getDetailFromApi, searchFromApi } from './downstream';

interface FetchVideoDetailOptions {
  source: string;
  id: string;
  fallbackTitle?: string;
}

// 🚀 缓存配置
interface CacheEntry {
  data: SearchResult;
  timestamp: number;
  promise?: Promise<SearchResult>; // 用于请求去重
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5分钟TTL
const MAX_CACHE_SIZE = 50; // 最大缓存条目数
const requestCache = new Map<string, CacheEntry>();
const pendingRequests = new Map<string, Promise<SearchResult>>();

// 生成缓存键
function generateCacheKey(source: string, id: string, fallbackTitle: string): string {
  return `${source}:${id}:${fallbackTitle}`;
}

// 清理过期缓存
function cleanupExpiredCache(): void {
  const now = Date.now();
  for (const [key, entry] of Array.from(requestCache.entries())) {
    if (now - entry.timestamp > CACHE_TTL_MS) {
      requestCache.delete(key);
    }
  }
}

// 限制缓存大小（LRU策略）
function enforceMaxCacheSize(): void {
  if (requestCache.size <= MAX_CACHE_SIZE) return;

  // 按照时间排序，删除最旧的条目
  const entries = Array.from(requestCache.entries());
  entries.sort((a, b) => a[1].timestamp - b[1].timestamp);

  // 删除多余的条目（保留最新的MAX_CACHE_SIZE个）
  const toDelete = entries.length - MAX_CACHE_SIZE;
  for (let i = 0; i < toDelete; i++) {
    requestCache.delete(entries[i][0]);
  }
}

// 从缓存获取数据
function getFromCache(
  source: string,
  id: string,
  fallbackTitle: string
): SearchResult | null {
  cleanupExpiredCache();

  const cacheKey = generateCacheKey(source, id, fallbackTitle);
  const cached = requestCache.get(cacheKey);

  if (!cached) return null;

  // 检查是否过期
  if (Date.now() - cached.timestamp > CACHE_TTL_MS) {
    requestCache.delete(cacheKey);
    return null;
  }

  return cached.data;
}

// 保存到缓存
function saveToCache(
  source: string,
  id: string,
  fallbackTitle: string,
  data: SearchResult
): void {
  const cacheKey = generateCacheKey(source, id, fallbackTitle);
  requestCache.set(cacheKey, {
    data,
    timestamp: Date.now(),
  });
  enforceMaxCacheSize();
}

/**
 * 根据 source 与 id 获取视频详情。
 * 1. 若传入 fallbackTitle，则先调用 /api/search 搜索精确匹配。
 * 2. 若搜索未命中或未提供 fallbackTitle，则直接调用 /api/detail。
 *
 * 🚀 优化：添加了请求缓存和去重机制，避免重复请求
 */
export async function fetchVideoDetail({
  source,
  id,
  fallbackTitle = '',
}: FetchVideoDetailOptions): Promise<SearchResult> {
  // 先检查缓存
  const cached = getFromCache(source, id, fallbackTitle);
  if (cached) {
    return cached;
  }

  // 检查是否已有正在进行的相同请求（去重）
  const cacheKey = generateCacheKey(source, id, fallbackTitle);
  const pending = pendingRequests.get(cacheKey);
  if (pending) {
    return pending;
  }

  // 创建新的请求
  const requestPromise = (async () => {
    try {
      // 优先通过搜索接口查找精确匹配
      const apiSites = await getAvailableApiSites();
      const apiSite = apiSites.find((site) => site.key === source);
      if (!apiSite) {
        throw new Error('无效的API来源');
      }

      let result: SearchResult | null = null;

      if (fallbackTitle) {
        try {
          const searchData = await searchFromApi(apiSite, fallbackTitle.trim());
          const exactMatch = searchData.find(
            (item: SearchResult) =>
              item.source.toString() === source.toString() &&
              item.id.toString() === id.toString()
          );
          if (exactMatch) {
            result = exactMatch;
          }
        } catch (error) {
          // do nothing，继续尝试直接获取详情
        }
      }

      // 如果搜索未找到，直接调用 /api/detail 接口
      if (!result) {
        const detail = await getDetailFromApi(apiSite, id);
        if (!detail) {
          throw new Error('获取视频详情失败');
        }
        result = detail;
      }

      // 保存到缓存
      saveToCache(source, id, fallbackTitle, result);

      return result;
    } finally {
      // 清理 pending 请求
      pendingRequests.delete(cacheKey);
    }
  })();

  // 保存 pending 请求
  pendingRequests.set(cacheKey, requestPromise);

  return requestPromise;
}
