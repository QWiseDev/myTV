import { type ApiSite, API_CONFIG } from '@/lib/config';
import { db } from '@/lib/db';
import { withAbortableTimeout } from '@/lib/promise-timeout';
import {
  type SourceCategoryItem,
  type SourceVideoListResult,
  pickDefaultSourceCategory,
} from '@/lib/source-browser-shared';

export type {
  SourceCategoryItem,
  SourceVideoItem,
  SourceVideoListResult,
} from '@/lib/source-browser-shared';

export interface SourceFetchOptions {
  /** 跳过现有缓存并直接回源刷新（供 cron 预热等后台任务使用） */
  forceRefresh?: boolean;
}

export interface SourceWarmTarget {
  source: ApiSite;
  isAdult?: boolean;
}

type AppleCMSClass = {
  type_id?: string | number;
  typeid?: string | number;
  id?: string | number;
  type_name?: string;
  typename?: string;
  name?: string;
};

type AppleCMSItem = {
  vod_id?: string | number;
  id?: string | number;
  vod_name?: string;
  title?: string;
  vod_pic?: string;
  pic?: string;
  vod_year?: string;
  year?: string;
  type_name?: string;
  vod_remarks?: string;
  remarks?: string;
};

type AppleCMSVideoListResponse = {
  list?: AppleCMSItem[];
  data?: AppleCMSItem[];
  page?: number | string;
  pagecount?: number | string;
  pageCount?: number | string;
  total?: number | string;
  limit?: number | string;
  pageSize?: number | string;
};

type MemoryCacheEntry<T> = {
  value: T;
  freshUntil: number;
  expireAt: number;
};

type DbCacheEnvelope<T> = {
  data: T;
  freshUntil: number;
};

const CATEGORIES_MEMORY_TTL_MS = 5 * 60_000;
const CATEGORIES_SOFT_FRESH_MS = 10 * 60_000;
const CATEGORIES_DB_TTL_SECONDS = 24 * 60 * 60;

const LIST_MEMORY_TTL_MS = 2 * 60_000;
const LIST_SOFT_FRESH_MS = 5 * 60_000;
const LIST_DB_TTL_SECONDS = 6 * 60 * 60;

const DB_READ_TIMEOUT_MS = 500;
const BACKGROUND_REFRESH_COOLDOWN_MS = 30_000;

const memoryCache = new Map<string, MemoryCacheEntry<unknown>>();
const inflightRefreshes = new Map<string, Promise<unknown>>();
const backgroundRefreshFailedUntil = new Map<string, number>();
let cacheGeneration = 0;

export class SourceUpstreamError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'SourceUpstreamError';
    this.status = status;
  }
}

/** 清理进程内缓存（供单元测试或主动失效场景使用） */
export function clearSourceBrowserMemoryCache(): void {
  cacheGeneration += 1;
  memoryCache.clear();
  inflightRefreshes.clear();
  backgroundRefreshFailedUntil.clear();
}

function parseDbCacheValue<T>(
  raw: unknown,
  isCacheable: (value: T) => boolean,
): { value: T; freshUntil: number; isStale: boolean } | null {
  if (raw === null || raw === undefined) return null;

  if (
    typeof raw === 'object' &&
    'data' in raw &&
    'freshUntil' in raw &&
    typeof (raw as DbCacheEnvelope<T>).freshUntil === 'number'
  ) {
    const envelope = raw as DbCacheEnvelope<T>;
    if (!isCacheable(envelope.data)) return null;
    return {
      value: envelope.data,
      freshUntil: envelope.freshUntil,
      isStale: Date.now() >= envelope.freshUntil,
    };
  }

  // 兼容旧版无信封包装的缓存结构，视为新鲜命中，避免无谓二次回源
  const legacyValue = raw as T;
  if (!isCacheable(legacyValue)) return null;
  return {
    value: legacyValue,
    freshUntil: Date.now() + 60_000,
    isStale: false,
  };
}

interface CacheConfig<T> {
  cacheKey: string;
  memoryTtlMs: number;
  softFreshMs: number;
  dbTtlSeconds: number;
  loader: () => Promise<T>;
  isCacheable: (value: T) => boolean;
  forceRefresh?: boolean;
}

function refreshAndCache<T>(config: CacheConfig<T>): Promise<T> {
  const {
    cacheKey,
    memoryTtlMs,
    softFreshMs,
    dbTtlSeconds,
    loader,
    isCacheable,
  } = config;
  const inflight = inflightRefreshes.get(cacheKey);
  if (inflight) {
    return inflight as Promise<T>;
  }

  const generation = cacheGeneration;
  const task = loader()
    .then(async (value) => {
      if (isCacheable(value)) {
        const now = Date.now();
        const freshUntil = now + softFreshMs;
        if (generation === cacheGeneration) {
          memoryCache.set(cacheKey, {
            value,
            freshUntil,
            expireAt: now + memoryTtlMs,
          });
          backgroundRefreshFailedUntil.delete(cacheKey);
        }
        const envelope: DbCacheEnvelope<T> = { data: value, freshUntil };
        const writePromise = db
          .setCache(cacheKey, envelope, dbTtlSeconds)
          .catch(() => undefined);
        if (config.forceRefresh) {
          await writePromise;
        }
      }
      return value;
    })
    .finally(() => {
      if (inflightRefreshes.get(cacheKey) === task) {
        inflightRefreshes.delete(cacheKey);
      }
    });

  inflightRefreshes.set(cacheKey, task);
  return task;
}

function triggerBackgroundRefresh<T>(config: CacheConfig<T>): void {
  const failedUntil = backgroundRefreshFailedUntil.get(config.cacheKey) ?? 0;
  if (Date.now() < failedUntil) {
    return;
  }

  const generation = cacheGeneration;
  void refreshAndCache(config)
    .then((value) => {
      if (generation === cacheGeneration && !config.isCacheable(value)) {
        backgroundRefreshFailedUntil.set(
          config.cacheKey,
          Date.now() + BACKGROUND_REFRESH_COOLDOWN_MS,
        );
      }
    })
    .catch(() => {
      if (generation === cacheGeneration) {
        backgroundRefreshFailedUntil.set(
          config.cacheKey,
          Date.now() + BACKGROUND_REFRESH_COOLDOWN_MS,
        );
      }
    });
}

async function readThroughCache<T>(config: CacheConfig<T>): Promise<T> {
  const { cacheKey, memoryTtlMs, isCacheable, forceRefresh } = config;

  if (!forceRefresh) {
    const mem = memoryCache.get(cacheKey) as MemoryCacheEntry<T> | undefined;
    if (mem && Date.now() < mem.expireAt) {
      if (Date.now() >= mem.freshUntil) {
        triggerBackgroundRefresh(config);
      }
      return mem.value;
    }
    if (mem) {
      memoryCache.delete(cacheKey);
    }

    try {
      const dbCached = await withAbortableTimeout(
        () => db.getCache(cacheKey),
        DB_READ_TIMEOUT_MS,
      );
      const parsed = parseDbCacheValue(dbCached, isCacheable);
      if (parsed) {
        memoryCache.set(cacheKey, {
          value: parsed.value,
          freshUntil: parsed.freshUntil,
          expireAt: Date.now() + memoryTtlMs,
        });
        if (parsed.isStale) {
          triggerBackgroundRefresh(config);
        }
        return parsed.value;
      }
    } catch {
      // 缓存读取失败时继续回源
    }
  }

  return refreshAndCache(config);
}

/**
 * 获取片源分类列表（带进程内 + DB SWR 缓存与并发请求合并）
 */
export async function fetchSourceCategories(
  source: ApiSite,
  options?: SourceFetchOptions,
): Promise<SourceCategoryItem[]> {
  const cacheKey = `source-browser-categories-v1:${source.key}`;
  return readThroughCache({
    cacheKey,
    memoryTtlMs: CATEGORIES_MEMORY_TTL_MS,
    softFreshMs: CATEGORIES_SOFT_FRESH_MS,
    dbTtlSeconds: CATEGORIES_DB_TTL_SECONDS,
    forceRefresh: options?.forceRefresh,
    loader: async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      try {
        const res = await fetch(`${source.api}?ac=list`, {
          headers: API_CONFIG.search.headers,
          signal: controller.signal,
        });
        if (!res.ok) {
          throw new SourceUpstreamError(
            res.status,
            `上游返回错误: ${res.status}`,
          );
        }
        const data = (await res.json()) as { class?: AppleCMSClass[] };
        const classes: AppleCMSClass[] = Array.isArray(data.class)
          ? data.class
          : [];
        return classes
          .map((c) => ({
            type_id: c.type_id ?? c.typeid ?? c.id,
            type_name: c.type_name ?? c.typename ?? c.name,
          }))
          .filter((c): c is SourceCategoryItem =>
            Boolean(c.type_id && c.type_name),
          );
      } finally {
        clearTimeout(timeoutId);
      }
    },
    isCacheable: (categories) => categories.length > 0,
  });
}

/**
 * 获取片源分类下影片列表（带进程内 + DB SWR 缓存与并发请求合并）
 */
export async function fetchSourceVideoList(
  source: ApiSite,
  typeId: string,
  page: number,
  options?: SourceFetchOptions,
): Promise<SourceVideoListResult> {
  const cacheKey = `source-browser-list-v1:${source.key}:${typeId}:${page}`;
  return readThroughCache({
    cacheKey,
    memoryTtlMs: LIST_MEMORY_TTL_MS,
    softFreshMs: LIST_SOFT_FRESH_MS,
    dbTtlSeconds: LIST_DB_TTL_SECONDS,
    forceRefresh: options?.forceRefresh,
    loader: async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      try {
        const url = `${source.api}?ac=videolist&t=${encodeURIComponent(
          typeId,
        )}&pg=${page}`;
        const res = await fetch(url, {
          headers: API_CONFIG.search.headers,
          signal: controller.signal,
        });
        if (!res.ok) {
          throw new SourceUpstreamError(
            res.status,
            `上游返回错误: ${res.status}`,
          );
        }
        const data = (await res.json()) as AppleCMSVideoListResponse;
        const list: AppleCMSItem[] = Array.isArray(data.list)
          ? data.list
          : Array.isArray(data.data)
            ? data.data
            : [];
        const items = list
          .map((r) => ({
            id: String(r.vod_id ?? r.id ?? ''),
            title: String(r.vod_name ?? r.title ?? ''),
            poster: String(r.vod_pic ?? r.pic ?? ''),
            year: String(r.vod_year ?? r.year ?? ''),
            type_name: String(r.type_name ?? ''),
            remarks: String(r.vod_remarks ?? r.remarks ?? ''),
          }))
          .filter((r) => r.id && r.title);

        return {
          items,
          meta: {
            page: Number(data.page ?? page),
            pagecount: Number(data.pagecount ?? data.pageCount ?? 1),
            total: Number(data.total ?? items.length),
            limit: Number(data.limit ?? data.pageSize ?? 0),
          },
        };
      } finally {
        clearTimeout(timeoutId);
      }
    },
    isCacheable: (result) => result.items.length > 0,
  });
}

/**
 * 预热片源分类及默认分类首屏列表（供启动/定时 cron 调用）。
 * 不同源并发执行，单源失败不影响其余源。
 */
export async function warmSourceBrowserSources(
  targets: SourceWarmTarget[],
): Promise<void> {
  const seenKeys = new Set<string>();
  const uniqueTargets = targets.filter((t) => {
    if (!t.source.api?.trim() || seenKeys.has(t.source.key)) {
      return false;
    }
    seenKeys.add(t.source.key);
    return true;
  });

  await Promise.allSettled(
    uniqueTargets.map(async ({ source, isAdult }) => {
      const categories = await fetchSourceCategories(source, {
        forceRefresh: true,
      });
      const defaultCategory = pickDefaultSourceCategory(
        categories,
        Boolean(isAdult),
      );
      if (defaultCategory) {
        await fetchSourceVideoList(source, String(defaultCategory.type_id), 1, {
          forceRefresh: true,
        });
      }
    }),
  );
}
