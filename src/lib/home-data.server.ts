import { DATA_FETCH_TIMEOUTS } from '@/lib/constants/home';
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

type CriticalMoviesCache = {
  data: DoubanItem[];
  expireAt: number;
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

async function getCriticalMovies(): Promise<DoubanItem[]> {
  const memoryCached = readMemoryCriticalMovies();
  if (memoryCached) {
    return memoryCached;
  }

  if (inflightCriticalMoviesPromise) {
    return inflightCriticalMoviesPromise;
  }

  // 冷却期内跳过上游请求，避免故障时每个首页请求都占用源站连接到超时
  if (Date.now() < criticalMoviesFailedUntil) {
    return EMPTY_HOME_DATA.hotMovies;
  }

  const generation = homeDataCacheGeneration;
  const request = withAbortableTimeout(async (signal) => {
    const target = buildDoubanCategoryUrl({
      kind: 'movie',
      category: '热门',
      type: '全部',
    });
    const data = await fetchDoubanData<DoubanRecentHotResponse>(target, signal);
    return mapDoubanRecentHotItems(data);
  }, DATA_FETCH_TIMEOUTS.CRITICAL).catch((error) => {
    console.error('首页关键数据（热门电影）预取失败:', error);
    return EMPTY_HOME_DATA.hotMovies;
  });
  inflightCriticalMoviesPromise = request;

  try {
    const movies = await request;
    if (generation === homeDataCacheGeneration) {
      if (movies.length > 0) {
        writeMemoryCriticalMovies(movies);
      } else {
        criticalMoviesFailedUntil = Date.now() + HOME_DATA_FAILURE_COOLDOWN_MS;
      }
    }
    return movies;
  } finally {
    if (inflightCriticalMoviesPromise === request) {
      inflightCriticalMoviesPromise = null;
    }
  }
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
