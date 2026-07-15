'use client';

import {
  generateStorageKey,
  getAllPlayRecords,
  parseStorageKey,
  PlayRecord,
} from './db.client';

// 缓存键
const WATCHING_UPDATES_CACHE_KEY = 'moontv_watching_updates';
const LAST_CHECK_TIME_KEY = 'moontv_last_update_check';
const ORIGINAL_EPISODES_CACHE_KEY = 'moontv_original_episodes'; // 新增：记录观看时的总集数
const CACHE_DURATION = 30 * 60 * 1000; // 30分钟缓存，与检查间隔保持一致
const SERVER_CACHE_DURATION = 3 * 60 * 60 * 1000; // 3小时缓存，与后端2小时定时任务对齐
const WATCHING_UPDATES_CONCURRENCY = 2; // 详情检查并发上限
const WATCHING_UPDATES_BATCH_PAUSE = 150; // 每批之间的间隔（毫秒）

// 内存缓存（用于非 localStorage 模式，避免 QuotaExceededError）
let memoryWatchingUpdatesCache: WatchingUpdatesCache | null = null;
let memoryLastCheckTime = 0;

// 🔧 新增：Sources API缓存，避免重复调用
let sourcesCache: { data: any; timestamp: number } | null = null;
const SOURCES_CACHE_DURATION = 5 * 60 * 1000; // 5分钟缓存

// 检测存储模式
const STORAGE_TYPE = (() => {
  if (typeof window === 'undefined') return 'localstorage';
  const raw = (window as any).RUNTIME_CONFIG?.STORAGE_TYPE || 'localstorage';
  return raw;
})();

// 事件名称
export const WATCHING_UPDATES_EVENT = 'watchingUpdatesChanged';

// 更新信息接口
export interface WatchingUpdate {
  hasUpdates: boolean;
  timestamp: number;
  updatedCount: number;
  continueWatchingCount: number; // 新增：需要继续观看的剧集数量
  updatedSeries: {
    title: string;
    source_name: string;
    year: string;
    douban_id?: number;
    cover: string; // 添加封面属性
    sourceKey: string; // 添加source key
    videoId: string; // 添加video id
    currentEpisode: number;
    totalEpisodes: number;
    hasNewEpisode: boolean;
    hasContinueWatching: boolean; // 新增：是否需要继续观看
    newEpisodes?: number;
    remainingEpisodes?: number; // 新增：剩余集数
    latestEpisodes?: number;
    remarks?: string; // 备注信息（如"已完结"）
  }[];
}

export interface WatchingUpdatesCache {
  hasUpdates: boolean;
  timestamp: number;
  updatedCount: number;
  continueWatchingCount: number;
  updatedSeries: WatchingUpdate['updatedSeries'];
}

type PlayRecordWithId = PlayRecord & { id: string };

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

const WATCHING_UPDATES_MAX_RECORDS = 24; // 常规检查最多处理最近24条记录

function dispatchWatchingUpdatesEvent(
  hasUpdates: boolean,
  updatedCount: number,
  invalidated = false,
): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(
    new CustomEvent(WATCHING_UPDATES_EVENT, {
      detail: { hasUpdates, invalidated, updatedCount },
    }),
  );
}

/**
 * 从后端获取已计算好的追更提醒缓存。
 * 数据库存储模式下，追更计算由后端定时任务负责，前端仅拉取缓存。
 */
export async function fetchWatchingUpdatesFromServer(
  forceRefresh = false,
): Promise<WatchingUpdate | null> {
  if (typeof window === 'undefined') {
    return null;
  }

  if (STORAGE_TYPE === 'localstorage') {
    return getDetailedWatchingUpdates();
  }

  try {
    const query = forceRefresh ? '?force=1' : '';
    const response = await fetch(`/api/watching-updates${query}`, {
      cache: 'no-store',
    });

    if (!response.ok) {
      return getDetailedWatchingUpdates();
    }

    const data = (await response.json()) as WatchingUpdate;
    if (!data || !Array.isArray(data.updatedSeries)) {
      return getDetailedWatchingUpdates();
    }

    cacheWatchingUpdates(data);
    memoryLastCheckTime = data.timestamp || Date.now();
    dispatchWatchingUpdatesEvent(
      Boolean(data.hasUpdates),
      data.updatedCount || 0,
    );

    return data;
  } catch (error) {
    console.error('从服务端获取追更提醒失败:', error);
    return getDetailedWatchingUpdates();
  }
}

/**
 * 检查追番更新
 * 真实API调用检查用户的播放记录，检测是否有新集数更新
 * @param forceRefresh 是否强制刷新，跳过缓存时间检查
 */
// 防抖控制：避免并发重复调用
let updateCheckPromise: Promise<void> | null = null;

export async function checkWatchingUpdates(
  forceRefresh = false,
): Promise<void> {
  if (STORAGE_TYPE !== 'localstorage') {
    await fetchWatchingUpdatesFromServer(forceRefresh);
    return;
  }

  if (!forceRefresh && updateCheckPromise) {
    return updateCheckPromise;
  }

  const runCheck = async () => {
    const currentTime = Date.now();

    if (!forceRefresh) {
      const lastCheckTime =
        STORAGE_TYPE !== 'localstorage'
          ? memoryLastCheckTime
          : parseInt(localStorage.getItem(LAST_CHECK_TIME_KEY) || '0');

      if (currentTime - lastCheckTime < CACHE_DURATION) {
        const cached = getDetailedWatchingUpdates();
        const hasCachedUpdates = Boolean(cached?.hasUpdates);
        dispatchWatchingUpdatesEvent(
          hasCachedUpdates,
          cached?.updatedCount || 0,
        );
        return;
      }
    }

    let sources: any[] | null = null;
    const sourceKeyMap = new Map<string, string>();

    try {
      if (
        sourcesCache?.data &&
        Date.now() - sourcesCache.timestamp < SOURCES_CACHE_DURATION
      ) {
        sources = sourcesCache.data;
      } else {
        const sourcesResponse = await fetch('/api/sources');
        if (sourcesResponse.ok) {
          sources = await sourcesResponse.json();
          sourcesCache = {
            data: sources,
            timestamp: Date.now(),
          };
        }
      }
    } catch (error) {
      console.warn('获取数据源列表失败:', error);
    }

    if (sources && Array.isArray(sources)) {
      for (const source of sources) {
        if (!source?.key) continue;

        sourceKeyMap.set(source.key, source.key);
        if (source.name) {
          sourceKeyMap.set(source.name, source.key);
        }
      }
    }

    const recordsObj = await getAllPlayRecords();
    const records = Object.entries(recordsObj).map(([key, record]) => ({
      ...record,
      id: key,
    })) as PlayRecordWithId[];

    if (records.length === 0) {
      const emptyResult: WatchingUpdate = {
        hasUpdates: false,
        timestamp: currentTime,
        updatedCount: 0,
        continueWatchingCount: 0,
        updatedSeries: [],
      };
      cacheWatchingUpdates(emptyResult);
      if (STORAGE_TYPE !== 'localstorage') {
        memoryLastCheckTime = currentTime;
      } else {
        localStorage.setItem(LAST_CHECK_TIME_KEY, currentTime.toString());
      }
      dispatchWatchingUpdatesEvent(false, 0);
      return;
    }

    const allCandidateRecords = records
      .filter((record) => record.total_episodes > 1)
      .sort((a, b) => (b.save_time ?? 0) - (a.save_time ?? 0));

    const candidateRecords =
      !forceRefresh && allCandidateRecords.length > WATCHING_UPDATES_MAX_RECORDS
        ? allCandidateRecords.slice(0, WATCHING_UPDATES_MAX_RECORDS)
        : allCandidateRecords;

    let hasAnyUpdates = false;
    let updatedCount = 0;
    let continueWatchingCount = 0;
    const updatedSeries: WatchingUpdate['updatedSeries'] = [];

    const handleSingleRecord = async (record: PlayRecordWithId) => {
      const parsedKey = parseStorageKey(record.id);
      if (!parsedKey) {
        console.warn(`跳过无效的播放记录键: ${record.id}`);
        return;
      }

      const sourceName = parsedKey.source;
      const videoId = parsedKey.id;

      try {
        const sourceKey = sourceKeyMap.get(sourceName) || sourceName;

        const updateInfo = await checkSingleRecordUpdate(
          record,
          videoId,
          sourceName,
          sourceKey,
        );

        const protectedTotalEpisodes = updateInfo.latestEpisodes;

        const seriesInfo = {
          title: record.title,
          source_name: record.source_name,
          year: record.year,
          douban_id: record.douban_id,
          cover: record.cover,
          sourceKey: sourceName,
          videoId: videoId,
          currentEpisode: record.index,
          totalEpisodes: protectedTotalEpisodes,
          hasNewEpisode: updateInfo.hasUpdate,
          hasContinueWatching: updateInfo.hasContinueWatching,
          newEpisodes: updateInfo.newEpisodes,
          remainingEpisodes: updateInfo.remainingEpisodes,
          latestEpisodes: updateInfo.latestEpisodes,
          remarks: record.remarks,
        };

        updatedSeries.push(seriesInfo);

        if (updateInfo.hasUpdate) {
          hasAnyUpdates = true;
          updatedCount++;
        }

        if (updateInfo.hasContinueWatching) {
          hasAnyUpdates = true;
          continueWatchingCount++;
        }
      } catch (error) {
        console.error(`检查 ${record.title} 更新失败:`, error);
        const seriesInfo = {
          title: record.title,
          source_name: record.source_name,
          year: record.year,
          douban_id: record.douban_id,
          cover: record.cover,
          sourceKey: sourceName,
          videoId: videoId,
          currentEpisode: record.index,
          totalEpisodes: record.total_episodes,
          hasNewEpisode: false,
          hasContinueWatching: false,
          newEpisodes: 0,
          remainingEpisodes: 0,
          latestEpisodes: record.total_episodes,
          remarks: record.remarks,
        };
        updatedSeries.push(seriesInfo);
      }
    };

    await runBatchedTasks(
      candidateRecords,
      WATCHING_UPDATES_CONCURRENCY,
      handleSingleRecord,
      WATCHING_UPDATES_BATCH_PAUSE,
    );

    updatedSeries.sort((a, b) => {
      if (a.hasNewEpisode !== b.hasNewEpisode) {
        return a.hasNewEpisode ? -1 : 1;
      }
      if (a.hasContinueWatching !== b.hasContinueWatching) {
        return a.hasContinueWatching ? -1 : 1;
      }
      return a.title.localeCompare(b.title, 'zh-CN');
    });

    const result: WatchingUpdate = {
      hasUpdates: hasAnyUpdates,
      timestamp: currentTime,
      updatedCount,
      continueWatchingCount,
      updatedSeries,
    };

    cacheWatchingUpdates(result);
    if (STORAGE_TYPE !== 'localstorage') {
      memoryLastCheckTime = currentTime;
    } else {
      localStorage.setItem(LAST_CHECK_TIME_KEY, currentTime.toString());
    }

    dispatchWatchingUpdatesEvent(hasAnyUpdates, updatedCount);
  };

  if (forceRefresh) {
    try {
      await runCheck();
    } catch (error) {
      console.error('检查追番更新失败:', error);
    }
    return;
  }

  updateCheckPromise = runCheck();

  try {
    await updateCheckPromise;
  } catch (error) {
    console.error('检查追番更新失败:', error);
  } finally {
    updateCheckPromise = null;
  }
}

/**
 * 检查单个剧集的更新状态（调用真实API）
 * @param sourceKey 预先映射好的数据源key（由上层函数传入）
 */
async function checkSingleRecordUpdate(
  record: PlayRecord,
  videoId: string,
  storageSourceName?: string,
  sourceKey?: string,
): Promise<{
  hasUpdate: boolean;
  hasContinueWatching: boolean;
  newEpisodes: number;
  remainingEpisodes: number;
  latestEpisodes: number;
}> {
  try {
    const finalSourceKey = sourceKey || record.source_name;
    const apiUrl = `/api/detail?source=${finalSourceKey}&id=${videoId}`;

    const response = await fetch(apiUrl);
    if (!response.ok) {
      return {
        hasUpdate: false,
        hasContinueWatching: false,
        newEpisodes: 0,
        remainingEpisodes: 0,
        latestEpisodes: record.total_episodes,
      };
    }

    const detailData = await response.json();
    const latestEpisodes = detailData.episodes ? detailData.episodes.length : 0;

    const recordKey = generateStorageKey(
      storageSourceName || record.source_name,
      videoId,
    );
    const originalTotalEpisodes = await getOriginalEpisodes(
      record,
      videoId,
      recordKey,
    );

    const hasUpdate = latestEpisodes > originalTotalEpisodes;
    const newEpisodes = hasUpdate ? latestEpisodes - originalTotalEpisodes : 0;

    const protectedTotalEpisodes = Math.max(
      latestEpisodes,
      originalTotalEpisodes,
      record.total_episodes,
    );

    const hasContinueWatching = record.index < protectedTotalEpisodes;
    const remainingEpisodes = hasContinueWatching
      ? protectedTotalEpisodes - record.index
      : 0;

    return {
      hasUpdate,
      hasContinueWatching,
      newEpisodes,
      remainingEpisodes,
      latestEpisodes: protectedTotalEpisodes,
    };
  } catch (error) {
    console.error(`检查${record.title}更新失败:`, error);
    return {
      hasUpdate: false,
      hasContinueWatching: false,
      newEpisodes: 0,
      remainingEpisodes: 0,
      latestEpisodes: record.total_episodes,
    };
  }
}

/**
 * 获取观看时的原始总集数，如果没有记录则使用当前播放记录中的集数
 * 关键修复：对于旧数据，同步修复original_episodes，避免被后续更新覆盖
 * 🔧 优化：避免重复调用 getAllPlayRecords，使用传入的记录作为优先数据源
 */
async function getOriginalEpisodes(
  record: PlayRecord,
  videoId: string,
  recordKey: string,
): Promise<number> {
  if (record.original_episodes && record.original_episodes > 0) {
    return record.original_episodes;
  }

  try {
    const { getAllPlayRecords } = await import('./db.client');
    const freshRecords = await getAllPlayRecords();
    const freshRecord = freshRecords[recordKey];

    if (freshRecord?.original_episodes && freshRecord.original_episodes > 0) {
      return freshRecord.original_episodes;
    }
  } catch {
    // 读取失败时继续使用当前播放记录中的集数。
  }

  if (record.original_episodes && record.original_episodes > 0) {
    return record.original_episodes;
  }

  if (
    (record.original_episodes === undefined ||
      record.original_episodes === null) &&
    record.total_episodes > 0
  ) {
    return record.total_episodes;
  }

  try {
    const storageKey = generateStorageKey(record.source_name, videoId);
    const cached = localStorage.getItem(ORIGINAL_EPISODES_CACHE_KEY);
    if (cached) {
      const data = JSON.parse(cached);
      if (data[storageKey] !== undefined) {
        return data[storageKey];
      }
    }
  } catch {
    // 本地缓存损坏时继续使用播放记录中的集数。
  }

  return record.total_episodes;
}

/**
 * 获取缓存的更新信息
 */
export function getCachedWatchingUpdates(): boolean {
  return Boolean(readWatchingUpdatesCache('读取更新缓存失败:')?.hasUpdates);
}

/**
 * 缓存更新信息
 */
function cacheWatchingUpdates(data: WatchingUpdate): void {
  try {
    const cacheData: WatchingUpdatesCache = {
      hasUpdates: data.hasUpdates,
      timestamp: data.timestamp,
      updatedCount: data.updatedCount,
      continueWatchingCount: data.continueWatchingCount,
      updatedSeries: data.updatedSeries,
    };

    if (STORAGE_TYPE !== 'localstorage') {
      memoryWatchingUpdatesCache = cacheData;
      memoryLastCheckTime = cacheData.timestamp;
      return;
    }

    localStorage.setItem(WATCHING_UPDATES_CACHE_KEY, JSON.stringify(cacheData));
  } catch (error) {
    console.error('缓存更新信息失败:', error);
  }
}

function getWatchingUpdatesCacheDuration(): number {
  return STORAGE_TYPE === 'localstorage'
    ? CACHE_DURATION
    : SERVER_CACHE_DURATION;
}

function isWatchingUpdatesCacheExpired(data: WatchingUpdatesCache): boolean {
  return Date.now() - data.timestamp > getWatchingUpdatesCacheDuration();
}

function readWatchingUpdatesCache(errorMessage: string): WatchingUpdatesCache | null {
  try {
    if (STORAGE_TYPE !== 'localstorage') {
      if (!memoryWatchingUpdatesCache) {
        return null;
      }

      return isWatchingUpdatesCacheExpired(memoryWatchingUpdatesCache)
        ? null
        : memoryWatchingUpdatesCache;
    }

    const cached = localStorage.getItem(WATCHING_UPDATES_CACHE_KEY);
    if (!cached) {
      return null;
    }

    const data: WatchingUpdatesCache = JSON.parse(cached);
    return isWatchingUpdatesCacheExpired(data) ? null : data;
  } catch (error) {
    console.error(errorMessage, error);
    return null;
  }
}

/**
 * 获取详细的更新信息
 */
export function getDetailedWatchingUpdates(): WatchingUpdate | null {
  const data = readWatchingUpdatesCache('读取详细更新信息失败:');

  if (data) {
    return {
      hasUpdates: data.hasUpdates,
      timestamp: data.timestamp,
      updatedCount: data.updatedCount,
      continueWatchingCount: data.continueWatchingCount,
      updatedSeries: data.updatedSeries,
    };
  }

  return null;
}

/**
 * 手动标记已查看更新
 */
export function markUpdatesAsViewed(): void {
  try {
    const data = getDetailedWatchingUpdates();
    if (data) {
      const updatedData: WatchingUpdate = {
        ...data,
        hasUpdates: false,
        updatedCount: 0,
        updatedSeries: data.updatedSeries.map((series) => ({
          ...series,
          hasNewEpisode: false,
        })),
      };
      cacheWatchingUpdates(updatedData);
      dispatchWatchingUpdatesEvent(false, 0);
    }
  } catch (error) {
    console.error('标记更新为已查看失败:', error);
  }
}

/**
 * 强制清除watching updates缓存（包括内存和localStorage）
 * 用于播放记录更新后立即清除缓存
 */
export function forceClearWatchingUpdatesCache(): void {
  try {
    memoryWatchingUpdatesCache = null;
    memoryLastCheckTime = 0;

    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(WATCHING_UPDATES_CACHE_KEY);
      localStorage.removeItem(LAST_CHECK_TIME_KEY);
    }

    dispatchWatchingUpdatesEvent(false, 0, true);
  } catch (error) {
    console.error('清除 watching-updates 缓存失败:', error);
  }
}

/**
 * 检查特定视频的更新状态（用于视频详情页面）
 */
export async function checkVideoUpdate(
  sourceName: string,
  videoId: string,
): Promise<void> {
  try {
    const recordsObj = await getAllPlayRecords();
    const storageKey = generateStorageKey(sourceName, videoId);
    const targetRecord = recordsObj[storageKey];

    if (!targetRecord) {
      return;
    }

    const updateInfo = await checkSingleRecordUpdate(
      targetRecord,
      videoId,
      sourceName,
      sourceName, // 🎯 传递 sourceName 作为 sourceKey
    );

    if (updateInfo.hasUpdate) {
      // 如果发现这个视频有更新，重新检查所有更新状态
      await checkWatchingUpdates();
    }
  } catch (error) {
    console.error('检查视频更新失败:', error);
  }
}

/**
 * 订阅新集数更新事件（来自Alpha版本）
 */
export function subscribeToWatchingUpdatesEvent(
  callback: (
    hasUpdates: boolean,
    updatedCount: number,
    invalidated: boolean,
  ) => void,
): () => void {
  if (typeof window === 'undefined') {
    return () => void 0;
  }

  const handleUpdate = (event: CustomEvent) => {
    const { hasUpdates, invalidated = false, updatedCount } = event.detail;
    callback(hasUpdates, updatedCount, invalidated);
  };

  window.addEventListener(
    WATCHING_UPDATES_EVENT,
    handleUpdate as EventListener,
  );

  return () => {
    window.removeEventListener(
      WATCHING_UPDATES_EVENT,
      handleUpdate as EventListener,
    );
  };
}
