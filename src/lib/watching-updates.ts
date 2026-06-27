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

// 全局事件监听器
const updateListeners = new Set<(hasUpdates: boolean) => void>();

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
const WATCHING_UPDATES_DEBUG =
  process.env.NODE_ENV !== 'production' &&
  process.env.NEXT_PUBLIC_DEBUG_WATCHING_UPDATES === 'true';

function debugLog(..._args: unknown[]): void {
  if (!WATCHING_UPDATES_DEBUG) return;
}

function dispatchWatchingUpdatesEvent(
  hasUpdates: boolean,
  updatedCount: number,
): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(
    new CustomEvent(WATCHING_UPDATES_EVENT, {
      detail: { hasUpdates, updatedCount },
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
      debugLog('从服务端获取追更提醒失败:', response.status);
      return getDetailedWatchingUpdates();
    }

    const data = (await response.json()) as WatchingUpdate;
    if (!data || !Array.isArray(data.updatedSeries)) {
      return getDetailedWatchingUpdates();
    }

    cacheWatchingUpdates(data);
    memoryLastCheckTime = data.timestamp || Date.now();
    notifyListeners(Boolean(data.hasUpdates));
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

// 🚀 新增：全局检查状态，防止首次加载时多个组件同时触发检查
let globalCheckInProgress = false;

export async function checkWatchingUpdates(
  forceRefresh = false,
): Promise<void> {
  if (STORAGE_TYPE !== 'localstorage') {
    await fetchWatchingUpdatesFromServer(forceRefresh);
    return;
  }

  if (!forceRefresh && globalCheckInProgress) {
    debugLog('全局检查正在进行中，等待完成...');
    return updateCheckPromise || Promise.resolve();
  }

  if (!forceRefresh && updateCheckPromise) {
    debugLog('检查正在进行中，返回现有Promise...');
    return updateCheckPromise;
  }

  const runCheck = async () => {
    const currentTime = Date.now();
    debugLog('开始检查追番更新...', forceRefresh ? '(强制刷新)' : '');

    if (!forceRefresh) {
      const lastCheckTime =
        STORAGE_TYPE !== 'localstorage'
          ? memoryLastCheckTime
          : parseInt(localStorage.getItem(LAST_CHECK_TIME_KEY) || '0');

      if (currentTime - lastCheckTime < CACHE_DURATION) {
        debugLog('距离上次检查时间太短（不足30分钟），使用缓存结果');
        const cached = getCachedWatchingUpdates();
        notifyListeners(cached);
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
        debugLog('使用已缓存的数据源列表');
      } else {
        const sourcesResponse = await fetch('/api/sources');
        if (sourcesResponse.ok) {
          sources = await sourcesResponse.json();
          sourcesCache = {
            data: sources,
            timestamp: Date.now(),
          };
          debugLog(
            `数据源列表已缓存，有效期${SOURCES_CACHE_DURATION / 1000}秒`,
          );
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
      notifyListeners(false);
      return;
    }

    const allCandidateRecords = records
      .filter((record) => record.total_episodes > 1)
      .sort((a, b) => (b.save_time ?? 0) - (a.save_time ?? 0));

    const candidateRecords =
      !forceRefresh && allCandidateRecords.length > WATCHING_UPDATES_MAX_RECORDS
        ? allCandidateRecords.slice(0, WATCHING_UPDATES_MAX_RECORDS)
        : allCandidateRecords;

    debugLog(
      `找到 ${allCandidateRecords.length} 个可能有更新的剧集，本次检查 ${candidateRecords.length} 个`,
    );

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

        debugLog(
          `${record.title} 检查结果: hasUpdate=${updateInfo.hasUpdate}, hasContinueWatching=${updateInfo.hasContinueWatching}`,
        );
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

    if (!forceRefresh && candidateRecords.length < allCandidateRecords.length) {
      debugLog(
        `本次跳过 ${allCandidateRecords.length - candidateRecords.length} 条较早记录，降低首页阶段详情请求压力`,
      );
    }

    updatedSeries.sort((a, b) => {
      if (a.hasNewEpisode !== b.hasNewEpisode) {
        return a.hasNewEpisode ? -1 : 1;
      }
      if (a.hasContinueWatching !== b.hasContinueWatching) {
        return a.hasContinueWatching ? -1 : 1;
      }
      return a.title.localeCompare(b.title, 'zh-CN');
    });

    debugLog(
      `检查完成: ${
        hasAnyUpdates
          ? `发现${updatedCount}部剧集有新集数更新，${continueWatchingCount}部剧集需要继续观看`
          : '暂无更新'
      }`,
    );

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

    notifyListeners(hasAnyUpdates);
    dispatchWatchingUpdatesEvent(hasAnyUpdates, updatedCount);
  };

  if (forceRefresh) {
    try {
      await runCheck();
    } catch (error) {
      console.error('检查追番更新失败:', error);
      notifyListeners(false);
    }
    return;
  }

  globalCheckInProgress = true;
  updateCheckPromise = runCheck();

  try {
    await updateCheckPromise;
  } catch (error) {
    console.error('检查追番更新失败:', error);
    notifyListeners(false);
  } finally {
    updateCheckPromise = null;
    globalCheckInProgress = false;
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

    debugLog(`${record.title} 调用API获取最新详情:`, apiUrl);

    const response = await fetch(apiUrl);
    if (!response.ok) {
      debugLog(`获取${record.title}详情失败: ${response.status}`);
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

    if (latestEpisodes < originalTotalEpisodes) {
      debugLog(
        `${record.title} API返回集数(${latestEpisodes})少于原始记录(${originalTotalEpisodes})，按保护逻辑使用较大集数`,
      );
    }

    if (hasUpdate) {
      debugLog(
        `${record.title} 发现新集数: ${originalTotalEpisodes} -> ${latestEpisodes} 集，新增${newEpisodes}集`,
      );
    }

    if (hasContinueWatching) {
      debugLog(
        `${record.title} 继续观看提醒: 当前第${record.index}集，共${protectedTotalEpisodes}集，还有${remainingEpisodes}集未看`,
      );
    }

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
  } catch (error) {
    debugLog(`从数据库读取原始集数失败: ${record.title}`, error);
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
  } catch (error) {
    debugLog('从localStorage读取原始集数失败:', error);
  }

  return record.total_episodes;
}

/**
 * 获取缓存的更新信息
 */
export function getCachedWatchingUpdates(): boolean {
  try {
    const cacheDuration =
      STORAGE_TYPE === 'localstorage' ? CACHE_DURATION : SERVER_CACHE_DURATION;

    // 🔧 优化：非 localStorage 模式使用内存缓存
    if (STORAGE_TYPE !== 'localstorage') {
      if (!memoryWatchingUpdatesCache) return false;
      const isExpired =
        Date.now() - memoryWatchingUpdatesCache.timestamp > cacheDuration;
      return isExpired ? false : memoryWatchingUpdatesCache.hasUpdates;
    }

    // localStorage 模式
    const cached = localStorage.getItem(WATCHING_UPDATES_CACHE_KEY);
    if (!cached) return false;

    const data: WatchingUpdatesCache = JSON.parse(cached);
    const isExpired = Date.now() - data.timestamp > cacheDuration;

    return isExpired ? false : data.hasUpdates;
  } catch (error) {
    console.error('读取更新缓存失败:', error);
    return false;
  }
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

/**
 * 订阅更新通知
 */
export function subscribeToWatchingUpdates(
  callback: (hasUpdates: boolean) => void,
): () => void {
  updateListeners.add(callback);

  // 返回取消订阅函数
  return () => {
    updateListeners.delete(callback);
  };
}

/**
 * 通知所有监听器
 */
function notifyListeners(hasUpdates: boolean): void {
  updateListeners.forEach((callback) => {
    try {
      callback(hasUpdates);
    } catch (error) {
      console.error('通知更新监听器失败:', error);
    }
  });
}

/**
 * 设置定期检查
 * @param intervalMinutes 检查间隔（分钟）
 */
export function setupPeriodicUpdateCheck(intervalMinutes = 30): () => void {
  debugLog(`设置定期更新检查，间隔: ${intervalMinutes} 分钟`);

  checkWatchingUpdates();

  const intervalId = setInterval(
    () => {
      checkWatchingUpdates();
    },
    intervalMinutes * 60 * 1000,
  );

  return () => {
    clearInterval(intervalId);
  };
}

/**
 * 页面可见性变化时自动检查更新
 */
export function setupVisibilityChangeCheck(): () => void {
  if (typeof window === 'undefined') {
    // 服务器端渲染时返回空操作函数
    return () => void 0;
  }

  const handleVisibilityChange = () => {
    if (!document.hidden) {
      // 页面变为可见时检查更新
      checkWatchingUpdates();
    }
  };

  document.addEventListener('visibilitychange', handleVisibilityChange);

  return () => {
    document.removeEventListener('visibilitychange', handleVisibilityChange);
  };
}

/**
 * 获取详细的更新信息
 */
export function getDetailedWatchingUpdates(): WatchingUpdate | null {
  try {
    const cacheDuration =
      STORAGE_TYPE === 'localstorage' ? CACHE_DURATION : SERVER_CACHE_DURATION;

    if (STORAGE_TYPE !== 'localstorage') {
      if (!memoryWatchingUpdatesCache) {
        return null;
      }

      const isExpired =
        Date.now() - memoryWatchingUpdatesCache.timestamp > cacheDuration;
      if (isExpired) {
        return null;
      }

      return {
        hasUpdates: memoryWatchingUpdatesCache.hasUpdates,
        timestamp: memoryWatchingUpdatesCache.timestamp,
        updatedCount: memoryWatchingUpdatesCache.updatedCount,
        continueWatchingCount: memoryWatchingUpdatesCache.continueWatchingCount,
        updatedSeries: memoryWatchingUpdatesCache.updatedSeries,
      };
    }

    const cached = localStorage.getItem(WATCHING_UPDATES_CACHE_KEY);
    if (!cached) {
      return null;
    }

    const data: WatchingUpdatesCache = JSON.parse(cached);
    const isExpired = Date.now() - data.timestamp > cacheDuration;

    if (isExpired) {
      return null;
    }

    return {
      hasUpdates: data.hasUpdates,
      timestamp: data.timestamp,
      updatedCount: data.updatedCount,
      continueWatchingCount: data.continueWatchingCount,
      updatedSeries: data.updatedSeries,
    };
  } catch (error) {
    console.error('读取详细更新信息失败:', error);
    return null;
  }
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
      notifyListeners(false);
      dispatchWatchingUpdatesEvent(false, 0);
    }
  } catch (error) {
    console.error('标记更新为已查看失败:', error);
  }
}

/**
 * 清除新集数更新状态（来自Alpha版本）
 */
export function clearWatchingUpdates(): void {
  try {
    // 🔧 优化：非 localStorage 模式清除内存缓存
    if (STORAGE_TYPE !== 'localstorage') {
      memoryWatchingUpdatesCache = null;
      memoryLastCheckTime = 0;
    } else {
      localStorage.removeItem(WATCHING_UPDATES_CACHE_KEY);
      localStorage.removeItem(LAST_CHECK_TIME_KEY);
    }

    // 通知监听器
    notifyListeners(false);
    dispatchWatchingUpdatesEvent(false, 0);
  } catch (error) {
    console.error('清除新集数更新状态失败:', error);
  }
}

/**
 * 强制清除watching updates缓存（包括内存和localStorage）
 * 用于播放记录更新后立即清除缓存
 */
export function forceClearWatchingUpdatesCache(): void {
  try {
    debugLog('强制清除 watching-updates 缓存');

    memoryWatchingUpdatesCache = null;
    memoryLastCheckTime = 0;

    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(WATCHING_UPDATES_CACHE_KEY);
      localStorage.removeItem(LAST_CHECK_TIME_KEY);
    }
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
  callback: (hasUpdates: boolean, updatedCount: number) => void,
): () => void {
  if (typeof window === 'undefined') {
    return () => void 0;
  }

  const handleUpdate = (event: CustomEvent) => {
    const { hasUpdates, updatedCount } = event.detail;
    callback(hasUpdates, updatedCount);
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
