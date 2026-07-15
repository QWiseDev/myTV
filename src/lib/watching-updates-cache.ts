import { db } from './db';
import { fetchVideoDetail } from './fetchVideoDetail';
import { parseStorageKey } from './storage-key';
import { SearchResult } from './types';
import { PlayRecord } from './types';

const WATCHING_UPDATES_CACHE_PREFIX = 'watching-updates:';
const WATCHING_UPDATES_CACHE_TTL_SECONDS = 3 * 60 * 60; // 3小时，覆盖2小时定时任务间隔
const WATCHING_UPDATES_CONCURRENCY = 2;
const WATCHING_UPDATES_BATCH_PAUSE = 150;

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
): Promise<CachedWatchingUpdate> {
  const records = Object.entries(playRecords)
    .filter(([, record]) => parsePositiveNumber(record.total_episodes) > 1)
    .sort((left, right) => {
      const leftSaveTime = parsePositiveNumber(left[1].save_time);
      const rightSaveTime = parsePositiveNumber(right[1].save_time);
      return rightSaveTime - leftSaveTime;
    });

  if (records.length === 0) {
    return {
      hasUpdates: false,
      timestamp,
      updatedCount: 0,
      continueWatchingCount: 0,
      updatedSeries: [],
    };
  }

  let updatedCount = 0;
  let continueWatchingCount = 0;
  const updatedSeries: CachedWatchingSeries[] = [];
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

  const resolveLatestEpisodes = async (
    source: string,
    id: string,
    fallbackTitle: string,
    fallbackEpisodes: number,
  ): Promise<number> => {
    const detail = await (detailResolver || defaultDetailResolver)(
      source,
      id,
      fallbackTitle,
    );
    const latestEpisodes = detail?.episodes?.length || 0;
    return latestEpisodes > 0 ? latestEpisodes : fallbackEpisodes;
  };

  const handleSingleRecord = async (
    entry: [string, PlayRecord],
  ): Promise<void> => {
    const [recordKey, record] = entry;
    const { source, id } = parseRecordKey(recordKey);

    const totalEpisodes = parsePositiveNumber(record.total_episodes);
    const originalEpisodes = normalizeOriginalEpisodes(record);
    const currentEpisode = Math.max(parsePositiveNumber(record.index), 0);

    const latestEpisodes = await resolveLatestEpisodes(
      source,
      id,
      record.title,
      totalEpisodes,
    );

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
      remarks: record.remarks,
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
    hasUpdates: updatedCount > 0 || continueWatchingCount > 0,
    timestamp,
    updatedCount,
    continueWatchingCount,
    updatedSeries,
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

      const updates = await buildWatchingUpdatesFromRecordsWithDetails(
        records,
        Date.now(),
        detailResolver,
      );
      if (generation !== getWatchingUpdatesCacheGeneration(username)) {
        continue;
      }

      await saveWatchingUpdatesForUser(username, updates);
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
