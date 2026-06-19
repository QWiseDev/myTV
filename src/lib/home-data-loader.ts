/**
 * 首页数据加载模块 - 按优先级分批加载数据
 */

import { GetBangumiCalendarData } from '@/lib/bangumi.client';
import { DATA_FETCH_TIMEOUTS } from '@/lib/constants/home';
import { getDoubanCategories } from '@/lib/douban.client';
import { EMPTY_HOME_DATA, HomeData } from '@/lib/home-data-types';
import { withTimeout } from '@/lib/promise-timeout';

export async function loadHomeDataFromApi(): Promise<HomeData> {
  const response = await fetch('/api/home');
  if (!response.ok) {
    return EMPTY_HOME_DATA;
  }

  return (await response.json()) as HomeData;
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
    }
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
      }
    ),
    withTimeout(
      getDoubanCategories({ kind: 'tv', category: 'show', type: 'show' }),
      DATA_FETCH_TIMEOUTS.SECONDARY,
      {
        code: 200,
        message: 'fallback',
        list: [],
      }
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
