'use client';

import type { TMDBHeroInfo } from '@/lib/tmdb.client';

const MAX_BATCH_SIZE = 8;

export interface TMDBHeroLookupItem {
  title: string;
  year?: string;
}

// 进程内客户端缓存：仅缓存服务端成功响应（含确认无横图 null），失败不落缓存以便重试
const heroInfoMemoryCache = new Map<string, TMDBHeroInfo | null>();
const inflightHeroLookups = new Map<string, Promise<TMDBHeroInfo | null>>();

function toCacheKey(title: string, year?: string): string {
  return `${title.trim()}|${(year || '').trim()}`;
}

export function peekCachedTMDBHeroInfo(
  title: string,
  year?: string,
): TMDBHeroInfo | null | undefined {
  return heroInfoMemoryCache.get(toCacheKey(title, year));
}

export function clearTMDBHeroClientCache(): void {
  heroInfoMemoryCache.clear();
  inflightHeroLookups.clear();
}

async function fetchChunk(
  chunk: TMDBHeroLookupItem[],
  signal?: AbortSignal,
): Promise<Record<string, TMDBHeroInfo | null>> {
  const params = new URLSearchParams();
  for (const item of chunk) {
    params.append('title', item.title.trim());
    params.append('year', item.year?.trim() || '');
  }

  const response = await fetch(`/api/tmdb/hero?v=2&${params.toString()}`, {
    signal,
  });
  if (!response.ok) {
    return {};
  }

  const payload = (await response.json()) as {
    info?: Record<string, TMDBHeroInfo | null>;
  } | null;
  if (!payload?.info) {
    return {};
  }

  for (const item of chunk) {
    const trimmed = item.title.trim();
    const key = toCacheKey(trimmed, item.year);
    const info = payload.info[trimmed] ?? null;
    heroInfoMemoryCache.set(key, info);
  }

  return payload.info;
}

/**
 * 批量获取 TMDB 横图与简介增强信息：
 * - HeroCarousel 与 ContinueWatching 16:9 横版卡共享同一内存缓存与并发去重，
 *   同名剧集不会重复发起 /api/tmdb/hero 请求。
 */
export async function fetchTMDBHeroInfoBatch(
  items: TMDBHeroLookupItem[],
  signal?: AbortSignal,
): Promise<Record<string, TMDBHeroInfo>> {
  if (typeof fetch === 'undefined' || items.length === 0) {
    return {};
  }

  const resolved: Record<string, TMDBHeroInfo> = {};
  const toRequest: TMDBHeroLookupItem[] = [];
  const pendingPromises: Array<Promise<void>> = [];
  const seenKeys = new Set<string>();

  for (const item of items) {
    const title = item.title.trim();
    if (!title) continue;
    const key = toCacheKey(title, item.year);
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);

    if (heroInfoMemoryCache.has(key)) {
      const cached = heroInfoMemoryCache.get(key);
      if (cached?.backdrop) {
        resolved[title] = cached;
      }
      continue;
    }

    const inflight = inflightHeroLookups.get(key);
    if (inflight) {
      pendingPromises.push(
        inflight.then((info) => {
          if (info?.backdrop) {
            resolved[title] = info;
          }
        }),
      );
      continue;
    }

    toRequest.push({ title, year: item.year });
  }

  for (let start = 0; start < toRequest.length; start += MAX_BATCH_SIZE) {
    const chunk = toRequest.slice(start, start + MAX_BATCH_SIZE);
    const resolvers = new Map<string, (val: TMDBHeroInfo | null) => void>();

    for (const item of chunk) {
      const key = toCacheKey(item.title, item.year);
      const promise = new Promise<TMDBHeroInfo | null>((resolve) => {
        resolvers.set(key, resolve);
      });
      inflightHeroLookups.set(key, promise);
    }

    pendingPromises.push(
      fetchChunk(chunk, signal)
        .then((infoMap) => {
          for (const item of chunk) {
            const key = toCacheKey(item.title, item.year);
            const info = infoMap[item.title] ?? null;
            if (info?.backdrop) {
              resolved[item.title] = info;
            }
            resolvers.get(key)?.(info);
            inflightHeroLookups.delete(key);
          }
        })
        .catch(() => {
          for (const item of chunk) {
            const key = toCacheKey(item.title, item.year);
            resolvers.get(key)?.(null);
            inflightHeroLookups.delete(key);
          }
        }),
    );
  }

  await Promise.all(pendingPromises);
  return resolved;
}
