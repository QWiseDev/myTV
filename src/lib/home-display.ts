import type { PlayRecord } from './types';

export const HOME_CONTINUE_WATCHING_LIMIT = 30;

export type HomePlayRecord = PlayRecord & { key: string };

export function isHomeRecordUnfinished(
  record: HomePlayRecord,
  latestTotalEpisodes?: number
): boolean {
  const totalEpisodes = Math.max(
    record.total_episodes || 0,
    latestTotalEpisodes || 0
  );

  if (totalEpisodes > 1 && record.index < totalEpisodes) {
    return true;
  }

  if (record.total_time <= 0) {
    return false;
  }

  return record.play_time < record.total_time;
}

export function sortHomeContinueWatchingRecords<T extends HomePlayRecord>(
  records: T[],
  latestTotalEpisodesByKey?: ReadonlyMap<string, number>
): T[] {
  return [...records].sort((left, right) => {
    const leftUnfinished = isHomeRecordUnfinished(
      left,
      latestTotalEpisodesByKey?.get(left.key)
    );
    const rightUnfinished = isHomeRecordUnfinished(
      right,
      latestTotalEpisodesByKey?.get(right.key)
    );

    if (leftUnfinished !== rightUnfinished) {
      return leftUnfinished ? -1 : 1;
    }

    return right.save_time - left.save_time;
  });
}

export function limitHomeRecords<T extends HomePlayRecord>(
  records: T[],
  limit = HOME_CONTINUE_WATCHING_LIMIT
): T[] {
  if (records.length <= limit) {
    return records;
  }

  return records.slice(0, limit);
}
