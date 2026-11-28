/* eslint-disable no-console, @typescript-eslint/no-explicit-any, @typescript-eslint/no-empty-function */
'use client';

import { cacheManager } from './cache-manager';
import { fetchFromApi, triggerGlobalError } from './core';
import { readThroughCache } from './read-through-cache';
import { getAuthInfoFromBrowserCookie } from '../auth';
import { generateStorageKey } from '../storage-key';
import type { EpisodeSkipConfig } from '../types';

// ---------------- 跳过片头片尾配置相关 API ----------------

/**
 * 获取跳过片头片尾配置。
 * 使用混合缓存策略：优先返回缓存数据，后台异步同步最新数据。
 */
export async function getSkipConfig(
  source: string,
  id: string,
): Promise<EpisodeSkipConfig | null> {
  try {
    // 服务器端渲染阶段直接返回空
    if (typeof window === 'undefined') {
      return null;
    }

    const key = generateStorageKey(source, id);

    // 先查缓存
    const cachedConfigs = cacheManager.getCachedSkipConfigs();

    if (cachedConfigs && cachedConfigs[key]) {
      return cachedConfigs[key];
    }

    // 缓存未命中，从服务器获取
    const authInfo = getAuthInfoFromBrowserCookie();
    if (!authInfo?.username) {
      return null;
    }

    const response = await fetch('/api/skipconfigs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'get',
        key,
        username: authInfo.username,
      }),
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const config = data.config;

    // 更新缓存
    if (config) {
      const allConfigs = cachedConfigs || {};
      allConfigs[key] = config;
      cacheManager.cacheSkipConfigs(allConfigs);
    }

    return config;
  } catch (err) {
    console.error('获取跳过配置失败:', err);
    return null;
  }
}

/**
 * 保存跳过片头片尾配置。
 * 使用乐观更新：先更新缓存，再异步同步到数据库。
 */
export async function saveSkipConfig(
  source: string,
  id: string,
  config: EpisodeSkipConfig,
): Promise<void> {
  const key = generateStorageKey(source, id);
  const previousCached = cacheManager.getCachedSkipConfigs();
  const snapshotBeforeOptimistic = previousCached
    ? { ...previousCached }
    : null;
  let optimisticApplied = false;

  try {
    // 先校验登录态，避免访客误触时污染本地乐观缓存
    const authInfo = getAuthInfoFromBrowserCookie();
    if (!authInfo?.username) {
      throw new Error('未登录');
    }

    // 乐观更新策略
    const nextConfigs = { ...(snapshotBeforeOptimistic || {}), [key]: config };
    cacheManager.cacheSkipConfigs(nextConfigs);
    optimisticApplied = true;

    window.dispatchEvent(
      new CustomEvent('skipConfigsUpdated', {
        detail: nextConfigs,
      }),
    );

    const response = await fetch('/api/skipconfigs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'set',
        key,
        config,
        username: authInfo.username,
      }),
    });

    if (!response.ok) {
      throw new Error('保存跳过配置失败');
    }
  } catch (err) {
    if (optimisticApplied) {
      const rollback = snapshotBeforeOptimistic || {};
      cacheManager.cacheSkipConfigs(rollback);
      window.dispatchEvent(
        new CustomEvent('skipConfigsUpdated', {
          detail: rollback,
        }),
      );
    }
    console.error('保存跳过配置失败:', err);
    triggerGlobalError('保存跳过配置失败');
    throw err;
  }
}

/**
 * 获取所有跳过片头片尾配置。
 * 使用混合缓存策略：优先返回缓存数据，后台异步同步最新数据。
 */
export async function getAllSkipConfigs(): Promise<
  Record<string, EpisodeSkipConfig>
> {
  // 服务器端渲染阶段直接返回空
  if (typeof window === 'undefined') {
    return {};
  }

  try {
    // 注意：与 favorites / search-history 不同，此处的后台同步与初始拉取
    // 不经过 getOrCreateRequest 去重，保持直接请求的现状
    return await readThroughCache<Record<string, EpisodeSkipConfig>>({
      readCache: () => cacheManager.getCachedSkipConfigs(),
      writeCache: (data) => cacheManager.cacheSkipConfigs(data),
      fetchFromServer: () =>
        fetchFromApi<Record<string, EpisodeSkipConfig>>(`/api/skipconfigs`),
      backgroundSyncKey: null,
      initialFetchKey: null,
      dispatchUpdated: (data) =>
        window.dispatchEvent(
          new CustomEvent('skipConfigsUpdated', {
            detail: data,
          }),
        ),
      warnSyncFailure: (err) => {
        console.warn('后台同步跳过片头片尾配置失败:', err);
        triggerGlobalError('后台同步跳过片头片尾配置失败');
      },
      handleFetchFailure: (err) => {
        console.error('获取跳过片头片尾配置失败:', err);
        triggerGlobalError('获取跳过片头片尾配置失败');
      },
    });
  } catch {
    return {};
  }
}

/**
 * 删除跳过片头片尾配置。
 * 使用乐观更新：先更新缓存，再异步同步到数据库。
 */
export async function deleteSkipConfig(
  source: string,
  id: string,
): Promise<void> {
  const key = generateStorageKey(source, id);
  const previousCached = cacheManager.getCachedSkipConfigs();
  const snapshotBeforeOptimistic = previousCached
    ? { ...previousCached }
    : null;
  let optimisticApplied = false;

  try {
    const authInfo = getAuthInfoFromBrowserCookie();
    if (!authInfo?.username) {
      throw new Error('未登录');
    }

    // 乐观更新策略
    const nextConfigs = { ...(snapshotBeforeOptimistic || {}) };
    delete nextConfigs[key];
    cacheManager.cacheSkipConfigs(nextConfigs);
    optimisticApplied = true;

    window.dispatchEvent(
      new CustomEvent('skipConfigsUpdated', {
        detail: nextConfigs,
      }),
    );

    const response = await fetch('/api/skipconfigs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'delete',
        key,
        username: authInfo.username,
      }),
    });

    if (!response.ok) {
      throw new Error('删除跳过配置失败');
    }
  } catch (err) {
    if (optimisticApplied) {
      const rollback = snapshotBeforeOptimistic || {};
      cacheManager.cacheSkipConfigs(rollback);
      window.dispatchEvent(
        new CustomEvent('skipConfigsUpdated', {
          detail: rollback,
        }),
      );
    }
    console.error('删除跳过片头片尾配置失败:', err);
    triggerGlobalError('删除跳过片头片尾配置失败');
    throw err;
  }
}
