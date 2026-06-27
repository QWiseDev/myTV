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
import type { DoubanItem } from '@/lib/types';

import { EMPTY_HOME_DATA, HomeData } from './home-data-types';

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

export async function getServerHomeData(): Promise<HomeData> {
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
