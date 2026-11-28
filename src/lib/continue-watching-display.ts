import {
  type HomePlayRecord,
  isHomeRecordUnfinished,
  sortHomeContinueWatchingRecords,
} from './home-display';
import { generateStorageKey, parseStorageKey } from './storage-key';
import type { PlayRecord } from './types';
import { buildPlayUrl } from './video-card-utils';
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
  isUnfinished: boolean;
  isFinished: boolean;
  remainingSeconds: number;
  remainingTimeLabel: string | null;
  progressText: string;
  episodeBadgeText: string | null;
  playHref: string;
}

export interface ContinueWatchingDisplayState {
  records: HomePlayRecord[];
  displayItems: ContinueWatchingDisplayItem[];
  newEpisodeSeries: WatchingUpdateSeries[];
  continueWatchingSeries: WatchingUpdateSeries[];
  /** 基于当前已加载且未删除列表实时派生的计数，删除卡片后零延迟同步 */
  newEpisodeItemCount: number;
  unfinishedItemCount: number;
}

export interface HeroContinueDisplayItem {
  key: string;
  title: string;
  poster: string;
  year?: string;
  episodeLabel?: string;
  href: string;
}

function getProgress(record: PlayRecord): number {
  if (record.total_time <= 0) return 0;

  return Math.min(
    100,
    Math.max(0, Math.round((record.play_time / record.total_time) * 100)),
  );
}

export function formatRemainingWatchTime(remainingSeconds: number): string {
  if (remainingSeconds <= 0) return '';
  const totalMinutes = Math.ceil(remainingSeconds / 60);
  if (totalMinutes <= 1) {
    return '剩余不足 1 分钟';
  }
  if (totalMinutes < 60) {
    return `剩余 ${totalMinutes} 分钟`;
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes > 0
    ? `剩余 ${hours} 小时 ${minutes} 分`
    : `剩余 ${hours} 小时`;
}

function buildProgressText({
  record,
  progress,
  latestTotalEpisodes,
  newEpisodesCount,
  isUnfinished,
  remainingTimeLabel,
}: {
  record: PlayRecord;
  progress: number;
  latestTotalEpisodes: number;
  newEpisodesCount: number;
  isUnfinished: boolean;
  remainingTimeLabel: string | null;
}): string {
  const isMultiEpisode = latestTotalEpisodes > 1;

  if (isMultiEpisode) {
    const epPrefix = `第 ${record.index} 集`;
    if (remainingTimeLabel && progress > 0 && progress < 95) {
      return `${epPrefix} · ${remainingTimeLabel}`;
    }
    if (newEpisodesCount > 0) {
      return `${epPrefix} · 更新至 ${latestTotalEpisodes} 集`;
    }
    if (isUnfinished && record.index < latestTotalEpisodes) {
      return `看到${epPrefix} · 共 ${latestTotalEpisodes} 集`;
    }
    return isUnfinished
      ? `${epPrefix} · 已看 ${progress}%`
      : `已看完 · 共 ${latestTotalEpisodes} 集`;
  }

  if (!isUnfinished) {
    return progress > 0 ? '已看完' : '待观看';
  }

  if (remainingTimeLabel) {
    return `已看 ${progress}% · ${remainingTimeLabel}`;
  }

  return progress > 0 ? `已看 ${progress}%` : '继续播放';
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
        .sort((a, b) => (b.save_time || 0) - (a.save_time || 0))
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
    const newEpisodesCount = matchedSeries?.hasNewEpisode
      ? matchedSeries.newEpisodes || 0
      : 0;
    const progress = getProgress(record);
    const isUnfinished = isHomeRecordUnfinished(record, latestTotalEpisodes);
    const remainingSeconds =
      record.total_time > 0 && record.play_time < record.total_time
        ? Math.max(0, record.total_time - record.play_time)
        : 0;
    const remainingTimeLabel =
      isUnfinished && progress > 0 && progress < 95 && remainingSeconds > 0
        ? formatRemainingWatchTime(remainingSeconds)
        : null;
    const title = record.title || record.search_title || '';
    const playHref =
      source && id
        ? buildPlayUrl({
            from: 'playrecord',
            source,
            id,
            title,
            year: record.year,
            doubanId: record.douban_id,
            query: record.search_title,
          })
        : '';

    return {
      id,
      latestTotalEpisodes,
      newEpisodesCount,
      progress,
      record,
      showContinueWatchingBadge:
        newEpisodesCount === 0 &&
        (continueWatchingMap.has(key) || isUnfinished),
      source,
      isUnfinished,
      isFinished: !isUnfinished && newEpisodesCount === 0,
      remainingSeconds,
      remainingTimeLabel,
      progressText: buildProgressText({
        record,
        progress,
        latestTotalEpisodes,
        newEpisodesCount,
        isUnfinished,
        remainingTimeLabel,
      }),
      episodeBadgeText:
        latestTotalEpisodes > 1
          ? `第 ${record.index}/${latestTotalEpisodes} 集`
          : record.year || null,
      playHref,
    };
  });

  const newEpisodeItemCount = displayItems.filter(
    (item) => item.newEpisodesCount > 0,
  ).length;
  const unfinishedItemCount = displayItems.filter(
    (item) => item.isUnfinished || item.newEpisodesCount > 0,
  ).length;

  return {
    continueWatchingSeries,
    displayItems,
    newEpisodeSeries,
    records,
    newEpisodeItemCount,
    unfinishedItemCount,
  };
}

/**
 * 首屏 HeroCarousel 继续追帧派生：
 * - 统一过滤已彻底看完且无新集更新的记录，避免 100% 看完的影片占据首屏「继续播放」；
 * - 同步使用追更后的最新总集数与剩余时间摘要，并按标题去重。
 */
export function buildHeroContinueItems(
  playRecords: Record<string, PlayRecord> | null,
  watchingUpdates: WatchingUpdatesCache | null | undefined,
  limit: number,
): HeroContinueDisplayItem[] {
  if (!playRecords || limit <= 0) {
    return [];
  }

  const { displayItems } = buildContinueWatchingDisplayState(
    playRecords,
    watchingUpdates,
  );
  const items: HeroContinueDisplayItem[] = [];
  const seenTitles = new Set<string>();

  for (const item of displayItems) {
    if (items.length >= limit) break;
    if (item.isFinished) continue;

    const title = item.record.title?.trim();
    if (!title || !item.record.cover || !item.playHref) continue;
    if (seenTitles.has(title)) continue;

    seenTitles.add(title);
    items.push({
      key: item.record.key,
      title: item.record.title,
      poster: item.record.cover,
      year: item.record.year,
      episodeLabel:
        item.newEpisodesCount > 0
          ? `第 ${item.record.index} 集 · 更新至 ${item.latestTotalEpisodes} 集 (+${item.newEpisodesCount})`
          : item.latestTotalEpisodes > 1
            ? `看到第 ${item.record.index} 集 / 共 ${item.latestTotalEpisodes} 集`
            : item.remainingTimeLabel
              ? `已看 ${item.progress}% · ${item.remainingTimeLabel}`
              : undefined,
      href: item.playHref,
    });
  }

  return items;
}
