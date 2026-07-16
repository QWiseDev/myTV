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
  hasTvData: boolean;
  hasVarietyData: boolean;
  isComplete: boolean;
}

export function getHomeDataAvailability(
  data: HomeData | null | undefined,
): HomeDataAvailability {
  const hasCriticalData = Boolean(data?.hotMovies.length);
  const hasTvData = Boolean(data?.hotTvShows.length);
  const hasVarietyData = Boolean(data?.hotVarietyShows.length);
  const hasSecondaryData = hasTvData && hasVarietyData;
  const hasTertiaryData = Boolean(data?.bangumiCalendarData.length);
  const hasAnyData =
    hasCriticalData || hasTvData || hasVarietyData || hasTertiaryData;

  return {
    hasAnyData,
    hasCriticalData,
    hasSecondaryData,
    hasTertiaryData,
    hasTvData,
    hasVarietyData,
    isComplete: hasCriticalData && hasSecondaryData && hasTertiaryData,
  };
}
