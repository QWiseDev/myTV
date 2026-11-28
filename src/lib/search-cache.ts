import { SearchResult } from '@/lib/types';

/** 缓存状态：ok(有结果) / empty(正常空结果) / timeout(短时超时防抖) / forbidden(403 短缓) */
export type CachedPageStatus = 'ok' | 'empty' | 'timeout' | 'forbidden';

export interface CachedPageEntry {
  expiresAt: number;
  status: CachedPageStatus;
  data: SearchResult[];
  pageCount?: number; // 仅第一页可选存储
}

export interface SearchCacheStats {
  size: number;
  maxSize: number;
  inFlight: number;
  hits: number;
  misses: number;
  coalesced: number;
}

const MINUTE_MS = 60 * 1000;

/**
 * 分级 TTL：
 * - ok：10 分钟，热词高命中；
 * - empty：2 分钟，避免同一冷门词反复打不支持该片的源，同时不影响新片上架；
 * - timeout：30 秒短防抖，避免死锁 10 分钟与 site-health 的 2 分钟半开探活冲突；
 * - forbidden：2 分钟短缓，长期封禁交由 site-health 的 30m -> 2h 熔断主导。
 */
export const SEARCH_CACHE_TTL_BY_STATUS: Record<CachedPageStatus, number> = {
  ok: 10 * MINUTE_MS,
  empty: 2 * MINUTE_MS,
  timeout: 30 * 1000,
  forbidden: 2 * MINUTE_MS,
};

export const MAX_SEARCH_CACHE_SIZE = 1000;

/**
 * O(1) 真 LRU 缓存（利用 JS Map 插入顺序：队头最旧、队尾最新，无 setInterval 句柄泄漏）
 */
const searchCache = new Map<string, CachedPageEntry>();

/** Single-Flight 并发合并表：同一 (source, normalizedQuery, page) 仅发 1 次上游请求 */
const inFlightRequests = new Map<string, Promise<unknown>>();

const cacheCounters = {
  hits: 0,
  misses: 0,
  coalesced: 0,
};

/** 规范化搜索词：去首尾空格、折叠连续空白、统一小写，提高缓存命中率 */
export function normalizeSearchCacheQuery(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function makeSearchCacheKey(
  sourceKey: string,
  query: string,
  page: number,
): string {
  return `${sourceKey}::${normalizeSearchCacheQuery(query)}::${page}`;
}

function evictIfNeeded(now: number): void {
  if (searchCache.size <= MAX_SEARCH_CACHE_SIZE) {
    return;
  }

  // 优先清除已过期项
  searchCache.forEach((entry, key) => {
    if (entry.expiresAt <= now) {
      searchCache.delete(key);
    }
  });

  // 仍超上限则按 O(1) LRU 从队头淘汰最久未访问的条目
  while (searchCache.size > MAX_SEARCH_CACHE_SIZE) {
    const oldestKey = searchCache.keys().next().value;
    if (oldestKey === undefined) break;
    searchCache.delete(oldestKey);
  }
}

/** 读取缓存（命中时刷新到 LRU 队尾，过期时惰性删除） */
export function getCachedSearchPage(
  sourceKey: string,
  query: string,
  page: number,
  now = Date.now(),
): CachedPageEntry | null {
  const key = makeSearchCacheKey(sourceKey, query, page);
  const entry = searchCache.get(key);
  if (!entry) {
    cacheCounters.misses += 1;
    return null;
  }

  if (entry.expiresAt <= now) {
    searchCache.delete(key);
    cacheCounters.misses += 1;
    return null;
  }

  // 真 LRU：重新插入到 Map 队尾，O(1) 刷新活跃度
  searchCache.delete(key);
  searchCache.set(key, entry);
  cacheCounters.hits += 1;
  return entry;
}

/** 写入缓存（按状态分级 TTL，并立即强制执行 O(1) LRU 容量上限） */
export function setCachedSearchPage(
  sourceKey: string,
  query: string,
  page: number,
  status: CachedPageStatus,
  data: SearchResult[],
  pageCount?: number,
  now = Date.now(),
): void {
  const key = makeSearchCacheKey(sourceKey, query, page);
  const ttlMs = SEARCH_CACHE_TTL_BY_STATUS[status];
  if (searchCache.has(key)) {
    searchCache.delete(key);
  }
  searchCache.set(key, {
    expiresAt: now + ttlMs,
    status,
    data,
    pageCount,
  });
  evictIfNeeded(now);
}

/**
 * 并发单飞合并（Single-Flight）：
 * 多个请求同时查询同一 (source, query, page) 且缓存未命中时，共享同一次上游请求，
 * 避免缓存击穿，也与 /api/search 软截止早退形成配合（后续请求直接搭便车复用在飞请求）。
 */
export function runSearchPageSingleFlight<T>(
  sourceKey: string,
  query: string,
  page: number,
  fetcher: () => Promise<T>,
): Promise<T> {
  const key = makeSearchCacheKey(sourceKey, query, page);
  const existing = inFlightRequests.get(key) as Promise<T> | undefined;
  if (existing) {
    cacheCounters.coalesced += 1;
    return existing;
  }

  let rawPromise: Promise<T>;
  try {
    rawPromise = Promise.resolve(fetcher());
  } catch (error) {
    return Promise.reject(error);
  }

  const promise = rawPromise.finally(() => {
    if (inFlightRequests.get(key) === promise) {
      inFlightRequests.delete(key);
    }
  });

  inFlightRequests.set(key, promise);
  return promise;
}

/**
 * 清空内存搜索缓存：
 * - 传入 sourceKey：仅失效该源的全部缓存条目（供后台禁用/启用/删除源调用）；
 * - 不传参数：清空全部条目与计数器（供后台清缓存与测试隔离调用）。
 */
export function clearSearchCache(sourceKey?: string): number {
  if (sourceKey) {
    const prefix = `${sourceKey}::`;
    let removed = 0;
    searchCache.forEach((_entry, key) => {
      if (key.startsWith(prefix)) {
        searchCache.delete(key);
        removed += 1;
      }
    });
    inFlightRequests.forEach((_promise, key) => {
      if (key.startsWith(prefix)) {
        inFlightRequests.delete(key);
      }
    });
    return removed;
  }

  const removed = searchCache.size;
  searchCache.clear();
  inFlightRequests.clear();
  cacheCounters.hits = 0;
  cacheCounters.misses = 0;
  cacheCounters.coalesced = 0;
  return removed;
}

export function getSearchCacheStats(): SearchCacheStats {
  return {
    size: searchCache.size,
    maxSize: MAX_SEARCH_CACHE_SIZE,
    inFlight: inFlightRequests.size,
    hits: cacheCounters.hits,
    misses: cacheCounters.misses,
    coalesced: cacheCounters.coalesced,
  };
}
