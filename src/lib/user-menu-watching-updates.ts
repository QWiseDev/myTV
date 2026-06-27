import { parseStorageKey } from './storage-key';
import type { WatchingUpdate } from './watching-updates';

export type UserMenuWatchingUpdateSeries =
  WatchingUpdate['updatedSeries'][number];

export interface UserMenuWatchingUpdatesState {
  hasActualUpdates: boolean;
  totalUpdates: number;
  newEpisodeSeries: UserMenuWatchingUpdateSeries[];
  newEpisodesBySeriesKey: ReadonlyMap<string, number>;
}

function getSeriesLookupKey(source: string, id: string): string {
  return `${source}\u0000${id}`;
}

export function buildUserMenuWatchingUpdatesState(
  watchingUpdates: WatchingUpdate | null,
): UserMenuWatchingUpdatesState {
  const newEpisodeSeries =
    watchingUpdates?.updatedSeries.filter((series) => series.hasNewEpisode) ??
    [];
  const newEpisodesBySeriesKey = new Map<string, number>();

  newEpisodeSeries.forEach((series) => {
    newEpisodesBySeriesKey.set(
      getSeriesLookupKey(series.sourceKey, series.videoId),
      series.newEpisodes || 0,
    );
  });

  return {
    hasActualUpdates: Boolean(watchingUpdates?.updatedCount),
    newEpisodeSeries,
    newEpisodesBySeriesKey,
    totalUpdates: watchingUpdates?.updatedCount || 0,
  };
}

export function getUserMenuNewEpisodesCount(
  state: UserMenuWatchingUpdatesState,
  recordKey: string,
): number {
  const { source, id } = parseStorageKey(recordKey) || {
    id: '',
    source: '',
  };

  return state.newEpisodesBySeriesKey.get(getSeriesLookupKey(source, id)) || 0;
}
