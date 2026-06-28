import type { PlayRecord } from './types';

export type HomePlayRecord = PlayRecord & { key: string };

export function isHomeRecordUnfinished(
  record: HomePlayRecord,
  latestTotalEpisodes?: number,
): boolean {
  const totalEpisodes = Math.max(
    record.total_episodes || 0,
    latestTotalEpisodes || 0,
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
  latestTotalEpisodesByKey?: ReadonlyMap<string, number>,
  priorityByKey?: ReadonlyMap<string, number>,
): T[] {
  return [...records].sort((left, right) => {
    const leftPriority = priorityByKey?.get(left.key) ?? 2;
    const rightPriority = priorityByKey?.get(right.key) ?? 2;
    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }

    const leftUnfinished = isHomeRecordUnfinished(
      left,
      latestTotalEpisodesByKey?.get(left.key),
    );
    const rightUnfinished = isHomeRecordUnfinished(
      right,
      latestTotalEpisodesByKey?.get(right.key),
    );

    if (leftUnfinished !== rightUnfinished) {
      return leftUnfinished ? -1 : 1;
    }

    return right.save_time - left.save_time;
  });
}
