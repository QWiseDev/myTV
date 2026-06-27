import {
  EMPTY_HOME_DATA,
  getHomeDataAvailability,
  type HomeData,
} from './home-data-types';

export interface HomeLoadingState {
  criticalLoading: boolean;
  secondaryLoading: boolean;
  tertiaryLoading: boolean;
}

export function createHomeDataSnapshot(initialData?: HomeData): HomeData {
  return {
    hotMovies: initialData?.hotMovies || EMPTY_HOME_DATA.hotMovies,
    hotTvShows: initialData?.hotTvShows || EMPTY_HOME_DATA.hotTvShows,
    hotVarietyShows:
      initialData?.hotVarietyShows || EMPTY_HOME_DATA.hotVarietyShows,
    bangumiCalendarData:
      initialData?.bangumiCalendarData || EMPTY_HOME_DATA.bangumiCalendarData,
  };
}

export function createHomeLoadingState(
  initialData?: HomeData,
): HomeLoadingState {
  const availability = getHomeDataAvailability(initialData);

  return {
    criticalLoading: !availability.hasCriticalData,
    secondaryLoading: !availability.hasSecondaryData,
    tertiaryLoading: !availability.hasTertiaryData,
  };
}

export function mergeHomeData(current: HomeData, incoming: HomeData): HomeData {
  return {
    hotMovies: incoming.hotMovies.length
      ? incoming.hotMovies
      : current.hotMovies,
    hotTvShows: incoming.hotTvShows.length
      ? incoming.hotTvShows
      : current.hotTvShows,
    hotVarietyShows: incoming.hotVarietyShows.length
      ? incoming.hotVarietyShows
      : current.hotVarietyShows,
    bangumiCalendarData: incoming.bangumiCalendarData.length
      ? incoming.bangumiCalendarData
      : current.bangumiCalendarData,
  };
}
