'use client';

import { getAuthInfoFromBrowserCookie } from '@/lib/auth';

// 缓存时长：与服务端 2 小时定时任务对齐
const SERVER_CACHE_DURATION = 3 * 60 * 60 * 1000; // 3小时缓存

// 内存缓存
let memoryWatchingUpdatesCache: WatchingUpdatesCache | null = null;

// 事件名称
export const WATCHING_UPDATES_EVENT = 'watchingUpdatesChanged';

// 更新信息接口
export interface WatchingUpdate {
  hasUpdates: boolean;
  timestamp: number;
  updatedCount: number;
  continueWatchingCount: number; // 需要继续观看的剧集数量
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
    hasContinueWatching: boolean; // 是否需要继续观看
    newEpisodes?: number;
    remainingEpisodes?: number; // 剩余集数
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
 * 追更计算由后端定时任务负责，前端仅拉取缓存。
 */
export async function fetchWatchingUpdatesFromServer(
  forceRefresh = false,
): Promise<WatchingUpdate | null> {
  if (typeof window === 'undefined') {
    return null;
  }

  // 访客（未登录）无追更数据，不请求
  if (!getAuthInfoFromBrowserCookie()?.username) {
    return null;
  }

  const query = forceRefresh ? '?force=1' : '';
  const response = await fetch(`/api/watching-updates${query}`, {
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`获取追更提醒失败: ${response.status}`);
  }

  const data = (await response.json()) as WatchingUpdate;
  if (!data || !Array.isArray(data.updatedSeries)) {
    throw new Error('获取追更提醒失败: invalid payload');
  }

  cacheWatchingUpdates(data);
  dispatchWatchingUpdatesEvent(
    Boolean(data.hasUpdates),
    data.updatedCount || 0,
  );

  return data;
}

// 防抖控制：避免并发重复调用
let updateCheckPromise: Promise<void> | null = null;

/**
 * 检查追番更新：从服务端拉取追更提醒缓存
 * @param forceRefresh 是否强制刷新，跳过缓存时间检查
 */
export async function checkWatchingUpdates(
  forceRefresh = false,
): Promise<void> {
  if (!forceRefresh && updateCheckPromise) {
    return updateCheckPromise;
  }

  const runCheck = fetchWatchingUpdatesFromServer(forceRefresh)
    .then(() => undefined)
    .finally(() => {
      if (!forceRefresh) {
        updateCheckPromise = null;
      }
    });

  if (!forceRefresh) {
    updateCheckPromise = runCheck;
  }

  await runCheck;
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
    memoryWatchingUpdatesCache = {
      hasUpdates: data.hasUpdates,
      timestamp: data.timestamp,
      updatedCount: data.updatedCount,
      continueWatchingCount: data.continueWatchingCount,
      updatedSeries: data.updatedSeries,
    };
  } catch (error) {
    console.error('缓存更新信息失败:', error);
  }
}

function isWatchingUpdatesCacheExpired(data: WatchingUpdatesCache): boolean {
  return Date.now() - data.timestamp > SERVER_CACHE_DURATION;
}

function readWatchingUpdatesCache(
  errorMessage: string,
): WatchingUpdatesCache | null {
  try {
    if (!memoryWatchingUpdatesCache) {
      return null;
    }

    return isWatchingUpdatesCacheExpired(memoryWatchingUpdatesCache)
      ? null
      : memoryWatchingUpdatesCache;
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
 * 强制清除watching updates缓存
 * 用于播放记录更新后立即清除缓存
 */
export function forceClearWatchingUpdatesCache(): void {
  try {
    memoryWatchingUpdatesCache = null;
    dispatchWatchingUpdatesEvent(false, 0, true);
  } catch (error) {
    console.error('清除 watching-updates 缓存失败:', error);
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
