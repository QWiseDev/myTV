/* eslint-disable no-console, @typescript-eslint/no-explicit-any, @typescript-eslint/no-empty-function */
'use client';

import { cacheManager, reconcilePlayRecordsCache } from './cache-manager';
import type { UserPlayStat } from '../types';

// 全局错误触发函数
export function triggerGlobalError(message: string) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('globalError', {
        detail: { message },
      }),
    );
  }
}

// 为了向后兼容，保留UserStats类型别名
export type UserStats = UserPlayStat;

// ---- 收藏类型 ----
export interface Favorite {
  title: string;
  source_name: string;
  year: string;
  cover: string;
  total_episodes: number;
  save_time: number;
  search_title?: string;
  origin?: 'vod' | 'live';
}

// ---- 环境变量 ----
export const STORAGE_TYPE = (() => {
  const raw =
    (typeof window !== 'undefined' &&
      (window as any).RUNTIME_CONFIG?.STORAGE_TYPE) ||
    (process.env.STORAGE_TYPE as
      | 'localstorage'
      | 'redis'
      | 'upstash'
      | undefined) ||
    'localstorage';
  return raw;
})();

// ---- 工具函数 ----
/**
 * 通用的 fetch 函数，处理 401 状态码自动跳转登录
 */
export async function fetchWithAuth(
  url: string,
  options?: RequestInit,
): Promise<Response> {
  const res = await fetch(url, options);
  if (!res.ok) {
    // 如果是 401 未授权，跳转到登录页面
    if (res.status === 401) {
      // 调用 logout 接口
      try {
        await fetch('/api/logout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (error) {
        console.error('注销请求失败:', error);
      }
      const currentUrl = window.location.pathname + window.location.search;
      const loginUrl = new URL('/login', window.location.origin);
      loginUrl.searchParams.set('redirect', currentUrl);
      window.location.href = loginUrl.toString();
      throw new Error('用户未授权，已跳转到登录页面');
    }
    throw new Error(`请求 ${url} 失败: ${res.status}`);
  }
  return res;
}

export async function fetchFromApi<T>(path: string): Promise<T> {
  const res = await fetchWithAuth(path);
  return (await res.json()) as T;
}

// ---- 错误处理辅助函数 ----
/**
 * 数据库操作失败时的通用错误处理
 * 立即从数据库刷新对应类型的缓存以保持数据一致性
 */
export async function handleDatabaseOperationFailure(
  dataType: 'playRecords' | 'favorites' | 'searchHistory',
  error: any,
  username?: string | null,
): Promise<void> {
  console.error(`数据库操作失败 (${dataType}):`, error);
  triggerGlobalError(`数据库操作失败`);

  try {
    let freshData: any;
    let eventName: string;

    switch (dataType) {
      case 'playRecords': {
        const targetUsername =
          username === undefined ? cacheManager.getCurrentUsername() : username;
        const reconciled = await reconcilePlayRecordsCache(targetUsername);
        if (
          reconciled &&
          cacheManager.getCurrentUsername() === targetUsername
        ) {
          await invalidateWatchingUpdatesClientCache();
        }
        return;
      }
      case 'favorites':
        freshData =
          await fetchFromApi<Record<string, Favorite>>(`/api/favorites`);
        cacheManager.cacheFavorites(freshData);
        eventName = 'favoritesUpdated';
        break;
      case 'searchHistory':
        freshData = await fetchFromApi<string[]>(`/api/searchhistory`);
        cacheManager.cacheSearchHistory(freshData);
        eventName = 'searchHistoryUpdated';
        break;
    }

    // 触发更新事件通知组件
    window.dispatchEvent(
      new CustomEvent(eventName, {
        detail: freshData,
      }),
    );
  } catch (refreshErr) {
    if (dataType === 'playRecords' && username !== undefined) {
      cacheManager.forceRefreshPlayRecordsCache(username);
    }
    console.error(`刷新${dataType}缓存失败:`, refreshErr);
    triggerGlobalError(`刷新${dataType}缓存失败`);
  }
}

export async function invalidateWatchingUpdatesClientCache(): Promise<void> {
  try {
    const { forceClearWatchingUpdatesCache } =
      await import('../watching-updates');
    forceClearWatchingUpdatesCache();
  } catch (error) {
    console.warn('失效客户端追更缓存失败:', error);
  }
}
