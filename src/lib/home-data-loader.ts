/**
 * 首页数据加载模块 - 按优先级分批加载数据
 */

import {
  type BangumiCalendarData,
  fetchBangumiCalendarData,
} from '@/lib/bangumi.client';
import { DATA_FETCH_TIMEOUTS } from '@/lib/constants/home';
import { getDoubanCategories } from '@/lib/douban.client';
import {
  type HomeData,
  EMPTY_HOME_DATA,
  getHomeDataAvailability,
} from '@/lib/home-data-types';
import { withAbortableTimeout } from '@/lib/promise-timeout';
import type { DoubanItem } from '@/lib/types';

const CLIENT_HOME_DATA_TTL_MS = 60_000;

type ClientHomeDataCache = {
  data: HomeData;
  expireAt: number;
};

let clientHomeDataCache: ClientHomeDataCache | null = null;
let inflightClientHomeData: Promise<HomeData> | null = null;

export type HomeLoadResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: unknown };

async function loadSection<T>(
  task: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  parentSignal?: AbortSignal,
): Promise<HomeLoadResult<T>> {
  try {
    return {
      ok: true,
      data: await withAbortableTimeout(task, timeoutMs, parentSignal),
    };
  } catch (error) {
    return { ok: false, error };
  }
}

async function loadDoubanSection(
  params: Parameters<typeof getDoubanCategories>[0],
  timeoutMs: number,
  parentSignal?: AbortSignal,
): Promise<HomeLoadResult<DoubanItem[]>> {
  return loadSection(
    async (signal) => {
      const result = await getDoubanCategories(params, signal);
      if (result.code !== 200) {
        throw new Error(result.message || '豆瓣分类加载失败');
      }
      return result.list;
    },
    timeoutMs,
    parentSignal,
  );
}

function readClientHomeDataCache(): HomeData | null {
  if (!clientHomeDataCache) return null;
  if (Date.now() >= clientHomeDataCache.expireAt) {
    clientHomeDataCache = null;
    return null;
  }
  return clientHomeDataCache.data;
}

function writeClientHomeDataCache(data: HomeData): void {
  if (!getHomeDataAvailability(data).isComplete) return;
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
      DATA_FETCH_TIMEOUTS.AGGREGATE,
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
export const loadCriticalData = (
  signal?: AbortSignal,
): Promise<HomeLoadResult<DoubanItem[]>> =>
  loadDoubanSection(
    { kind: 'movie', category: '热门', type: '全部' },
    DATA_FETCH_TIMEOUTS.CRITICAL,
    signal,
  );

/**
 * 加载次要数据 - 电视剧和综艺
 */
export const loadSecondaryData = async ({
  loadTvShows,
  loadVarietyShows,
  signal,
}: {
  loadTvShows: boolean;
  loadVarietyShows: boolean;
  signal?: AbortSignal;
}) => {
  const [hotTvShows, hotVarietyShows] = await Promise.all([
    loadTvShows
      ? loadDoubanSection(
          { kind: 'tv', category: 'tv', type: 'tv' },
          DATA_FETCH_TIMEOUTS.SECONDARY,
          signal,
        )
      : Promise.resolve(undefined),
    loadVarietyShows
      ? loadDoubanSection(
          { kind: 'tv', category: 'show', type: 'show' },
          DATA_FETCH_TIMEOUTS.SECONDARY,
          signal,
        )
      : Promise.resolve(undefined),
  ]);

  return {
    hotTvShows,
    hotVarietyShows,
  };
};

/**
 * 加载第三级数据 - 番剧
 */
export const loadTertiaryData = (
  signal?: AbortSignal,
): Promise<HomeLoadResult<BangumiCalendarData[]>> =>
  loadSection(
    (requestSignal) => fetchBangumiCalendarData(requestSignal),
    DATA_FETCH_TIMEOUTS.TERTIARY,
    signal,
  );
