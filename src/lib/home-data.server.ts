import type { BangumiCalendarData } from '@/lib/bangumi.client';
import {
  BANGUMI_CALENDAR_ENDPOINT,
  normalizeBangumiCalendar,
} from '@/lib/bangumi-shared';
import { DATA_FETCH_TIMEOUTS } from '@/lib/constants/home';
import { db } from '@/lib/db';
import { fetchDoubanData } from '@/lib/douban';
import {
  type DoubanRecentHotResponse,
  buildDoubanCategoryUrl,
  mapDoubanRecentHotItems,
} from '@/lib/douban-shared';
import type { DoubanItem } from '@/lib/types';

import {
  type HomeData,
  EMPTY_HOME_DATA,
  getHomeDataAvailability,
} from './home-data-types';

/** 进程内短缓存，吸收同实例并发与 SSR/API 双拉 */
const HOME_DATA_MEMORY_TTL_MS = 60_000;
/** Redis/Kvrocks 缓存：公开热门内容，允许分钟级延迟 */
const HOME_DATA_DB_TTL_SECONDS = 5 * 60;
const HOME_DATA_CACHE_KEY = 'home:aggregate-v1';

type MemoryHomeDataCache = {
  data: HomeData;
  expireAt: number;
};

let memoryHomeDataCache: MemoryHomeDataCache | null = null;
let inflightHomeDataPromise: Promise<HomeData> | null = null;

async function getDoubanCategory(params: {
  kind: 'movie' | 'tv';
  category: string;
  type: string;
  signal?: AbortSignal;
}): Promise<DoubanItem[]> {
  const target = buildDoubanCategoryUrl(params);
  const data = await fetchDoubanData<DoubanRecentHotResponse>(
    target,
    params.signal,
  );

  return mapDoubanRecentHotItems(data);
}

async function getBangumiCalendar(
  signal?: AbortSignal,
): Promise<BangumiCalendarData[]> {
  const response = await fetch(BANGUMI_CALENDAR_ENDPOINT, {
    headers: { Accept: 'application/json' },
    next: { revalidate: 30 * 60 },
    signal,
  });

  if (!response.ok) {
    return [];
  }

  const data = await response.json();
  return normalizeBangumiCalendar(data);
}

async function withAbortableTimeout<T>(
  task: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  fallback: T,
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await task(controller.signal);
  } catch {
    return fallback;
  } finally {
    clearTimeout(timeoutId);
  }
}

function isUsableHomeData(data: HomeData | null | undefined): data is HomeData {
  return Boolean(data && getHomeDataAvailability(data).hasAnyData);
}

function readMemoryHomeData(): HomeData | null {
  if (!memoryHomeDataCache) {
    return null;
  }

  if (Date.now() >= memoryHomeDataCache.expireAt) {
    memoryHomeDataCache = null;
    return null;
  }

  return memoryHomeDataCache.data;
}

function writeMemoryHomeData(data: HomeData): void {
  memoryHomeDataCache = {
    data,
    expireAt: Date.now() + HOME_DATA_MEMORY_TTL_MS,
  };
}

async function readDbHomeData(): Promise<HomeData | null> {
  try {
    const cached = await db.getCache(HOME_DATA_CACHE_KEY);
    if (!isUsableHomeData(cached)) {
      return null;
    }
    return cached;
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('读取首页聚合缓存失败:', error);
    }
    return null;
  }
}

async function writeDbHomeData(data: HomeData): Promise<void> {
  try {
    await db.setCache(HOME_DATA_CACHE_KEY, data, HOME_DATA_DB_TTL_SECONDS);
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('写入首页聚合缓存失败:', error);
    }
  }
}

async function fetchFreshHomeData(): Promise<HomeData> {
  const [movies, tvShows, varietyShows, bangumiCalendarData] =
    await Promise.all([
      withAbortableTimeout(
        (signal) =>
          getDoubanCategory({
            kind: 'movie',
            category: '热门',
            type: '全部',
            signal,
          }),
        DATA_FETCH_TIMEOUTS.CRITICAL,
        EMPTY_HOME_DATA.hotMovies,
      ),
      withAbortableTimeout(
        (signal) =>
          getDoubanCategory({
            kind: 'tv',
            category: 'tv',
            type: 'tv',
            signal,
          }),
        DATA_FETCH_TIMEOUTS.SECONDARY,
        EMPTY_HOME_DATA.hotTvShows,
      ),
      withAbortableTimeout(
        (signal) =>
          getDoubanCategory({
            kind: 'tv',
            category: 'show',
            type: 'show',
            signal,
          }),
        DATA_FETCH_TIMEOUTS.SECONDARY,
        EMPTY_HOME_DATA.hotVarietyShows,
      ),
      withAbortableTimeout(
        (signal) => getBangumiCalendar(signal),
        DATA_FETCH_TIMEOUTS.TERTIARY,
        EMPTY_HOME_DATA.bangumiCalendarData,
      ),
    ]);

  return {
    hotMovies: movies,
    hotTvShows: tvShows,
    hotVarietyShows: varietyShows,
    bangumiCalendarData,
  };
}

/**
 * 获取首页聚合数据。
 * 优先进程内存 -> Redis/Kvrocks -> 上游；同进程并发合并为一次上游请求。
 */
export async function getServerHomeData(): Promise<HomeData> {
  const memoryCached = readMemoryHomeData();
  if (memoryCached) {
    return memoryCached;
  }

  if (inflightHomeDataPromise) {
    return inflightHomeDataPromise;
  }

  inflightHomeDataPromise = (async () => {
    const dbCached = await readDbHomeData();
    if (dbCached) {
      writeMemoryHomeData(dbCached);
      return dbCached;
    }

    const fresh = await fetchFreshHomeData();
    if (isUsableHomeData(fresh)) {
      writeMemoryHomeData(fresh);
      void writeDbHomeData(fresh);
    }
    return fresh;
  })();

  try {
    return await inflightHomeDataPromise;
  } finally {
    inflightHomeDataPromise = null;
  }
}

/** 测试/运维用：清理进程内缓存 */
export function clearServerHomeDataMemoryCache(): void {
  memoryHomeDataCache = null;
  inflightHomeDataPromise = null;
}
