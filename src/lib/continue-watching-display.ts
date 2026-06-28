import {
  type HomePlayRecord,
  sortHomeContinueWatchingRecords,
} from './home-display';
import { generateStorageKey, parseStorageKey } from './storage-key';
import type { PlayRecord } from './types';
import type { WatchingUpdatesCache } from './watching-updates';

type WatchingUpdateSeries = WatchingUpdatesCache['updatedSeries'][number];

export interface ContinueWatchingDisplayItem {
  record: HomePlayRecord;
  source: string;
  id: string;
  progress: number;
  newEpisodesCount: number;
  latestTotalEpisodes: number;
  showContinueWatchingBadge: boolean;
}

export interface ContinueWatchingDisplayState {
  records: HomePlayRecord[];
  displayItems: ContinueWatchingDisplayItem[];
  newEpisodeSeries: WatchingUpdateSeries[];
  continueWatchingSeries: WatchingUpdateSeries[];
}

function getProgress(record: PlayRecord): number {
  if (record.total_time <= 0) return 0;

  return Math.min(
    100,
    Math.round((record.play_time / record.total_time) * 100),
  );
}

function toHomeRecords(
  playRecords: Record<string, PlayRecord> | null,
): HomePlayRecord[] {
  return playRecords
    ? Object.entries(playRecords)
        .map(([key, record]) => ({
          ...record,
          key,
        }))
        .sort((a, b) => b.save_time - a.save_time)
    : [];
}

function buildWatchingUpdateIndexes(
  watchingUpdates?: WatchingUpdatesCache | null,
) {
  const updatedSeries = watchingUpdates?.updatedSeries || [];
  const seriesList = updatedSeries.filter((series) => Boolean(series.videoId));

  const watchingUpdatesMap = new Map<string, WatchingUpdateSeries>();
  const latestTotalEpisodesByKey = new Map<string, number>();
  const priorityByKey = new Map<string, number>();

  updatedSeries.forEach((series) => {
    const key = generateStorageKey(series.sourceKey, series.videoId);
    watchingUpdatesMap.set(key, series);
    if (series.hasNewEpisode) {
      priorityByKey.set(key, 0);
    } else if (series.hasContinueWatching) {
      priorityByKey.set(key, 1);
    }
    if (series.totalEpisodes > 0) {
      latestTotalEpisodesByKey.set(key, series.totalEpisodes);
    }
  });

  const newEpisodeSeries = seriesList.filter((series) => series.hasNewEpisode);
  const continueWatchingSeries = seriesList.filter(
    (series) => series.hasContinueWatching && !series.hasNewEpisode,
  );
  const continueWatchingMap = new Map<string, WatchingUpdateSeries>();

  continueWatchingSeries.forEach((series) => {
    continueWatchingMap.set(
      generateStorageKey(series.sourceKey, series.videoId),
      series,
    );
  });

  return {
    continueWatchingMap,
    continueWatchingSeries,
    latestTotalEpisodesByKey,
    newEpisodeSeries,
    priorityByKey,
    watchingUpdatesMap,
  };
}

export function buildContinueWatchingDisplayState(
  playRecords: Record<string, PlayRecord> | null,
  watchingUpdates?: WatchingUpdatesCache | null,
): ContinueWatchingDisplayState {
  const records = toHomeRecords(playRecords);
  const {
    continueWatchingMap,
    continueWatchingSeries,
    latestTotalEpisodesByKey,
    newEpisodeSeries,
    priorityByKey,
    watchingUpdatesMap,
  } = buildWatchingUpdateIndexes(watchingUpdates);

  const displayItems = sortHomeContinueWatchingRecords(
    records,
    latestTotalEpisodesByKey,
    priorityByKey,
  ).map((record) => {
    const { source, id } = parseStorageKey(record.key) || {
      id: '',
      source: '',
    };
    const key = generateStorageKey(source, id);
    const matchedSeries = watchingUpdatesMap.get(key);
    const latestTotalEpisodes =
      matchedSeries && matchedSeries.totalEpisodes
        ? matchedSeries.totalEpisodes
        : record.total_episodes;

    return {
      id,
      latestTotalEpisodes,
      newEpisodesCount: matchedSeries?.hasNewEpisode
        ? matchedSeries.newEpisodes || 0
        : 0,
      progress: getProgress(record),
      record,
      showContinueWatchingBadge: continueWatchingMap.has(key),
      source,
    };
  });

  return {
    continueWatchingSeries,
    displayItems,
    newEpisodeSeries,
    records,
  };
}
