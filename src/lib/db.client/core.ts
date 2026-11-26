/* eslint-disable no-console, @typescript-eslint/no-explicit-any, @typescript-eslint/no-empty-function */
'use client';

import { cacheManager } from './cache-manager';
import { clearBrowserAuthCookies, openLoginModal } from '../login-modal';
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

// ---- 工具函数 ----
/**
 * 通用的 fetch 函数，处理 401 状态码自动弹出登录弹窗
 */
export async function fetchWithAuth(
  url: string,
  options?: RequestInit,
): Promise<Response> {
  const res = await fetch(url, options);
  if (!res.ok) {
    // 如果是 401 未授权，清掉本地登录态并弹出登录弹窗（不跳页，爱奇艺式）
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
      clearBrowserAuthCookies();
      openLoginModal();
      const authError = new Error('登录已失效，请重新登录') as any;
      authError.isAuthError = true;
      throw authError;
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

  // 登录失效引发的失败：登录弹窗本身就是提示，不再叠加全局错误条，
  // 也不再刷新缓存（刷新请求同样会 401）
  if (error?.isAuthError) {
    return;
  }

  triggerGlobalError(`数据库操作失败`);

  try {
    let freshData: any;
    let eventName: string;

    switch (dataType) {
      case 'playRecords': {
        // 播放记录补偿已迁移至 play-records/api；动态 import 避免顶层循环依赖。
        // CRUD 自身的失败补偿在写队列内完成，不会重复进入此分支。
        const targetUsername =
          username === undefined ? cacheManager.getCurrentUsername() : username;
        const {
          invalidatePlayRecordsStore,
          reconcilePlayRecordsForExternalCaller,
        } = await import('./play-records/api');
        try {
          const reconciled =
            await reconcilePlayRecordsForExternalCaller(targetUsername);
          if (
            reconciled &&
            cacheManager.getCurrentUsername() === targetUsername
          ) {
            await invalidateWatchingUpdatesClientCache();
          }
          return;
        } catch (refreshErr) {
          invalidatePlayRecordsStore(targetUsername);
          console.error('刷新playRecords缓存失败:', refreshErr);
          triggerGlobalError('刷新playRecords缓存失败');
          return;
        }
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
