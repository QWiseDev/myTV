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

function preferNonEmptyArray<T>(incoming: T[], current: T[]): T[] {
  return incoming.length ? incoming : current;
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
    hotMovies: preferNonEmptyArray(incoming.hotMovies, current.hotMovies),
    hotTvShows: preferNonEmptyArray(incoming.hotTvShows, current.hotTvShows),
    hotVarietyShows: preferNonEmptyArray(
      incoming.hotVarietyShows,
      current.hotVarietyShows,
    ),
    bangumiCalendarData: preferNonEmptyArray(
      incoming.bangumiCalendarData,
      current.bangumiCalendarData,
    ),
  };
}
