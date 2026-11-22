/* eslint-disable no-console, @typescript-eslint/no-explicit-any, @typescript-eslint/no-empty-function */
'use client';

import { cacheManager } from './cache-manager';
import {
  fetchFromApi,
  fetchWithAuth,
  handleDatabaseOperationFailure,
  triggerGlobalError,
} from './core';
import { readThroughCache } from './read-through-cache';

// ---------------- 搜索历史相关常量 ----------------
// 搜索历史最大保存条数
const SEARCH_HISTORY_LIMIT = 20;

/* ---------------- 搜索历史相关 API ---------------- */

/**
 * 获取搜索历史。
 * 使用混合缓存策略：优先返回缓存数据，后台异步同步最新数据。
 */
export async function getSearchHistory(): Promise<string[]> {
  // 服务器端渲染阶段直接返回空
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    return await readThroughCache<string[]>({
      readCache: () => cacheManager.getCachedSearchHistory(),
      writeCache: (data) => cacheManager.cacheSearchHistory(data),
      fetchFromServer: () => fetchFromApi<string[]>(`/api/searchhistory`),
      backgroundSyncKey: 'searchhistory-background-sync',
      initialFetchKey: 'searchhistory-initial-fetch',
      dispatchUpdated: (data) =>
        window.dispatchEvent(
          new CustomEvent('searchHistoryUpdated', {
            detail: data,
          }),
        ),
      warnSyncFailure: (err) => {
        console.warn('后台同步搜索历史失败:', err);
        triggerGlobalError('后台同步搜索历史失败');
      },
      handleFetchFailure: (err) => {
        console.error('获取搜索历史失败:', err);
        triggerGlobalError('获取搜索历史失败');
      },
    });
  } catch {
    return [];
  }
}

/**
 * 将关键字添加到搜索历史。
 * 使用乐观更新：先更新缓存，再异步同步到数据库。
 */
export async function addSearchHistory(keyword: string): Promise<void> {
  const trimmed = keyword.trim();
  if (!trimmed) return;

  // 立即更新缓存
  const cachedHistory = cacheManager.getCachedSearchHistory() || [];
  const newHistory = [trimmed, ...cachedHistory.filter((k) => k !== trimmed)];
  // 限制长度
  if (newHistory.length > SEARCH_HISTORY_LIMIT) {
    newHistory.length = SEARCH_HISTORY_LIMIT;
  }
  cacheManager.cacheSearchHistory(newHistory);

  // 触发立即更新事件
  window.dispatchEvent(
    new CustomEvent('searchHistoryUpdated', {
      detail: newHistory,
    }),
  );

  // 异步同步到数据库
  try {
    await fetchWithAuth('/api/searchhistory', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ keyword: trimmed }),
    });
  } catch (err) {
    await handleDatabaseOperationFailure('searchHistory', err);
  }
}

/**
 * 清空搜索历史。
 * 使用乐观更新：先更新缓存，再异步同步到数据库。
 */
export async function clearSearchHistory(): Promise<void> {
  // 立即更新缓存
  cacheManager.cacheSearchHistory([]);

  // 触发立即更新事件
  window.dispatchEvent(
    new CustomEvent('searchHistoryUpdated', {
      detail: [],
    }),
  );

  // 异步同步到数据库
  try {
    await fetchWithAuth(`/api/searchhistory`, {
      method: 'DELETE',
    });
  } catch (err) {
    await handleDatabaseOperationFailure('searchHistory', err);
  }
}

/**
 * 删除单条搜索历史。
 * 使用乐观更新：先更新缓存，再异步同步到数据库。
 */
export async function deleteSearchHistory(keyword: string): Promise<void> {
  const trimmed = keyword.trim();
  if (!trimmed) return;

  // 立即更新缓存
  const cachedHistory = cacheManager.getCachedSearchHistory() || [];
  const newHistory = cachedHistory.filter((k) => k !== trimmed);
  cacheManager.cacheSearchHistory(newHistory);

  // 触发立即更新事件
  window.dispatchEvent(
    new CustomEvent('searchHistoryUpdated', {
      detail: newHistory,
    }),
  );

  // 异步同步到数据库
  try {
    await fetchWithAuth(
      `/api/searchhistory?keyword=${encodeURIComponent(trimmed)}`,
      {
        method: 'DELETE',
      },
    );
  } catch (err) {
    await handleDatabaseOperationFailure('searchHistory', err);
  }
}
