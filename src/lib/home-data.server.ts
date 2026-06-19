import type { BangumiCalendarData } from '@/lib/bangumi.client';
import {
  BANGUMI_CALENDAR_ENDPOINT,
  normalizeBangumiCalendar,
} from '@/lib/bangumi-shared';
import { DATA_FETCH_TIMEOUTS } from '@/lib/constants/home';
import { fetchDoubanData } from '@/lib/douban';
import {
  type DoubanRecentHotResponse,
  buildDoubanCategoryUrl,
  mapDoubanRecentHotItems,
} from '@/lib/douban-shared';
import { withTimeout } from '@/lib/promise-timeout';
import type { DoubanItem } from '@/lib/types';

import { EMPTY_HOME_DATA, HomeData } from './home-data-types';

async function getDoubanCategory(params: {
  kind: 'movie' | 'tv';
  category: string;
  type: string;
}): Promise<DoubanItem[]> {
  const target = buildDoubanCategoryUrl(params);
  const data = await fetchDoubanData<DoubanRecentHotResponse>(target);

  return mapDoubanRecentHotItems(data);
}

async function getBangumiCalendar(): Promise<BangumiCalendarData[]> {
  const response = await fetch(BANGUMI_CALENDAR_ENDPOINT, {
    headers: { Accept: 'application/json' },
    next: { revalidate: 30 * 60 },
  });

  if (!response.ok) {
    return [];
  }

  const data = await response.json();
  return normalizeBangumiCalendar(data);
}

export async function getServerHomeData(): Promise<HomeData> {
  const [movies, tvShows, varietyShows, bangumiCalendarData] =
    await Promise.all([
      withTimeout(
        getDoubanCategory({ kind: 'movie', category: '热门', type: '全部' }),
        DATA_FETCH_TIMEOUTS.CRITICAL,
        EMPTY_HOME_DATA.hotMovies
      ),
      withTimeout(
        getDoubanCategory({ kind: 'tv', category: 'tv', type: 'tv' }),
        DATA_FETCH_TIMEOUTS.SECONDARY,
        EMPTY_HOME_DATA.hotTvShows
      ),
      withTimeout(
        getDoubanCategory({ kind: 'tv', category: 'show', type: 'show' }),
        DATA_FETCH_TIMEOUTS.SECONDARY,
        EMPTY_HOME_DATA.hotVarietyShows
      ),
      withTimeout(
        getBangumiCalendar(),
        DATA_FETCH_TIMEOUTS.TERTIARY,
        EMPTY_HOME_DATA.bangumiCalendarData
      ),
    ]);

  return {
    hotMovies: movies,
    hotTvShows: tvShows,
    hotVarietyShows: varietyShows,
    bangumiCalendarData,
  };
}
