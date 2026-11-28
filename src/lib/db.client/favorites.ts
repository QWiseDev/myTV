/* eslint-disable no-console, @typescript-eslint/no-explicit-any, @typescript-eslint/no-empty-function */
'use client';

import { cacheManager } from './cache-manager';
import {
  type Favorite,
  fetchFromApi,
  fetchWithAuth,
  handleDatabaseOperationFailure,
  triggerGlobalError,
} from './core';
import { readThroughCache } from './read-through-cache';
import { getAuthInfoFromBrowserCookie } from '../auth';
import { generateStorageKey } from '../storage-key';

/** 访客（未登录）判定：收藏与播放记录均为登录功能 */
function isGuest(): boolean {
  return (
    typeof window !== 'undefined' && !getAuthInfoFromBrowserCookie()?.username
  );
}

function getFavoritesUserScope(): string {
  return cacheManager.getCurrentUsername() || '__guest__';
}

function readFavoritesThroughCache(): Promise<Record<string, Favorite>> {
  const scope = getFavoritesUserScope();
  return readThroughCache<Record<string, Favorite>>({
    readCache: () => cacheManager.getCachedFavorites(),
    writeCache: (data) => cacheManager.cacheFavorites(data),
    fetchFromServer: () =>
      fetchFromApi<Record<string, Favorite>>(`/api/favorites`),
    backgroundSyncKey: `favorites-background-sync:${scope}`,
    initialFetchKey: `favorites-initial-fetch:${scope}`,
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
 * 使用混合缓存策略：优先返回缓存数据，后台异步同步最新数据。
 */
export async function getAllFavorites(): Promise<Record<string, Favorite>> {
  // 服务器端渲染阶段直接返回空
  if (typeof window === 'undefined') {
    return {};
  }

  // 访客（未登录）无收藏
  if (isGuest()) {
    return {};
  }

  return readFavoritesThroughCache();
}

/**
 * 保存收藏。
 * 使用乐观更新：先更新缓存，再异步同步到数据库。
 */
export async function saveFavorite(
  source: string,
  id: string,
  favorite: Favorite,
): Promise<void> {
  // 访客（未登录）不保存收藏
  if (isGuest()) {
    return;
  }

  const key = generateStorageKey(source, id);

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
}

/**
 * 删除收藏。
 * 使用乐观更新：先更新缓存，再异步同步到数据库。
 */
export async function deleteFavorite(
  source: string,
  id: string,
): Promise<void> {
  // 访客（未登录）无收藏可删除
  if (isGuest()) {
    return;
  }

  const key = generateStorageKey(source, id);

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
}

/**
 * 判断是否已收藏。
 * 使用混合缓存策略：优先返回缓存数据，后台异步同步最新数据。
 */
export async function isFavorited(
  source: string,
  id: string,
): Promise<boolean> {
  // 访客（未登录）无收藏
  if (isGuest()) {
    return false;
  }

  const key = generateStorageKey(source, id);

  // 软新鲜期内（默认 30s）直接命中内存缓存，避免首屏多张卡片错峰挂载重复触发后台 GET
  if (cacheManager.isFavoritesCacheSoftFresh()) {
    const cached = cacheManager.getCachedFavorites();
    if (cached) {
      return !!cached[key];
    }
  }

  const scope = getFavoritesUserScope();

  try {
    const favorites = await readThroughCache<Record<string, Favorite>>({
      readCache: () => cacheManager.getCachedFavorites(),
      writeCache: (data) => cacheManager.cacheFavorites(data),
      fetchFromServer: () =>
        fetchFromApi<Record<string, Favorite>>(`/api/favorites`),
      backgroundSyncKey: `favorites-background-sync:${scope}`,
      initialFetchKey: `favorites-initial-fetch:${scope}`,
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

/**
 * 清空全部收藏
 * 等待数据库删除成功后再更新缓存。
 */
export async function clearAllFavorites(): Promise<void> {
  // 访客（未登录）无收藏可清空
  if (isGuest()) {
    return;
  }

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
}
