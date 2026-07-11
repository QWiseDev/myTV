/**
 * 首页数据加载模块 - 按优先级分批加载数据
 */

import { GetBangumiCalendarData } from '@/lib/bangumi.client';
import { DATA_FETCH_TIMEOUTS } from '@/lib/constants/home';
import { getDoubanCategories } from '@/lib/douban.client';
import {
  type HomeData,
  EMPTY_HOME_DATA,
  getHomeDataAvailability,
} from '@/lib/home-data-types';
import { withTimeout } from '@/lib/promise-timeout';

const CLIENT_HOME_DATA_TTL_MS = 60_000;

type ClientHomeDataCache = {
  data: HomeData;
  expireAt: number;
};

let clientHomeDataCache: ClientHomeDataCache | null = null;
let inflightClientHomeData: Promise<HomeData> | null = null;

function readClientHomeDataCache(): HomeData | null {
  if (!clientHomeDataCache) return null;
  if (Date.now() >= clientHomeDataCache.expireAt) {
    clientHomeDataCache = null;
    return null;
  }
  return clientHomeDataCache.data;
}

function writeClientHomeDataCache(data: HomeData): void {
  if (!getHomeDataAvailability(data).hasAnyData) return;
  clientHomeDataCache = {
    data,
    expireAt: Date.now() + CLIENT_HOME_DATA_TTL_MS,
  };
}

export async function loadHomeDataFromApi(): Promise<HomeData> {
  const cached = readClientHomeDataCache();
  if (cached) {
    return cached;
  }

  if (inflightClientHomeData) {
    return inflightClientHomeData;
  }

  inflightClientHomeData = (async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      DATA_FETCH_TIMEOUTS.CRITICAL,
    );

    try {
      const response = await fetch('/api/home', {
        signal: controller.signal,
        cache: 'default',
      });
      if (!response.ok) {
        return EMPTY_HOME_DATA;
      }

      const data = (await response.json()) as HomeData;
      writeClientHomeDataCache(data);
      return data;
    } catch {
      return EMPTY_HOME_DATA;
    } finally {
      clearTimeout(timeoutId);
    }
  })();

  try {
    return await inflightClientHomeData;
  } finally {
    inflightClientHomeData = null;
  }
}

/**
 * 加载关键数据 - 热门电影
 */
export const loadCriticalData = async () => {
  const hotMoviesPromise = withTimeout(
    getDoubanCategories({ kind: 'movie', category: '热门', type: '全部' }),
    DATA_FETCH_TIMEOUTS.CRITICAL,
    {
      code: 200,
      message: 'fallback',
      list: [],
    },
  );

  return { hotMoviesPromise };
};

/**
 * 加载次要数据 - 电视剧和综艺
 */
export const loadSecondaryData = async () => {
  const [tvShowsResult, varietyShowsResult] = await Promise.allSettled([
    withTimeout(
      getDoubanCategories({ kind: 'tv', category: 'tv', type: 'tv' }),
      DATA_FETCH_TIMEOUTS.SECONDARY,
      {
        code: 200,
        message: 'fallback',
        list: [],
      },
    ),
    withTimeout(
      getDoubanCategories({ kind: 'tv', category: 'show', type: 'show' }),
      DATA_FETCH_TIMEOUTS.SECONDARY,
      {
        code: 200,
        message: 'fallback',
        list: [],
      },
    ),
  ]);

  return {
    hotTvShows:
      tvShowsResult.status === 'fulfilled' ? tvShowsResult.value : undefined,
    hotVarietyShows:
      varietyShowsResult.status === 'fulfilled'
        ? varietyShowsResult.value
        : undefined,
  };
};

/**
 * 加载第三级数据 - 番剧
 */
export const loadTertiaryData = async () => {
  const [bangumiResult] = await Promise.allSettled([
    withTimeout(GetBangumiCalendarData(), DATA_FETCH_TIMEOUTS.TERTIARY),
  ]);

  return {
    bangumiCalendarData:
      bangumiResult.status === 'fulfilled' ? bangumiResult.value : [],
  };
};
