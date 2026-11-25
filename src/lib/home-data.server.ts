import { DATA_FETCH_TIMEOUTS } from '@/lib/constants/home';
import { db } from '@/lib/db';
import { fetchDoubanData } from '@/lib/douban';
import {
  type DoubanRecentHotResponse,
  buildDoubanCategoryUrl,
  mapDoubanRecentHotItems,
} from '@/lib/douban-shared';
import { withAbortableTimeout } from '@/lib/promise-timeout';
import type { DoubanItem } from '@/lib/types';

import { type HomeData, EMPTY_HOME_DATA } from './home-data-types';

/** 进程内短缓存，吸收同实例的连续 SSR 请求 */
const HOME_DATA_MEMORY_TTL_MS = 60_000;
/** DB 持久化缓存软新鲜期（5 分钟内直接命中；超过后先返回旧数据再后台刷新） */
const HOME_DATA_DB_FRESH_TTL_MS = 5 * 60_000;
/** DB 持久化缓存过期时间（秒），兜底冷启动/跨实例首屏 */
const HOME_DATA_DB_TTL_SECONDS = 2 * 60 * 60;
const HOME_CRITICAL_MOVIES_DB_KEY = 'ssr-home-critical-movies-v1';
const DB_CACHE_READ_TIMEOUT_MS = 600;

type CriticalMoviesCache = {
  data: DoubanItem[];
  expireAt: number;
};

type CriticalMoviesDbPayload = {
  data: DoubanItem[];
  freshUntil: number;
};

let memoryCriticalMoviesCache: CriticalMoviesCache | null = null;
let inflightCriticalMoviesPromise: Promise<DoubanItem[]> | null = null;
let homeDataCacheGeneration = 0;

/** 失败冷却：上游故障期间不让每个 SSR 请求都等满超时，直接交给客户端补载 */
const HOME_DATA_FAILURE_COOLDOWN_MS = 15_000;
let criticalMoviesFailedUntil = 0;

function readMemoryCriticalMovies(): DoubanItem[] | null {
  if (
    !memoryCriticalMoviesCache ||
    Date.now() >= memoryCriticalMoviesCache.expireAt
  ) {
    return null;
  }

  return memoryCriticalMoviesCache.data;
}

function writeMemoryCriticalMovies(data: DoubanItem[]): void {
  memoryCriticalMoviesCache = {
    data,
    expireAt: Date.now() + HOME_DATA_MEMORY_TTL_MS,
  };
}

function createCriticalHomeData(hotMovies: DoubanItem[]): HomeData {
  return {
    ...EMPTY_HOME_DATA,
    hotMovies,
  };
}

function isValidDbPayload(value: unknown): value is CriticalMoviesDbPayload {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<CriticalMoviesDbPayload>;
  return (
    Array.isArray(candidate.data) &&
    candidate.data.length > 0 &&
    typeof candidate.freshUntil === 'number'
  );
}

async function readDbCriticalMovies(): Promise<{
  data: DoubanItem[];
  isStale: boolean;
} | null> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    const cached = await Promise.race([
      db.getCache(HOME_CRITICAL_MOVIES_DB_KEY),
      new Promise<null>((resolve) => {
        timeoutId = setTimeout(() => resolve(null), DB_CACHE_READ_TIMEOUT_MS);
      }),
    ]);
    if (!isValidDbPayload(cached)) {
      return null;
    }

    return {
      data: cached.data,
      isStale: Date.now() >= cached.freshUntil,
    };
  } catch {
    return null;
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }
}

function writeDbCriticalMovies(data: DoubanItem[]): void {
  const payload: CriticalMoviesDbPayload = {
    data,
    freshUntil: Date.now() + HOME_DATA_DB_FRESH_TTL_MS,
  };
  void db
    .setCache(HOME_CRITICAL_MOVIES_DB_KEY, payload, HOME_DATA_DB_TTL_SECONDS)
    .catch((error) => {
      console.warn('写入首页 SSR 持久化缓存失败:', error);
    });
}

function fetchCriticalMoviesFromUpstream(
  generation: number,
): Promise<DoubanItem[]> {
  return withAbortableTimeout(async (signal) => {
    const target = buildDoubanCategoryUrl({
      kind: 'movie',
      category: '热门',
      type: '全部',
    });
    const data = await fetchDoubanData<DoubanRecentHotResponse>(target, signal);
    return mapDoubanRecentHotItems(data);
  }, DATA_FETCH_TIMEOUTS.CRITICAL)
    .catch((error) => {
      console.error('首页关键数据（热门电影）预取失败:', error);
      return EMPTY_HOME_DATA.hotMovies;
    })
    .then((movies) => {
      if (generation === homeDataCacheGeneration) {
        if (movies.length > 0) {
          writeMemoryCriticalMovies(movies);
          writeDbCriticalMovies(movies);
        } else {
          criticalMoviesFailedUntil =
            Date.now() + HOME_DATA_FAILURE_COOLDOWN_MS;
        }
      }
      return movies;
    });
}

async function getCriticalMovies(): Promise<DoubanItem[]> {
  const memoryCached = readMemoryCriticalMovies();
  if (memoryCached) {
    return memoryCached;
  }

  if (inflightCriticalMoviesPromise) {
    return inflightCriticalMoviesPromise;
  }

  // 冷却期内跳过上游请求（但仍允许先查 DB 缓存；若已冷却且无 DB 命中则直接返回空）
  const generation = homeDataCacheGeneration;
  const request = (async (): Promise<DoubanItem[]> => {
    const dbCached = await readDbCriticalMovies();
    if (generation !== homeDataCacheGeneration) {
      // 缓存已被外部清理，退回当前代的新流程，避免把旧代请求结果复用给新代
      return fetchCriticalMoviesFromUpstream(generation);
    }

    if (dbCached) {
      writeMemoryCriticalMovies(dbCached.data);
      if (dbCached.isStale && Date.now() >= criticalMoviesFailedUntil) {
        void fetchCriticalMoviesFromUpstream(generation);
      }
      return dbCached.data;
    }

    if (Date.now() < criticalMoviesFailedUntil) {
      return EMPTY_HOME_DATA.hotMovies;
    }

    return fetchCriticalMoviesFromUpstream(generation);
  })().finally(() => {
    if (inflightCriticalMoviesPromise === request) {
      inflightCriticalMoviesPromise = null;
    }
  });

  inflightCriticalMoviesPromise = request;
  return request;
}

/**
 * 获取首页 SSR 首批数据。
 * 冷缓存只等待热门电影，其余区块交给客户端按优先级补载。
 */
export async function getServerInitialHomeData(): Promise<HomeData> {
  return createCriticalHomeData(await getCriticalMovies());
}

/** 测试/运维用：清理进程内缓存 */
export function clearServerHomeDataMemoryCache(): void {
  homeDataCacheGeneration += 1;
  memoryCriticalMoviesCache = null;
  inflightCriticalMoviesPromise = null;
  criticalMoviesFailedUntil = 0;
}
