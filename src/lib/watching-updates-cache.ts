import { db } from './db';
import { fetchVideoDetail } from './fetchVideoDetail';
import { serializePlayRecordMutation } from './play-record-serialization';
import { generateStorageKey, parseStorageKey } from './storage-key';
import { SearchResult } from './types';
import { PlayRecord } from './types';

const WATCHING_UPDATES_CACHE_PREFIX = 'watching-updates:';
const WATCHING_UPDATES_CACHE_TTL_SECONDS = 3 * 60 * 60; // 3小时，覆盖2小时定时任务间隔
const WATCHING_UPDATES_CONCURRENCY = 2;
const WATCHING_UPDATES_BATCH_PAUSE = 150;
const WATCHING_UPDATES_REFRESH_THROTTLE_PREFIX = 'watching-updates:refresh:';
const WATCHING_UPDATES_REFRESH_THROTTLE_SECONDS = 30 * 60; // 首页主动刷新节流：同一用户 30 分钟一次

const watchingUpdatesCacheGenerations = new Map<string, number>();
const watchingUpdatesSavedGenerations = new Map<string, number>();
const watchingUpdatesRebuildPromises = new Map<
  string,
  Promise<CachedWatchingUpdate>
>();

export interface CachedWatchingSeries {
  title: string;
  source_name: string;
  year: string;
  douban_id?: number;
  cover: string;
  sourceKey: string;
  videoId: string;
  currentEpisode: number;
  totalEpisodes: number;
  hasNewEpisode: boolean;
  hasContinueWatching: boolean;
  newEpisodes: number;
  remainingEpisodes: number;
  latestEpisodes: number;
  remarks?: string;
}

export interface CachedWatchingUpdate {
  hasUpdates: boolean;
  timestamp: number;
  updatedCount: number;
  continueWatchingCount: number;
  updatedSeries: CachedWatchingSeries[];
}

export type VideoDetailResolver = (
  source: string,
  id: string,
  fallbackTitle: string,
) => Promise<SearchResult | null>;

// 备注完结判定：已完结 / 全40集 / 40集全 / 共40集。
// 刻意不匹配裸"完结"，避免"未完结"、"即将完结"误判。
const COMPLETED_REMARKS_PATTERN = /已完结|(?:全|共)\d+集|\d+集全/;

export function isCompletedRemarks(remarks?: string | null): boolean {
  if (!remarks) {
    return false;
  }
  return COMPLETED_REMARKS_PATTERN.test(remarks);
}

export interface WatchingUpdatesRecordPatch {
  source: string;
  id: string;
  // 回写基线：构建补丁时的记录 save_time，防止覆盖用户后来的进度保存
  baselineSaveTime: number;
  nextRecord: PlayRecord;
}

// 对齐旧 cron 的 applyDetailToPlayRecord：把详情带回的集数/备注/元数据回写记录
function buildRecordPatchFromDetail(
  record: PlayRecord,
  detail: SearchResult,
): PlayRecord | null {
  const episodeCount = detail.episodes?.length || 0;
  const remarksChanged =
    Boolean(detail.remarks) && detail.remarks !== record.remarks;
  const episodesChanged =
    episodeCount > 0 && episodeCount !== record.total_episodes;
  if (!episodesChanged && !remarksChanged) {
    return null;
  }

  return {
    ...record,
    title: detail.title || record.title,
    cover: detail.poster || record.cover,
    year: detail.year || record.year,
    douban_id: detail.douban_id || record.douban_id,
    total_episodes: episodesChanged ? episodeCount : record.total_episodes,
    remarks: detail.remarks || record.remarks,
  };
}

function getWatchingUpdatesCacheKey(username: string): string {
  return `${WATCHING_UPDATES_CACHE_PREFIX}${username}`;
}

function getWatchingUpdatesCacheGeneration(username: string): number {
  return watchingUpdatesCacheGenerations.get(username) || 0;
}

function parsePositiveNumber(value: unknown, fallback = 0): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return fallback;
  }
  return value > 0 ? value : fallback;
}

function parseRecordKey(recordKey: string): { source: string; id: string } {
  return parseStorageKey(recordKey) || { source: '', id: '' };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function runBatchedTasks<T>(
  items: T[],
  batchSize: number,
  worker: (item: T) => Promise<void>,
  pauseMs = 0,
): Promise<void> {
  if (items.length === 0) return;

  for (let startIndex = 0; startIndex < items.length; startIndex += batchSize) {
    const batch = items.slice(startIndex, startIndex + batchSize);
    await Promise.all(batch.map((item) => worker(item)));

    const hasNextBatch = startIndex + batchSize < items.length;
    if (hasNextBatch && pauseMs > 0) {
      await delay(pauseMs);
    }
  }
}

function normalizeOriginalEpisodes(record: PlayRecord): number {
  const totalEpisodes = parsePositiveNumber(record.total_episodes);
  const originalEpisodes = parsePositiveNumber(record.original_episodes);

  if (originalEpisodes === 0) {
    return totalEpisodes;
  }

  return Math.min(originalEpisodes, totalEpisodes);
}

function normalizeCachedWatchingUpdate(
  payload: unknown,
): CachedWatchingUpdate | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const data = payload as Partial<CachedWatchingUpdate>;
  if (!Array.isArray(data.updatedSeries)) {
    return null;
  }

  return {
    hasUpdates: Boolean(data.hasUpdates),
    timestamp: parsePositiveNumber(data.timestamp, Date.now()),
    updatedCount: parsePositiveNumber(data.updatedCount),
    continueWatchingCount: parsePositiveNumber(data.continueWatchingCount),
    updatedSeries: data.updatedSeries,
  };
}

export function buildWatchingUpdatesFromRecords(
  playRecords: Record<string, PlayRecord>,
  timestamp = Date.now(),
): CachedWatchingUpdate {
  let updatedCount = 0;
  let continueWatchingCount = 0;
  const updatedSeries: CachedWatchingSeries[] = [];

  for (const [recordKey, record] of Object.entries(playRecords)) {
    const totalEpisodes = parsePositiveNumber(record.total_episodes);
    if (totalEpisodes <= 1) {
      continue;
    }

    const { source, id } = parseRecordKey(recordKey);
    const originalEpisodes = normalizeOriginalEpisodes(record);
    const currentEpisode = Math.max(parsePositiveNumber(record.index), 0);
    const hasNewEpisode = totalEpisodes > originalEpisodes;
    const hasContinueWatching = currentEpisode < totalEpisodes;

    if (hasNewEpisode) {
      updatedCount += 1;
    }

    if (hasContinueWatching) {
      continueWatchingCount += 1;
    }

    updatedSeries.push({
      title: record.title || '未命名剧集',
      source_name: record.source_name || source,
      year: record.year || '',
      douban_id: record.douban_id,
      cover: record.cover || '',
      sourceKey: source,
      videoId: id,
      currentEpisode,
      totalEpisodes,
      hasNewEpisode,
      hasContinueWatching,
      newEpisodes: hasNewEpisode ? totalEpisodes - originalEpisodes : 0,
      remainingEpisodes: hasContinueWatching
        ? totalEpisodes - currentEpisode
        : 0,
      latestEpisodes: totalEpisodes,
      remarks: record.remarks,
    });
  }

  updatedSeries.sort((left, right) => {
    if (left.hasNewEpisode !== right.hasNewEpisode) {
      return left.hasNewEpisode ? -1 : 1;
    }

    if (left.hasContinueWatching !== right.hasContinueWatching) {
      return left.hasContinueWatching ? -1 : 1;
    }

    return left.title.localeCompare(right.title, 'zh-CN');
  });

  return {
    hasUpdates: updatedCount > 0 || continueWatchingCount > 0,
    timestamp,
    updatedCount,
    continueWatchingCount,
    updatedSeries,
  };
}

export async function buildWatchingUpdatesFromRecordsWithDetails(
  playRecords: Record<string, PlayRecord>,
  timestamp = Date.now(),
  detailResolver?: VideoDetailResolver,
): Promise<{
  updates: CachedWatchingUpdate;
  recordPatches: WatchingUpdatesRecordPatch[];
}> {
  const records = Object.entries(playRecords)
    .filter(([, record]) => parsePositiveNumber(record.total_episodes) > 1)
    .sort((left, right) => {
      const leftSaveTime = parsePositiveNumber(left[1].save_time);
      const rightSaveTime = parsePositiveNumber(right[1].save_time);
      return rightSaveTime - leftSaveTime;
    });

  if (records.length === 0) {
    return {
      updates: {
        hasUpdates: false,
        timestamp,
        updatedCount: 0,
        continueWatchingCount: 0,
        updatedSeries: [],
      },
      recordPatches: [],
    };
  }

  let updatedCount = 0;
  let continueWatchingCount = 0;
  const updatedSeries: CachedWatchingSeries[] = [];
  const recordPatches: WatchingUpdatesRecordPatch[] = [];
  const detailCache = new Map<string, Promise<SearchResult | null>>();

  const defaultDetailResolver: VideoDetailResolver = async (
    source: string,
    id: string,
    fallbackTitle: string,
  ) => {
    const cacheKey = `${source}+${id}`;
    let detailPromise = detailCache.get(cacheKey);

    if (!detailPromise) {
      detailPromise = fetchVideoDetail({
        source,
        id,
        fallbackTitle,
      })
        .then((detail) => detail)
        .catch((error) => {
          console.error(`获取视频详情失败 (${cacheKey}):`, error);
          return null;
        });

      detailCache.set(cacheKey, detailPromise);
    }

    return detailPromise;
  };

  const resolveLatestDetail = async (
    source: string,
    id: string,
    fallbackTitle: string,
  ): Promise<SearchResult | null> => {
    return (detailResolver || defaultDetailResolver)(source, id, fallbackTitle);
  };

  const handleSingleRecord = async (
    entry: [string, PlayRecord],
  ): Promise<void> => {
    const [recordKey, record] = entry;
    const { source, id } = parseRecordKey(recordKey);

    const totalEpisodes = parsePositiveNumber(record.total_episodes);
    const originalEpisodes = normalizeOriginalEpisodes(record);
    const currentEpisode = Math.max(parsePositiveNumber(record.index), 0);

    // 备注表明已完结的剧集不会再更新，直接信任记录数据，避免为完结剧打源站
    const detail = isCompletedRemarks(record.remarks)
      ? null
      : await resolveLatestDetail(source, id, record.title);
    const fetchedEpisodes = detail?.episodes?.length || 0;
    const latestEpisodes =
      fetchedEpisodes > 0 ? fetchedEpisodes : totalEpisodes;

    const recordPatch = detail
      ? buildRecordPatchFromDetail(record, detail)
      : null;
    if (recordPatch) {
      recordPatches.push({
        source,
        id,
        baselineSaveTime: record.save_time,
        nextRecord: recordPatch,
      });
    }

    const protectedTotalEpisodes = Math.max(
      latestEpisodes,
      originalEpisodes,
      totalEpisodes,
    );

    const hasNewEpisode = protectedTotalEpisodes > originalEpisodes;
    const hasContinueWatching = currentEpisode < protectedTotalEpisodes;

    if (hasNewEpisode) {
      updatedCount += 1;
    }

    if (hasContinueWatching) {
      continueWatchingCount += 1;
    }

    updatedSeries.push({
      title: record.title || '未命名剧集',
      source_name: record.source_name || source,
      year: record.year || '',
      douban_id: record.douban_id,
      cover: record.cover || '',
      sourceKey: source,
      videoId: id,
      currentEpisode,
      totalEpisodes: protectedTotalEpisodes,
      hasNewEpisode,
      hasContinueWatching,
      newEpisodes: hasNewEpisode
        ? protectedTotalEpisodes - originalEpisodes
        : 0,
      remainingEpisodes: hasContinueWatching
        ? protectedTotalEpisodes - currentEpisode
        : 0,
      latestEpisodes: protectedTotalEpisodes,
      remarks: detail?.remarks || record.remarks,
    });
  };

  await runBatchedTasks(
    records,
    WATCHING_UPDATES_CONCURRENCY,
    handleSingleRecord,
    WATCHING_UPDATES_BATCH_PAUSE,
  );

  updatedSeries.sort((left, right) => {
    if (left.hasNewEpisode !== right.hasNewEpisode) {
      return left.hasNewEpisode ? -1 : 1;
    }

    if (left.hasContinueWatching !== right.hasContinueWatching) {
      return left.hasContinueWatching ? -1 : 1;
    }

    return left.title.localeCompare(right.title, 'zh-CN');
  });

  return {
    updates: {
      hasUpdates: updatedCount > 0 || continueWatchingCount > 0,
      timestamp,
      updatedCount,
      continueWatchingCount,
      updatedSeries,
    },
    recordPatches,
  };
}

export async function getCachedWatchingUpdatesForUser(
  username: string,
): Promise<CachedWatchingUpdate | null> {
  const currentGeneration = getWatchingUpdatesCacheGeneration(username);
  const savedGeneration = watchingUpdatesSavedGenerations.get(username) || 0;
  if (currentGeneration !== savedGeneration) {
    return null;
  }

  const cacheKey = getWatchingUpdatesCacheKey(username);
  const cached = await db.getCache(cacheKey);
  return normalizeCachedWatchingUpdate(cached);
}

export async function invalidateWatchingUpdatesForUser(
  username: string,
): Promise<void> {
  watchingUpdatesCacheGenerations.set(
    username,
    getWatchingUpdatesCacheGeneration(username) + 1,
  );
  await db.deleteCache(getWatchingUpdatesCacheKey(username));
}

function getWatchingUpdatesRefreshThrottleKey(username: string): string {
  return `${WATCHING_UPDATES_REFRESH_THROTTLE_PREFIX}${username}`;
}

/**
 * 主动刷新节流：同一用户 30 分钟内只放行一次重建。
 * 节流键带 TTL 自动过期；缓存缺失触发的重建不经过此闸门。
 */
export async function tryAcquireWatchingUpdatesRefreshSlot(
  username: string,
): Promise<boolean> {
  const throttleKey = getWatchingUpdatesRefreshThrottleKey(username);
  const lastRefreshAt = await db.getCache(throttleKey);
  if (lastRefreshAt) {
    return false;
  }

  await db.setCache(
    throttleKey,
    Date.now(),
    WATCHING_UPDATES_REFRESH_THROTTLE_SECONDS,
  );
  return true;
}

/** 释放刷新节流槽位（重建失败时调用，让下次请求可以重试）。 */
export function releaseWatchingUpdatesRefreshSlot(
  username: string,
): Promise<void> {
  return db.deleteCache(getWatchingUpdatesRefreshThrottleKey(username));
}

/**
 * 把重建期间从源站拿到的最新集数/备注回写到播放记录（承接原 cron 的记录刷新职责）。
 * 属于衍生数据同步：追更缓存已包含同一份源站快照，因此这里刻意不触发缓存失效。
 * 基线守卫：记录在回写前被用户更新过（save_time 变化）则放弃，避免覆盖用户进度。
 */
export async function applyWatchingUpdatesRecordPatches(
  username: string,
  recordPatches: WatchingUpdatesRecordPatch[],
): Promise<void> {
  if (recordPatches.length === 0) {
    return;
  }

  for (const { source, id, baselineSaveTime, nextRecord } of recordPatches) {
    await serializePlayRecordMutation(username, async () => {
      const key = generateStorageKey(source, id);
      const allRecords = await db.getAllPlayRecords(username);
      const currentRecord = allRecords[key];
      if (!currentRecord || currentRecord.save_time !== baselineSaveTime) {
        return;
      }

      const isAlreadySynced =
        currentRecord.total_episodes === nextRecord.total_episodes &&
        currentRecord.remarks === nextRecord.remarks &&
        currentRecord.title === nextRecord.title &&
        currentRecord.cover === nextRecord.cover &&
        currentRecord.year === nextRecord.year &&
        (currentRecord.douban_id ?? undefined) ===
          (nextRecord.douban_id ?? undefined);
      if (isAlreadySynced) {
        return;
      }

      await db.savePlayRecord(username, source, id, nextRecord);
    });
  }
}

async function saveWatchingUpdatesForUser(
  username: string,
  updates: CachedWatchingUpdate,
): Promise<void> {
  const generation = getWatchingUpdatesCacheGeneration(username);
  const cacheKey = getWatchingUpdatesCacheKey(username);
  await db.setCache(cacheKey, updates, WATCHING_UPDATES_CACHE_TTL_SECONDS);

  if (generation !== getWatchingUpdatesCacheGeneration(username)) {
    await db.deleteCache(cacheKey);
    return;
  }

  watchingUpdatesSavedGenerations.set(username, generation);
}

export async function rebuildWatchingUpdatesForUser(
  username: string,
  detailResolver?: VideoDetailResolver,
): Promise<CachedWatchingUpdate> {
  const existingRebuild = watchingUpdatesRebuildPromises.get(username);
  if (existingRebuild) {
    return existingRebuild;
  }

  const rebuildPromise = (async () => {
    for (;;) {
      const generation = getWatchingUpdatesCacheGeneration(username);
      const records = await db.getAllPlayRecords(username);

      if (generation !== getWatchingUpdatesCacheGeneration(username)) {
        continue;
      }

      const { updates, recordPatches } =
        await buildWatchingUpdatesFromRecordsWithDetails(
          records,
          Date.now(),
          detailResolver,
        );
      if (generation !== getWatchingUpdatesCacheGeneration(username)) {
        continue;
      }

      await saveWatchingUpdatesForUser(username, updates);
      await applyWatchingUpdatesRecordPatches(username, recordPatches);
      if (generation === getWatchingUpdatesCacheGeneration(username)) {
        return updates;
      }
    }
  })();
  watchingUpdatesRebuildPromises.set(username, rebuildPromise);

  try {
    return await rebuildPromise;
  } finally {
    if (watchingUpdatesRebuildPromises.get(username) === rebuildPromise) {
      watchingUpdatesRebuildPromises.delete(username);
    }
  }
}
