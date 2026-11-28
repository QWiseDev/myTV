import type { PlayRecord } from './types';

/**
 * 检查是否应该更新原始集数（original_episodes 记录“用户上次知道的总集数”）：
 * 当用户观看了超出原始集数的新集数且进度有效时，推进 original_episodes 以消费本次追更提醒。
 */
export function checkShouldUpdateOriginalEpisodes(
  existingRecord: PlayRecord,
  newRecord: PlayRecord,
): boolean {
  const originalEpisodes =
    existingRecord.original_episodes || existingRecord.total_episodes;

  const hasWatchedBeyondOriginal = newRecord.index > originalEpisodes;
  const hasMoreEpisodes = newRecord.total_episodes > originalEpisodes;
  const hasSignificantProgress = newRecord.play_time > 60;
  const episodeIncrement = newRecord.total_episodes - originalEpisodes;
  const reasonableIncrement = episodeIncrement > 0 && episodeIncrement <= 100;
  const watchedNewEpisodes = newRecord.index >= originalEpisodes + 1;
  const progressMatches = newRecord.index <= newRecord.total_episodes;

  return (
    hasWatchedBeyondOriginal &&
    hasMoreEpisodes &&
    hasSignificantProgress &&
    reasonableIncrement &&
    watchedNewEpisodes &&
    progressMatches
  );
}

/**
 * 计算保存播放记录时应写入的 original_episodes（供常规保存与退出页面 sendBeacon 共用）。
 */
export function resolvePlayRecordOriginalEpisodes(
  existingRecord: PlayRecord | undefined,
  record: PlayRecord,
): number | undefined {
  if (!existingRecord && record.total_episodes > 1) {
    return record.total_episodes;
  }
  if (
    existingRecord &&
    !existingRecord.original_episodes &&
    record.total_episodes > 1
  ) {
    return record.total_episodes;
  }
  if (existingRecord?.original_episodes) {
    return checkShouldUpdateOriginalEpisodes(existingRecord, record)
      ? record.total_episodes
      : existingRecord.original_episodes;
  }
  return record.original_episodes;
}
