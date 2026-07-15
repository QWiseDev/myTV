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
/** 首页聚合缓存读取上限，避免 Redis 重连阻塞 SSR/API */
const HOME_DATA_DB_READ_TIMEOUT_MS = 500;
const HOME_DATA_CACHE_KEY = 'home:aggregate-v1';

type MemoryCache<T> = {
  data: T;
  expireAt: number;
};

let memoryHomeDataCache: MemoryCache<HomeData> | null = null;
let memoryCriticalMoviesCache: MemoryCache<DoubanItem[]> | null = null;
let inflightHomeDataPromise: Promise<HomeData> | null = null;
let inflightInitialHomeDataPromise: Promise<HomeData> | null = null;
let inflightCriticalMoviesPromise: Promise<DoubanItem[]> | null = null;
let homeDataCacheGeneration = 0;

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

async function withDeadline<T>(
  promise: Promise<T>,
  timeoutMs: number,
  fallback: T,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((resolve) => {
        timeoutId = setTimeout(() => resolve(fallback), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }
}

function isCompleteHomeData(
  data: HomeData | null | undefined,
): data is HomeData {
  return Boolean(data && getHomeDataAvailability(data).isComplete);
}

function readMemoryCache<T>(cache: MemoryCache<T> | null): T | null {
  if (!cache || Date.now() >= cache.expireAt) {
    return null;
  }

  return cache.data;
}

function readMemoryHomeData(): HomeData | null {
  return readMemoryCache(memoryHomeDataCache);
}

function writeMemoryHomeData(data: HomeData): void {
  memoryHomeDataCache = {
    data,
    expireAt: Date.now() + HOME_DATA_MEMORY_TTL_MS,
  };
}

function readMemoryCriticalMovies(): DoubanItem[] | null {
  return readMemoryCache(memoryCriticalMoviesCache);
}

function writeMemoryCriticalMovies(data: DoubanItem[]): void {
  memoryCriticalMoviesCache = {
    data,
    expireAt: Date.now() + HOME_DATA_MEMORY_TTL_MS,
  };
}

function writeCompleteMemoryHomeData(data: HomeData): void {
  if (!isCompleteHomeData(data)) {
    return;
  }

  writeMemoryHomeData(data);
  memoryCriticalMoviesCache = null;
}

function createCriticalHomeData(hotMovies: DoubanItem[]): HomeData {
  return {
    ...EMPTY_HOME_DATA,
    hotMovies,
  };
}

async function readDbHomeData(): Promise<HomeData | null> {
  try {
    const cached = await db.getCache(HOME_DATA_CACHE_KEY);
    if (!isCompleteHomeData(cached)) {
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

function readDbHomeDataWithDeadline(): Promise<HomeData | null> {
  return withDeadline(readDbHomeData(), HOME_DATA_DB_READ_TIMEOUT_MS, null);
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

async function getCriticalMovies(): Promise<DoubanItem[]> {
  const fullMemoryCached = readMemoryHomeData();
  if (fullMemoryCached) {
    return fullMemoryCached.hotMovies;
  }

  const memoryCached = readMemoryCriticalMovies();
  if (memoryCached) {
    return memoryCached;
  }

  if (inflightCriticalMoviesPromise) {
    return inflightCriticalMoviesPromise;
  }

  const generation = homeDataCacheGeneration;
  const request = withAbortableTimeout(
    (signal) =>
      getDoubanCategory({
        kind: 'movie',
        category: '热门',
        type: '全部',
        signal,
      }),
    DATA_FETCH_TIMEOUTS.CRITICAL,
    EMPTY_HOME_DATA.hotMovies,
  );
  inflightCriticalMoviesPromise = request;

  try {
    const movies = await request;
    if (
      movies.length > 0 &&
      generation === homeDataCacheGeneration &&
      !readMemoryHomeData()
    ) {
      writeMemoryCriticalMovies(movies);
    }
    return movies;
  } finally {
    if (inflightCriticalMoviesPromise === request) {
      inflightCriticalMoviesPromise = null;
    }
  }
}

async function fetchFreshHomeData(): Promise<HomeData> {
  const [movies, tvShows, varietyShows, bangumiCalendarData] =
    await Promise.all([
      getCriticalMovies(),
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

  const generation = homeDataCacheGeneration;
  const request = (async () => {
    const hasCriticalDataSource = Boolean(
      readMemoryCriticalMovies() || inflightCriticalMoviesPromise,
    );
    const dbCached = hasCriticalDataSource
      ? null
      : await readDbHomeDataWithDeadline();

    const memoryCachedAfterDb = readMemoryHomeData();
    if (memoryCachedAfterDb) {
      return memoryCachedAfterDb;
    }

    if (dbCached) {
      if (generation === homeDataCacheGeneration) {
        writeCompleteMemoryHomeData(dbCached);
      }
      return dbCached;
    }

    const fresh = await fetchFreshHomeData();
    if (isCompleteHomeData(fresh) && generation === homeDataCacheGeneration) {
      writeCompleteMemoryHomeData(fresh);
      void writeDbHomeData(fresh);
      return fresh;
    }

    return readMemoryHomeData() ?? fresh;
  })();
  inflightHomeDataPromise = request;

  try {
    return await request;
  } finally {
    if (inflightHomeDataPromise === request) {
      inflightHomeDataPromise = null;
    }
  }
}

/**
 * 获取首页 SSR 首批数据。
 * 完整缓存命中时直接复用；冷缓存只等待热门电影，其余区块交给客户端补载。
 */
export async function getServerInitialHomeData(): Promise<HomeData> {
  const fullMemoryCached = readMemoryHomeData();
  if (fullMemoryCached) {
    return fullMemoryCached;
  }

  const criticalMemoryCached = readMemoryCriticalMovies();
  if (criticalMemoryCached) {
    return createCriticalHomeData(criticalMemoryCached);
  }

  if (inflightInitialHomeDataPromise) {
    return inflightInitialHomeDataPromise;
  }

  const generation = homeDataCacheGeneration;
  const request = (async () => {
    const dbCached = await readDbHomeDataWithDeadline();

    const fullMemoryCachedAfterDb = readMemoryHomeData();
    if (fullMemoryCachedAfterDb) {
      return fullMemoryCachedAfterDb;
    }

    if (dbCached) {
      if (generation === homeDataCacheGeneration) {
        writeCompleteMemoryHomeData(dbCached);
      }
      return dbCached;
    }

    const movies = await getCriticalMovies();
    return readMemoryHomeData() ?? createCriticalHomeData(movies);
  })();
  inflightInitialHomeDataPromise = request;

  try {
    return await request;
  } finally {
    if (inflightInitialHomeDataPromise === request) {
      inflightInitialHomeDataPromise = null;
    }
  }
}

/** 测试/运维用：清理进程内缓存 */
export function clearServerHomeDataMemoryCache(): void {
  homeDataCacheGeneration += 1;
  memoryHomeDataCache = null;
  memoryCriticalMoviesCache = null;
  inflightHomeDataPromise = null;
  inflightInitialHomeDataPromise = null;
  inflightCriticalMoviesPromise = null;
}
