import type { BangumiCalendarData } from '@/lib/bangumi.client';
import type { DoubanItem } from '@/lib/types';

export interface HomeData {
  hotMovies: DoubanItem[];
  hotTvShows: DoubanItem[];
  hotVarietyShows: DoubanItem[];
  bangumiCalendarData: BangumiCalendarData[];
}

export const EMPTY_HOME_DATA: HomeData = {
  hotMovies: [],
  hotTvShows: [],
  hotVarietyShows: [],
  bangumiCalendarData: [],
};

export interface HomeDataAvailability {
  hasAnyData: boolean;
  hasCriticalData: boolean;
  hasSecondaryData: boolean;
  hasTertiaryData: boolean;
  isComplete: boolean;
}

export function getHomeDataAvailability(
  data: HomeData | null | undefined
): HomeDataAvailability {
  const hasCriticalData = Boolean(data?.hotMovies.length);
  const hasSecondaryData = Boolean(
    data?.hotTvShows.length && data.hotVarietyShows.length
  );
  const hasTertiaryData = Boolean(data?.bangumiCalendarData.length);
  const hasAnyData = hasCriticalData || hasSecondaryData || hasTertiaryData;

  return {
    hasAnyData,
    hasCriticalData,
    hasSecondaryData,
    hasTertiaryData,
    isComplete: hasCriticalData && hasSecondaryData && hasTertiaryData,
  };
}

export function hasHomeData(
  data: HomeData | null | undefined
): data is HomeData {
  return getHomeDataAvailability(data).hasAnyData;
}
