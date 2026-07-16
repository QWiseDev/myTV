/**
 * 首页数据加载模块 - 按优先级分批加载数据
 */

import {
  type BangumiCalendarData,
  fetchBangumiCalendarData,
} from '@/lib/bangumi.client';
import { DATA_FETCH_TIMEOUTS } from '@/lib/constants/home';
import { getDoubanCategories } from '@/lib/douban.client';
import { withAbortableTimeout } from '@/lib/promise-timeout';
import type { DoubanItem } from '@/lib/types';

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
