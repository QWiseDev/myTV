import {
  type HomeData,
  EMPTY_HOME_DATA,
  getHomeDataAvailability,
} from './home-data-types';

export interface HomeLoadingState {
  criticalLoading: boolean;
  tertiaryLoading: boolean;
  tvLoading: boolean;
  varietyLoading: boolean;
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
    tertiaryLoading: !availability.hasTertiaryData,
    tvLoading: !availability.hasTvData,
    varietyLoading: !availability.hasVarietyData,
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

export function patchHomeData(
  current: HomeData,
  patch: Partial<HomeData>,
): HomeData {
  return {
    ...current,
    ...Object.fromEntries(
      Object.entries(patch).filter(([, value]) => value !== undefined),
    ),
  } as HomeData;
}

export function patchHomeLoadingState(
  current: HomeLoadingState,
  patch: Partial<HomeLoadingState>,
): HomeLoadingState {
  return {
    ...current,
    ...patch,
  };
}
