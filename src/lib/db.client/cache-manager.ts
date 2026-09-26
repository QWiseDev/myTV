/* eslint-disable no-console, @typescript-eslint/no-explicit-any, @typescript-eslint/no-empty-function */
'use client';

import {
  type Favorite,
  type UserStats,
  fetchFromApi,
  STORAGE_TYPE,
  triggerGlobalError,
} from './core';
import { getAuthInfoFromBrowserCookie } from '../auth';
import type { EpisodeSkipConfig, PlayRecord } from '../types';

// ---- 缓存数据结构 ----
interface CacheData<T> {
  data: T;
  timestamp: number;
  version: string;
}

interface UserCacheStore {
  playRecords?: CacheData<Record<string, PlayRecord>>;
  favorites?: CacheData<Record<string, Favorite>>;
  searchHistory?: CacheData<string[]>;
  skipConfigs?: CacheData<Record<string, EpisodeSkipConfig>>;
  userStats?: CacheData<UserStats>; // 添加用户统计数据缓存
  // 注意：豆瓣缓存已迁移到统一存储，不再需要这里的缓存结构
}

// 缓存相关常量
const CACHE_PREFIX = 'moontv_cache_';
const CACHE_VERSION = '1.0.0';
const CACHE_EXPIRE_TIME = 60 * 60 * 1000; // 一小时缓存过期
const PLAY_RECORDS_CACHE_EXPIRE_TIME = 5 * 60 * 1000; // 播放记录5分钟缓存过期，与新集数更新检查保持一致

// 注意：豆瓣缓存配置已迁移到 douban.client.ts

// ---- 内存缓存（用于 Kvrocks/Upstash 模式）----
const memoryCache: Map<string, UserCacheStore> = new Map();
const playRecordsCacheRevisions = new Map<string, number>();
const pendingPlayRecordsMutations = new Map<string, number>();
const playRecordsMutationQueues = new Map<string, Promise<void>>();

// ---- 缓存管理器 ----
class HybridCacheManager {
  private static instance: HybridCacheManager;
  private pendingRequests: Map<string, Promise<any>> = new Map();

  static getInstance(): HybridCacheManager {
    if (!HybridCacheManager.instance) {
      HybridCacheManager.instance = new HybridCacheManager();
    }
    return HybridCacheManager.instance;
  }

  /**
   * 请求去重机制 - 防止同时发起多个相同的API请求
   */
  public getOrCreateRequest<T>(
    key: string,
    requestFn: () => Promise<T>,
  ): Promise<T> {
    if (this.pendingRequests.has(key)) {
      return this.pendingRequests.get(key) as Promise<T>;
    }

    const promise = requestFn().finally(() => {
      // 请求完成后清理
      this.pendingRequests.delete(key);
    });

    this.pendingRequests.set(key, promise);
    return promise;
  }

  /**
   * 获取当前用户名
   */
  getCurrentUsername(): string | null {
    const authInfo = getAuthInfoFromBrowserCookie();
    return authInfo?.username || null;
  }

  /**
   * 生成用户专属的缓存key
   */
  private getUserCacheKey(username: string): string {
    return `${CACHE_PREFIX}${username}`;
  }

  /**
   * 获取用户缓存数据
   */
  private getUserCache(username: string): UserCacheStore {
    if (typeof window === 'undefined') return {};

    // 🔧 优化：Kvrocks/Upstash 模式使用内存缓存
    if (STORAGE_TYPE !== 'localstorage') {
      const cacheKey = this.getUserCacheKey(username);
      return memoryCache.get(cacheKey) || {};
    }

    try {
      const cacheKey = this.getUserCacheKey(username);
      const cached = localStorage.getItem(cacheKey);
      return cached ? JSON.parse(cached) : {};
    } catch (error) {
      console.warn('获取用户缓存失败:', error);
      return {};
    }
  }

  /**
   * 保存用户缓存数据
   */
  private saveUserCache(username: string, cache: UserCacheStore): void {
    if (typeof window === 'undefined') return;

    // 🔧 优化：Kvrocks/Upstash 模式使用内存缓存（不占用 localStorage，避免 QuotaExceededError）
    if (STORAGE_TYPE !== 'localstorage') {
      const cacheKey = this.getUserCacheKey(username);
      memoryCache.set(cacheKey, cache);
      return;
    }

    try {
      // 检查缓存大小，超过15MB时清理旧数据
      const cacheSize = JSON.stringify(cache).length;
      if (cacheSize > 15 * 1024 * 1024) {
        console.warn('缓存过大，清理旧数据');
        this.cleanOldCache(cache);
      }

      const cacheKey = this.getUserCacheKey(username);
      localStorage.setItem(cacheKey, JSON.stringify(cache));
    } catch (error) {
      console.warn('保存用户缓存失败:', error);
      // 存储空间不足时清理缓存后重试
      if (
        error instanceof DOMException &&
        error.name === 'QuotaExceededError'
      ) {
        this.clearAllCache();
        try {
          const cacheKey = this.getUserCacheKey(username);
          localStorage.setItem(cacheKey, JSON.stringify(cache));
        } catch (retryError) {
          console.error('重试保存缓存仍然失败:', retryError);
        }
      }
    }
  }

  /**
   * 清理过期缓存数据
   */
  private cleanOldCache(cache: UserCacheStore): void {
    const now = Date.now();
    const maxAge = 60 * 24 * 60 * 60 * 1000; // 两个月

    // 清理过期的播放记录缓存
    if (cache.playRecords && now - cache.playRecords.timestamp > maxAge) {
      delete cache.playRecords;
    }

    // 清理过期的收藏缓存
    if (cache.favorites && now - cache.favorites.timestamp > maxAge) {
      delete cache.favorites;
    }

    // 注意：豆瓣缓存已迁移到统一存储，不再在这里处理
  }

  /**
   * 清理所有缓存
   */
  private clearAllCache(): void {
    const keys = Object.keys(localStorage);
    keys.forEach((key) => {
      if (key.startsWith('moontv_cache_')) {
        localStorage.removeItem(key);
      }
    });
  }

  /**
   * 检查缓存是否有效
   */
  private isCacheValid<T>(
    cache: CacheData<T>,
    cacheType?: 'playRecords',
  ): boolean {
    const now = Date.now();
    const expireTime =
      cacheType === 'playRecords'
        ? PLAY_RECORDS_CACHE_EXPIRE_TIME
        : CACHE_EXPIRE_TIME;
    return (
      cache.version === CACHE_VERSION && now - cache.timestamp < expireTime
    );
  }

  /**
   * 创建缓存数据
   */
  private createCacheData<T>(data: T): CacheData<T> {
    return {
      data,
      timestamp: Date.now(),
      version: CACHE_VERSION,
    };
  }

  /**
   * 获取缓存的播放记录
   */
  getCachedPlayRecords(
    username: string | null = this.getCurrentUsername(),
  ): Record<string, PlayRecord> | null {
    if (!username) return null;

    const userCache = this.getUserCache(username);
    const cached = userCache.playRecords;

    if (cached && this.isCacheValid(cached, 'playRecords')) {
      return cached.data;
    }

    return null;
  }

  /**
   * 缓存播放记录
   */
  cachePlayRecords(
    data: Record<string, PlayRecord>,
    username: string | null = this.getCurrentUsername(),
  ): void {
    if (!username) return;

    const userCache = this.getUserCache(username);
    userCache.playRecords = this.createCacheData(data);
    this.saveUserCache(username, userCache);
  }

  /**
   * 获取缓存的收藏
   */
  getCachedFavorites(): Record<string, Favorite> | null {
    const username = this.getCurrentUsername();
    if (!username) return null;

    const userCache = this.getUserCache(username);
    const cached = userCache.favorites;

    if (cached && this.isCacheValid(cached)) {
      return cached.data;
    }

    return null;
  }

  /**
   * 缓存收藏
   */
  cacheFavorites(data: Record<string, Favorite>): void {
    const username = this.getCurrentUsername();
    if (!username) return;

    const userCache = this.getUserCache(username);
    userCache.favorites = this.createCacheData(data);
    this.saveUserCache(username, userCache);
  }

  /**
   * 获取缓存的搜索历史
   */
  getCachedSearchHistory(): string[] | null {
    const username = this.getCurrentUsername();
    if (!username) return null;

    const userCache = this.getUserCache(username);
    const cached = userCache.searchHistory;

    if (cached && this.isCacheValid(cached)) {
      return cached.data;
    }

    return null;
  }

  /**
   * 缓存搜索历史
   */
  cacheSearchHistory(data: string[]): void {
    const username = this.getCurrentUsername();
    if (!username) return;

    const userCache = this.getUserCache(username);
    userCache.searchHistory = this.createCacheData(data);
    this.saveUserCache(username, userCache);
  }

  /**
   * 获取缓存的跳过片头片尾配置
   */
  getCachedSkipConfigs(): Record<string, EpisodeSkipConfig> | null {
    const username = this.getCurrentUsername();
    if (!username) return null;

    const userCache = this.getUserCache(username);
    const cached = userCache.skipConfigs;

    if (cached && this.isCacheValid(cached)) {
      return cached.data;
    }

    return null;
  }

  /**
   * 缓存跳过片头片尾配置
   */
  cacheSkipConfigs(data: Record<string, EpisodeSkipConfig>): void {
    const username = this.getCurrentUsername();
    if (!username) return;

    const userCache = this.getUserCache(username);
    userCache.skipConfigs = this.createCacheData(data);
    this.saveUserCache(username, userCache);
  }

  /**
   * 获取缓存的用户统计数据
   */
  getCachedUserStats(): UserStats | null {
    const username = this.getCurrentUsername();
    if (!username) return null;

    const userCache = this.getUserCache(username);
    const cached = userCache.userStats;

    if (cached && this.isCacheValid(cached)) {
      return cached.data;
    }

    return null;
  }

  /**
   * 缓存用户统计数据
   */
  cacheUserStats(data: UserStats): void {
    const username = this.getCurrentUsername();
    if (!username) return;

    const userCache = this.getUserCache(username);
    userCache.userStats = this.createCacheData(data);
    this.saveUserCache(username, userCache);
  }

  /**
   * 清除指定用户的所有缓存
   */
  clearUserCache(username?: string): void {
    const targetUsername = username || this.getCurrentUsername();
    if (!targetUsername) return;

    try {
      const cacheKey = this.getUserCacheKey(targetUsername);
      localStorage.removeItem(cacheKey);
    } catch (error) {
      console.warn('清除用户缓存失败:', error);
    }
  }

  /**
   * 强制刷新播放记录缓存
   * 用于新集数检测时确保数据同步
   */
  forceRefreshPlayRecordsCache(
    username: string | null = this.getCurrentUsername(),
  ): void {
    if (!username) return;

    const userCache = this.getUserCache(username);
    if (userCache.playRecords) {
      // 将播放记录缓存时间戳设置为过期
      userCache.playRecords.timestamp = 0;
      this.saveUserCache(username, userCache);
    }
  }

  /**
   * 清除所有过期缓存
   */
  clearExpiredCaches(): void {
    if (typeof window === 'undefined') return;

    try {
      const keysToRemove: string[] = [];

      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(CACHE_PREFIX)) {
          try {
            const cache = JSON.parse(localStorage.getItem(key) || '{}');
            // 检查是否有任何缓存数据过期
            let hasValidData = false;
            for (const [, cacheData] of Object.entries(cache)) {
              if (cacheData && this.isCacheValid(cacheData as CacheData<any>)) {
                hasValidData = true;
                break;
              }
            }
            if (!hasValidData) {
              keysToRemove.push(key);
            }
          } catch {
            // 解析失败的缓存也删除
            keysToRemove.push(key);
          }
        }
      }

      keysToRemove.forEach((key) => localStorage.removeItem(key));
    } catch (error) {
      console.warn('清除过期缓存失败:', error);
    }
  }

}

// 获取缓存管理器实例
export const cacheManager = HybridCacheManager.getInstance();

// 页面加载时清理过期缓存
if (typeof window !== 'undefined') {
  setTimeout(() => cacheManager.clearExpiredCaches(), 1000);
}

// ---- 播放记录并发控制 ----
const ANONYMOUS_PLAY_RECORDS_USER = '__anonymous__';

export function getPlayRecordsUserKey(username: string | null): string {
  return username || ANONYMOUS_PLAY_RECORDS_USER;
}

function getPlayRecordsCacheRevision(username: string | null): number {
  return playRecordsCacheRevisions.get(getPlayRecordsUserKey(username)) || 0;
}

function invalidatePlayRecordsCacheReads(username: string | null): number {
  const userKey = getPlayRecordsUserKey(username);
  const revision = getPlayRecordsCacheRevision(username) + 1;
  playRecordsCacheRevisions.set(userKey, revision);
  return revision;
}

export function beginPlayRecordsCacheMutation(username: string | null): void {
  const userKey = getPlayRecordsUserKey(username);
  pendingPlayRecordsMutations.set(
    userKey,
    (pendingPlayRecordsMutations.get(userKey) || 0) + 1,
  );
  invalidatePlayRecordsCacheReads(username);
}

export function finishPlayRecordsCacheMutation(username: string | null): void {
  const userKey = getPlayRecordsUserKey(username);
  const pendingCount = Math.max(
    0,
    (pendingPlayRecordsMutations.get(userKey) || 0) - 1,
  );
  if (pendingCount === 0) {
    pendingPlayRecordsMutations.delete(userKey);
  } else {
    pendingPlayRecordsMutations.set(userKey, pendingCount);
  }
  invalidatePlayRecordsCacheReads(username);
}

export function canCommitPlayRecordsSnapshot(
  username: string | null,
  revision: number,
): boolean {
  const userKey = getPlayRecordsUserKey(username);
  return (
    !pendingPlayRecordsMutations.has(userKey) &&
    revision === getPlayRecordsCacheRevision(username)
  );
}

export function dispatchPlayRecordsUpdated(
  data: Record<string, PlayRecord>,
  username: string | null,
): void {
  if (cacheManager.getCurrentUsername() !== username) return;

  window.dispatchEvent(
    new CustomEvent('playRecordsUpdated', {
      detail: data,
    }),
  );
}

export function serializePlayRecordsMutation(
  username: string | null,
  mutation: () => Promise<void>,
): Promise<void> {
  const userKey = getPlayRecordsUserKey(username);
  const previousMutation =
    playRecordsMutationQueues.get(userKey) || Promise.resolve();
  const currentMutation = previousMutation
    .catch(() => undefined)
    .then(mutation);
  const trackedMutation = currentMutation.finally(() => {
    if (playRecordsMutationQueues.get(userKey) === trackedMutation) {
      playRecordsMutationQueues.delete(userKey);
    }
  });
  playRecordsMutationQueues.set(userKey, trackedMutation);
  return trackedMutation;
}

export async function fetchPlayRecordsSnapshot(username: string | null): Promise<{
  data: Record<string, PlayRecord>;
  revision: number;
  username: string | null;
}> {
  const revision = getPlayRecordsCacheRevision(username);
  const data =
    await fetchFromApi<Record<string, PlayRecord>>(`/api/playrecords`);
  return { data, revision, username };
}

export async function reconcilePlayRecordsCache(
  username: string | null,
): Promise<boolean> {
  if (cacheManager.getCurrentUsername() !== username) {
    cacheManager.forceRefreshPlayRecordsCache(username);
    return false;
  }

  const refreshRevision = invalidatePlayRecordsCacheReads(username);
  try {
    const refreshedPlayRecords =
      await fetchFromApi<Record<string, PlayRecord>>(`/api/playrecords`);
    if (refreshRevision !== getPlayRecordsCacheRevision(username)) {
      return false;
    }

    cacheManager.cachePlayRecords(refreshedPlayRecords, username);
    dispatchPlayRecordsUpdated(refreshedPlayRecords, username);
    return true;
  } catch (error) {
    cacheManager.forceRefreshPlayRecordsCache(username);
    throw error;
  }
}

export function updateCachedPlayRecords(
  username: string | null,
  update: (records: Record<string, PlayRecord>) => void,
): Record<string, PlayRecord> | null {
  const cachedRecords = cacheManager.getCachedPlayRecords(username);
  if (!cachedRecords) return null;

  const previousRecords = { ...cachedRecords };
  const nextRecords = { ...cachedRecords };
  update(nextRecords);
  cacheManager.cachePlayRecords(nextRecords, username);
  dispatchPlayRecordsUpdated(nextRecords, username);
  return previousRecords;
}

// ---------------- 混合缓存辅助函数 ----------------

/**
 * 清除当前用户的所有缓存数据
 * 用于用户登出时清理缓存
 */
export function clearUserCache(): void {
  if (STORAGE_TYPE !== 'localstorage') {
    cacheManager.clearUserCache();
  }
}

/**
 * 强制刷新播放记录缓存
 * 用于新集数检测时确保数据同步
 */
export function forceRefreshPlayRecordsCache(): void {
  cacheManager.forceRefreshPlayRecordsCache();
}

/**
 * 手动刷新所有缓存数据
 * 强制从服务器重新获取数据并更新缓存
 */
export async function refreshAllCache(): Promise<void> {
  if (STORAGE_TYPE === 'localstorage') return;

  try {
    const username = cacheManager.getCurrentUsername();
    // 并行刷新所有数据
    const [playRecords, favorites, searchHistory, skipConfigs] =
      await Promise.allSettled([
        fetchPlayRecordsSnapshot(username),
        fetchFromApi<Record<string, Favorite>>(`/api/favorites`),
        fetchFromApi<string[]>(`/api/searchhistory`),
        fetchFromApi<Record<string, EpisodeSkipConfig>>(`/api/skipconfigs`),
      ]);

    if (playRecords.status === 'fulfilled') {
      const { data, revision } = playRecords.value;
      if (canCommitPlayRecordsSnapshot(username, revision)) {
        cacheManager.cachePlayRecords(data, username);
        dispatchPlayRecordsUpdated(data, username);
      }
    }

    if (favorites.status === 'fulfilled') {
      cacheManager.cacheFavorites(favorites.value);
      window.dispatchEvent(
        new CustomEvent('favoritesUpdated', {
          detail: favorites.value,
        }),
      );
    }

    if (searchHistory.status === 'fulfilled') {
      cacheManager.cacheSearchHistory(searchHistory.value);
      window.dispatchEvent(
        new CustomEvent('searchHistoryUpdated', {
          detail: searchHistory.value,
        }),
      );
    }

    if (skipConfigs.status === 'fulfilled') {
      cacheManager.cacheSkipConfigs(skipConfigs.value);
      window.dispatchEvent(
        new CustomEvent('skipConfigsUpdated', {
          detail: skipConfigs.value,
        }),
      );
    }
  } catch (err) {
    console.error('刷新缓存失败:', err);
    triggerGlobalError('刷新缓存失败');
  }
}

/**
 * 获取缓存状态信息
 * 用于调试和监控缓存健康状态
 */
export function getCacheStatus(): {
  hasPlayRecords: boolean;
  hasFavorites: boolean;
  hasSearchHistory: boolean;
  hasSkipConfigs: boolean;
  hasUserStats: boolean;
  username: string | null;
} {
  if (STORAGE_TYPE === 'localstorage') {
    return {
      hasPlayRecords: false,
      hasFavorites: false,
      hasSearchHistory: false,
      hasSkipConfigs: false,
      hasUserStats: false,
      username: null,
    };
  }

  const authInfo = getAuthInfoFromBrowserCookie();
  return {
    hasPlayRecords: !!cacheManager.getCachedPlayRecords(),
    hasFavorites: !!cacheManager.getCachedFavorites(),
    hasSearchHistory: !!cacheManager.getCachedSearchHistory(),
    hasSkipConfigs: !!cacheManager.getCachedSkipConfigs(),
    hasUserStats: !!cacheManager.getCachedUserStats(),
    username: authInfo?.username || null,
  };
}

// ---------------- React Hook 辅助类型 ----------------

export type CacheUpdateEvent =
  | 'playRecordsUpdated'
  | 'favoritesUpdated'
  | 'searchHistoryUpdated'
  | 'skipConfigsUpdated'
  | 'userStatsUpdated';

/**
 * 用于 React 组件监听数据更新的事件监听器
 * 使用方法：
 *
 * useEffect(() => {
 *   const unsubscribe = subscribeToDataUpdates('playRecordsUpdated', (data) => {
 *     setPlayRecords(data);
 *   });
 *   return unsubscribe;
 * }, []);
 */
export function subscribeToDataUpdates<T>(
  eventType: CacheUpdateEvent,
  callback: (data: T) => void,
): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const handleUpdate = (event: CustomEvent) => {
    callback(event.detail);
  };

  window.addEventListener(eventType, handleUpdate as EventListener);

  return () => {
    window.removeEventListener(eventType, handleUpdate as EventListener);
  };
}

/**
 * 预加载所有用户数据到缓存
 * 适合在应用启动时调用，提升后续访问速度
 */
export async function preloadUserData(): Promise<void> {
  if (STORAGE_TYPE === 'localstorage') return;

  // 检查是否已有有效缓存，避免重复请求
  const status = getCacheStatus();
  if (
    status.hasPlayRecords &&
    status.hasFavorites &&
    status.hasSearchHistory &&
    status.hasSkipConfigs
  ) {
    return;
  }

  // 后台静默预加载，不阻塞界面
  refreshAllCache().catch((err) => {
    console.warn('预加载用户数据失败:', err);
    triggerGlobalError('预加载用户数据失败');
  });
}
