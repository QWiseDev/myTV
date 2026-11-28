'use client';

import { getAuthInfoFromBrowserCookie } from '@/lib/auth';

// 缓存时长：与服务端缓存周期对齐
const SERVER_CACHE_DURATION = 3 * 60 * 60 * 1000; // 3小时缓存
const ANONYMOUS_USER_KEY = '__anonymous__';

// 按用户名隔离的内存缓存，防止同页切换账号读取上一用户的追更快照
const memoryWatchingUpdatesByUser = new Map<string, WatchingUpdatesCache>();

// 按 (用户名 + 是否强制刷新) 隔离的并发请求去重表
const inflightUpdateChecks = new Map<string, Promise<void>>();

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
    cover: string;
    sourceKey: string;
    videoId: string;
    currentEpisode: number;
    totalEpisodes: number;
    hasNewEpisode: boolean;
    hasContinueWatching: boolean;
    newEpisodes?: number;
    remainingEpisodes?: number;
    latestEpisodes?: number;
    remarks?: string;
  }[];
}

export interface WatchingUpdatesCache {
  hasUpdates: boolean;
  timestamp: number;
  updatedCount: number;
  continueWatchingCount: number;
  updatedSeries: WatchingUpdate['updatedSeries'];
}

function getCurrentWatchingUserKey(): string {
  if (typeof window === 'undefined') {
    return ANONYMOUS_USER_KEY;
  }
  return getAuthInfoFromBrowserCookie()?.username || ANONYMOUS_USER_KEY;
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
 */
export async function fetchWatchingUpdatesFromServer(
  forceRefresh = false,
): Promise<WatchingUpdate | null> {
  if (typeof window === 'undefined') {
    return null;
  }

  // 访客（未登录）无追更数据，不请求
  const username = getAuthInfoFromBrowserCookie()?.username;
  if (!username) {
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

  // 复核请求返回时的当前登录身份，避免账号切换后串写
  if (getAuthInfoFromBrowserCookie()?.username !== username) {
    return null;
  }

  cacheWatchingUpdates(data, username);
  dispatchWatchingUpdatesEvent(
    Boolean(data.hasUpdates),
    data.updatedCount || 0,
  );

  return data;
}

/**
 * 检查追番更新：从服务端拉取追更提醒缓存（按用户与模式并发去重）
 * @param forceRefresh 是否强制刷新，跳过缓存时间检查
 */
export async function checkWatchingUpdates(
  forceRefresh = false,
): Promise<void> {
  const dedupeKey = `${getCurrentWatchingUserKey()}:${forceRefresh ? 'force' : 'normal'}`;
  const existing = inflightUpdateChecks.get(dedupeKey);
  if (existing) {
    return existing;
  }

  const runCheck = fetchWatchingUpdatesFromServer(forceRefresh)
    .then(() => undefined)
    .finally(() => {
      if (inflightUpdateChecks.get(dedupeKey) === runCheck) {
        inflightUpdateChecks.delete(dedupeKey);
      }
    });

  inflightUpdateChecks.set(dedupeKey, runCheck);
  await runCheck;
}

/**
 * 供 SSR 首屏直出数据注入客户端缓存（仅当本地尚无更新的同用户缓存时写入）
 */
export function seedWatchingUpdatesCache(
  data: WatchingUpdatesCache | null | undefined,
): void {
  if (typeof window === 'undefined' || !data) {
    return;
  }

  const userKey = getCurrentWatchingUserKey();
  if (userKey === ANONYMOUS_USER_KEY) {
    return;
  }

  const existing = memoryWatchingUpdatesByUser.get(userKey);
  if (existing && existing.timestamp >= data.timestamp) {
    return;
  }

  cacheWatchingUpdates(data, userKey);
}

/**
 * 获取缓存的更新信息
 */
export function getCachedWatchingUpdates(): boolean {
  return Boolean(readWatchingUpdatesCache('读取更新缓存失败:')?.hasUpdates);
}

/**
 * 缓存更新信息（按用户隔离）
 */
function cacheWatchingUpdates(
  data: WatchingUpdatesCache,
  explicitUserKey?: string,
): void {
  try {
    const userKey = explicitUserKey || getCurrentWatchingUserKey();
    memoryWatchingUpdatesByUser.set(userKey, {
      hasUpdates: data.hasUpdates,
      timestamp: data.timestamp,
      updatedCount: data.updatedCount,
      continueWatchingCount: data.continueWatchingCount,
      updatedSeries: data.updatedSeries,
    });
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
    const userKey = getCurrentWatchingUserKey();
    const cached = memoryWatchingUpdatesByUser.get(userKey);
    if (!cached) {
      return null;
    }

    if (isWatchingUpdatesCacheExpired(cached)) {
      memoryWatchingUpdatesByUser.delete(userKey);
      return null;
    }

    return cached;
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
 * 强制清除 watching updates 缓存
 * 用于播放记录更新或退出登录后立即清除缓存
 */
export function forceClearWatchingUpdatesCache(): void {
  try {
    memoryWatchingUpdatesByUser.clear();
    inflightUpdateChecks.clear();
    dispatchWatchingUpdatesEvent(false, 0, true);
  } catch (error) {
    console.error('清除 watching-updates 缓存失败:', error);
  }
}

/**
 * 订阅新集数更新事件
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
