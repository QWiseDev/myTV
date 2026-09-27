/* eslint-disable no-console, @typescript-eslint/no-explicit-any, @typescript-eslint/no-empty-function */
'use client';

import { cacheManager } from './cache-manager';
import {
  type Favorite,
  fetchFromApi,
  fetchWithAuth,
  handleDatabaseOperationFailure,
  STORAGE_TYPE,
  triggerGlobalError,
} from './core';
import { readThroughCache } from './read-through-cache';
import { generateStorageKey } from '../storage-key';

// ---- 常量 ----
const FAVORITES_KEY = 'moontv_favorites';

function readFavoritesThroughCache(): Promise<Record<string, Favorite>> {
  return readThroughCache<Record<string, Favorite>>({
    readCache: () => cacheManager.getCachedFavorites(),
    writeCache: (data) => cacheManager.cacheFavorites(data),
    fetchFromServer: () => fetchFromApi<Record<string, Favorite>>(`/api/favorites`),
    backgroundSyncKey: 'favorites-background-sync',
    initialFetchKey: 'favorites-initial-fetch',
    dispatchUpdated: (data) =>
      window.dispatchEvent(
        new CustomEvent('favoritesUpdated', {
          detail: data,
        }),
      ),
    warnSyncFailure: (err) => {
      console.warn('后台同步收藏失败:', err);
      triggerGlobalError('后台同步收藏失败');
    },
    handleFetchFailure: (err) => {
      console.error('获取收藏失败:', err);
      triggerGlobalError('获取收藏失败');
    },
  });
}

// ---------------- 收藏相关 API ----------------

/**
 * 获取全部收藏。
 * 数据库存储模式下使用混合缓存策略：优先返回缓存数据，后台异步同步最新数据。
 */
export async function getAllFavorites(): Promise<Record<string, Favorite>> {
  // 服务器端渲染阶段直接返回空
  if (typeof window === 'undefined') {
    return {};
  }

  // 数据库存储模式：使用混合缓存策略（包括 redis 和 upstash）
  if (STORAGE_TYPE !== 'localstorage') {
    return readFavoritesThroughCache();
  }

  // localStorage 模式
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, Favorite>;
  } catch (err) {
    console.error('读取收藏失败:', err);
    triggerGlobalError('读取收藏失败');
    throw err;
  }
}

/**
 * 保存收藏。
 * 数据库存储模式下使用乐观更新：先更新缓存，再异步同步到数据库。
 */
export async function saveFavorite(
  source: string,
  id: string,
  favorite: Favorite,
): Promise<void> {
  const key = generateStorageKey(source, id);

  // 数据库存储模式：乐观更新策略（包括 redis 和 upstash）
  if (STORAGE_TYPE !== 'localstorage') {
    // 立即更新缓存
    const cachedFavorites = cacheManager.getCachedFavorites() || {};
    cachedFavorites[key] = favorite;
    cacheManager.cacheFavorites(cachedFavorites);

    // 触发立即更新事件
    window.dispatchEvent(
      new CustomEvent('favoritesUpdated', {
        detail: cachedFavorites,
      }),
    );

    // 异步同步到数据库
    try {
      await fetchWithAuth('/api/favorites', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ key, favorite }),
      });
    } catch (err) {
      await handleDatabaseOperationFailure('favorites', err);
      triggerGlobalError('保存收藏失败');
      throw err;
    }
    return;
  }

  // localStorage 模式
  if (typeof window === 'undefined') {
    console.warn('无法在服务端保存收藏到 localStorage');
    return;
  }

  try {
    const allFavorites = await getAllFavorites();
    allFavorites[key] = favorite;
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(allFavorites));
    window.dispatchEvent(
      new CustomEvent('favoritesUpdated', {
        detail: allFavorites,
      }),
    );
  } catch (err) {
    console.error('保存收藏失败:', err);
    triggerGlobalError('保存收藏失败');
    throw err;
  }
}

/**
 * 删除收藏。
 * 数据库存储模式下使用乐观更新：先更新缓存，再异步同步到数据库。
 */
export async function deleteFavorite(
  source: string,
  id: string,
): Promise<void> {
  const key = generateStorageKey(source, id);

  // 数据库存储模式：乐观更新策略（包括 redis 和 upstash）
  if (STORAGE_TYPE !== 'localstorage') {
    // 立即更新缓存
    const cachedFavorites = cacheManager.getCachedFavorites() || {};
    delete cachedFavorites[key];
    cacheManager.cacheFavorites(cachedFavorites);

    // 触发立即更新事件
    window.dispatchEvent(
      new CustomEvent('favoritesUpdated', {
        detail: cachedFavorites,
      }),
    );

    // 异步同步到数据库
    try {
      await fetchWithAuth(`/api/favorites?key=${encodeURIComponent(key)}`, {
        method: 'DELETE',
      });
    } catch (err) {
      await handleDatabaseOperationFailure('favorites', err);
      triggerGlobalError('删除收藏失败');
      throw err;
    }
    return;
  }

  // localStorage 模式
  if (typeof window === 'undefined') {
    console.warn('无法在服务端删除收藏到 localStorage');
    return;
  }

  try {
    const allFavorites = await getAllFavorites();
    delete allFavorites[key];
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(allFavorites));
    window.dispatchEvent(
      new CustomEvent('favoritesUpdated', {
        detail: allFavorites,
      }),
    );
  } catch (err) {
    console.error('删除收藏失败:', err);
    triggerGlobalError('删除收藏失败');
    throw err;
  }
}

/**
 * 判断是否已收藏。
 * 数据库存储模式下使用混合缓存策略：优先返回缓存数据，后台异步同步最新数据。
 */
export async function isFavorited(
  source: string,
  id: string,
): Promise<boolean> {
  const key = generateStorageKey(source, id);

  // 数据库存储模式：使用混合缓存策略（包括 redis 和 upstash）
  if (STORAGE_TYPE !== 'localstorage') {
    try {
      const favorites = await readThroughCache<Record<string, Favorite>>({
        readCache: () => cacheManager.getCachedFavorites(),
        writeCache: (data) => cacheManager.cacheFavorites(data),
        fetchFromServer: () =>
          fetchFromApi<Record<string, Favorite>>(`/api/favorites`),
        backgroundSyncKey: 'favorites-background-sync',
        initialFetchKey: 'favorites-initial-fetch',
        dispatchUpdated: (data) =>
          window.dispatchEvent(
            new CustomEvent('favoritesUpdated', {
              detail: data,
            }),
          ),
        warnSyncFailure: (err) => {
          console.warn('后台同步收藏失败:', err);
          triggerGlobalError('后台同步收藏失败');
        },
        handleFetchFailure: (err) => {
          console.error('检查收藏状态失败:', err);
          triggerGlobalError('检查收藏状态失败');
        },
      });
      return !!favorites[key];
    } catch {
      return false;
    }
  }

  // localStorage 模式
  const allFavorites = await getAllFavorites();
  return !!allFavorites[key];
}

/**
 * 清空全部收藏
 * 数据库存储模式下等待数据库删除成功后再更新缓存。
 */
export async function clearAllFavorites(): Promise<void> {
  // 数据库存储模式（包括 redis 和 upstash）
  if (STORAGE_TYPE !== 'localstorage') {
    try {
      await fetchWithAuth(`/api/favorites`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (err) {
      await handleDatabaseOperationFailure('favorites', err);
      triggerGlobalError('清空收藏失败');
      throw err;
    }

    cacheManager.cacheFavorites({});
    window.dispatchEvent(
      new CustomEvent('favoritesUpdated', {
        detail: {},
      }),
    );
    return;
  }

  // localStorage 模式
  if (typeof window === 'undefined') return;
  localStorage.removeItem(FAVORITES_KEY);
  window.dispatchEvent(
    new CustomEvent('favoritesUpdated', {
      detail: {},
    }),
  );
}
