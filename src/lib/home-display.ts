import type { PlayRecord } from './types';

export type HomePlayRecord = PlayRecord & { key: string };

/** 单集或电影播放进度达到 95% 视为本集/本片已看完（覆盖片尾字幕退出的常见场景） */
export const HOME_RECORD_FINISHED_PROGRESS_RATIO = 0.95;

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

  if (record.play_time <= 0) {
    return false;
  }

  return (
    record.play_time / record.total_time < HOME_RECORD_FINISHED_PROGRESS_RATIO
  );
}

/**
 * 首页继续观看公平排序规则：
 * 1. 有新集更新提醒（priority = 0）优先置顶；
 * 2. 所有「未看完」记录（电影与多集剧平等同权）按最近观看时间 save_time 降序排列，
 *    避免几个月前的未看完旧剧把刚看到一半的电影或大结局挤到后排；
 * 3. 已看完记录沉底，内部仍按 save_time 降序排列。
 */
export function sortHomeContinueWatchingRecords<T extends HomePlayRecord>(
  records: T[],
  latestTotalEpisodesByKey?: ReadonlyMap<string, number>,
  priorityByKey?: ReadonlyMap<string, number>,
): T[] {
  return [...records].sort((left, right) => {
    const leftHasNewEpisode = priorityByKey?.get(left.key) === 0;
    const rightHasNewEpisode = priorityByKey?.get(right.key) === 0;
    if (leftHasNewEpisode !== rightHasNewEpisode) {
      return leftHasNewEpisode ? -1 : 1;
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

    return (right.save_time || 0) - (left.save_time || 0);
  });
}
