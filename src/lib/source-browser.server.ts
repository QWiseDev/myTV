import { type ApiSite, API_CONFIG } from '@/lib/config';
import { db } from '@/lib/db';
import { withAbortableTimeout } from '@/lib/promise-timeout';

export interface SourceCategoryItem {
  type_id: string | number;
  type_name: string;
}

export interface SourceVideoItem {
  id: string;
  title: string;
  poster: string;
  year: string;
  type_name: string;
  remarks: string;
}

export interface SourceVideoListResult {
  items: SourceVideoItem[];
  meta: {
    page: number;
    pagecount: number;
    total: number;
    limit: number;
  };
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

const CATEGORIES_MEMORY_TTL_MS = 5 * 60_000;
const CATEGORIES_DB_TTL_SECONDS = 30 * 60;
const LIST_MEMORY_TTL_MS = 2 * 60_000;
const LIST_DB_TTL_SECONDS = 10 * 60;
const DB_READ_TIMEOUT_MS = 500;

const memoryCache = new Map<string, { value: unknown; expireAt: number }>();
const inflightRequests = new Map<string, Promise<unknown>>();

export class SourceUpstreamError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'SourceUpstreamError';
    this.status = status;
  }
}

async function readThroughCache<T>(
  cacheKey: string,
  memoryTtlMs: number,
  dbTtlSeconds: number,
  loader: () => Promise<T>,
  isCacheable: (value: T) => boolean,
): Promise<T> {
  const mem = memoryCache.get(cacheKey);
  if (mem && Date.now() < mem.expireAt) {
    return mem.value as T;
  }
  if (mem) {
    memoryCache.delete(cacheKey);
  }

  try {
    const dbCached = await withAbortableTimeout(
      () => db.getCache(cacheKey),
      DB_READ_TIMEOUT_MS,
    );
    if (dbCached !== null && dbCached !== undefined) {
      memoryCache.set(cacheKey, {
        value: dbCached,
        expireAt: Date.now() + memoryTtlMs,
      });
      return dbCached as T;
    }
  } catch {
    // 缓存读取失败时继续回源
  }

  const inflight = inflightRequests.get(cacheKey);
  if (inflight) {
    return inflight as Promise<T>;
  }

  const task = loader()
    .then((value) => {
      if (isCacheable(value)) {
        memoryCache.set(cacheKey, {
          value,
          expireAt: Date.now() + memoryTtlMs,
        });
        void db.setCache(cacheKey, value, dbTtlSeconds).catch(() => undefined);
      }
      return value;
    })
    .finally(() => {
      if (inflightRequests.get(cacheKey) === task) {
        inflightRequests.delete(cacheKey);
      }
    });

  inflightRequests.set(cacheKey, task);
  return task;
}

/**
 * 获取片源分类列表（带进程内 + DB 缓存与并发请求合并）
 */
export async function fetchSourceCategories(
  source: ApiSite,
): Promise<SourceCategoryItem[]> {
  const cacheKey = `source-browser-categories-v1:${source.key}`;
  return readThroughCache(
    cacheKey,
    CATEGORIES_MEMORY_TTL_MS,
    CATEGORIES_DB_TTL_SECONDS,
    async () => {
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
    (categories) => categories.length > 0,
  );
}

/**
 * 获取片源分类下影片列表（带进程内 + DB 缓存与并发请求合并）
 */
export async function fetchSourceVideoList(
  source: ApiSite,
  typeId: string,
  page: number,
): Promise<SourceVideoListResult> {
  const cacheKey = `source-browser-list-v1:${source.key}:${typeId}:${page}`;
  return readThroughCache(
    cacheKey,
    LIST_MEMORY_TTL_MS,
    LIST_DB_TTL_SECONDS,
    async () => {
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
    (result) => result.items.length > 0,
  );
}
