/* eslint-disable no-console, @typescript-eslint/no-explicit-any, @typescript-eslint/no-empty-function */
'use client';

import { cacheManager } from './cache-manager';
import { fetchFromApi, STORAGE_TYPE, triggerGlobalError } from './core';
import { getAuthInfoFromBrowserCookie } from '../auth';
import { generateStorageKey } from '../storage-key';
import type { EpisodeSkipConfig } from '../types';

// ---------------- 跳过片头片尾配置相关 API ----------------

/**
 * 获取跳过片头片尾配置。
 * 数据库存储模式下使用混合缓存策略：优先返回缓存数据，后台异步同步最新数据。
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

    if (STORAGE_TYPE === 'localstorage') {
      // localStorage 模式
      const raw = localStorage.getItem('moontv_skip_configs');
      if (!raw) return null;
      const allConfigs = JSON.parse(raw) as Record<string, EpisodeSkipConfig>;
      return allConfigs[key] || null;
    } else {
      // 数据库模式：先查缓存
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
    }
  } catch (err) {
    console.error('获取跳过配置失败:', err);
    return null;
  }
}

/**
 * 保存跳过片头片尾配置。
 * 数据库存储模式下使用乐观更新：先更新缓存，再异步同步到数据库。
 */
export async function saveSkipConfig(
  source: string,
  id: string,
  config: EpisodeSkipConfig,
): Promise<void> {
  try {
    const key = generateStorageKey(source, id);

    if (STORAGE_TYPE === 'localstorage') {
      // localStorage 模式
      if (typeof window === 'undefined') {
        console.warn('无法在服务端保存跳过配置到 localStorage');
        return;
      }
      const raw = localStorage.getItem('moontv_skip_configs');
      const configs = raw
        ? (JSON.parse(raw) as Record<string, EpisodeSkipConfig>)
        : {};
      configs[key] = config;
      localStorage.setItem('moontv_skip_configs', JSON.stringify(configs));
      window.dispatchEvent(
        new CustomEvent('skipConfigsUpdated', {
          detail: configs,
        }),
      );
    } else {
      // 数据库模式：乐观更新策略
      const cachedConfigs = cacheManager.getCachedSkipConfigs() || {};
      cachedConfigs[key] = config;
      cacheManager.cacheSkipConfigs(cachedConfigs);

      window.dispatchEvent(
        new CustomEvent('skipConfigsUpdated', {
          detail: cachedConfigs,
        }),
      );

      // 异步同步到数据库
      const authInfo = getAuthInfoFromBrowserCookie();
      if (!authInfo?.username) {
        throw new Error('未登录');
      }

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
    }
  } catch (err) {
    console.error('保存跳过配置失败:', err);
    triggerGlobalError('保存跳过配置失败');
    throw err;
  }
}

/**
 * 获取所有跳过片头片尾配置。
 * 数据库存储模式下使用混合缓存策略：优先返回缓存数据，后台异步同步最新数据。
 */
export async function getAllSkipConfigs(): Promise<
  Record<string, EpisodeSkipConfig>
> {
  // 服务器端渲染阶段直接返回空
  if (typeof window === 'undefined') {
    return {};
  }

  // 数据库存储模式：使用混合缓存策略（包括 redis 和 upstash）
  if (STORAGE_TYPE !== 'localstorage') {
    // 优先从缓存获取数据
    const cachedData = cacheManager.getCachedSkipConfigs();

    if (cachedData) {
      // 返回缓存数据，同时后台异步更新
      fetchFromApi<Record<string, EpisodeSkipConfig>>(`/api/skipconfigs`)
        .then((freshData) => {
          // 只有数据真正不同时才更新缓存
          if (JSON.stringify(cachedData) !== JSON.stringify(freshData)) {
            cacheManager.cacheSkipConfigs(freshData);
            // 触发数据更新事件
            window.dispatchEvent(
              new CustomEvent('skipConfigsUpdated', {
                detail: freshData,
              }),
            );
          }
        })
        .catch((err) => {
          console.warn('后台同步跳过片头片尾配置失败:', err);
          triggerGlobalError('后台同步跳过片头片尾配置失败');
        });

      return cachedData;
    } else {
      // 缓存为空，直接从 API 获取并缓存
      try {
        const freshData =
          await fetchFromApi<Record<string, EpisodeSkipConfig>>(
            `/api/skipconfigs`,
          );
        cacheManager.cacheSkipConfigs(freshData);
        return freshData;
      } catch (err) {
        console.error('获取跳过片头片尾配置失败:', err);
        triggerGlobalError('获取跳过片头片尾配置失败');
        return {};
      }
    }
  }

  // localStorage 模式
  try {
    const raw = localStorage.getItem('moontv_skip_configs');
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, EpisodeSkipConfig>;
  } catch (err) {
    console.error('读取跳过片头片尾配置失败:', err);
    triggerGlobalError('读取跳过片头片尾配置失败');
    return {};
  }
}

/**
 * 删除跳过片头片尾配置。
 * 数据库存储模式下使用乐观更新：先更新缓存，再异步同步到数据库。
 */
export async function deleteSkipConfig(
  source: string,
  id: string,
): Promise<void> {
  try {
    const key = generateStorageKey(source, id);

    if (STORAGE_TYPE === 'localstorage') {
      // localStorage 模式
      if (typeof window === 'undefined') {
        console.warn('无法在服务端删除跳过配置');
        return;
      }
      const raw = localStorage.getItem('moontv_skip_configs');
      if (raw) {
        const configs = JSON.parse(raw) as Record<string, EpisodeSkipConfig>;
        delete configs[key];
        localStorage.setItem('moontv_skip_configs', JSON.stringify(configs));
        window.dispatchEvent(
          new CustomEvent('skipConfigsUpdated', {
            detail: configs,
          }),
        );
      }
    } else {
      // 数据库模式：乐观更新策略
      const cachedConfigs = cacheManager.getCachedSkipConfigs() || {};
      delete cachedConfigs[key];
      cacheManager.cacheSkipConfigs(cachedConfigs);

      window.dispatchEvent(
        new CustomEvent('skipConfigsUpdated', {
          detail: cachedConfigs,
        }),
      );

      // 异步同步到数据库
      const authInfo = getAuthInfoFromBrowserCookie();
      if (!authInfo?.username) {
        throw new Error('未登录');
      }

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
    }
  } catch (err) {
    console.error('删除跳过片头片尾配置失败:', err);
    triggerGlobalError('删除跳过片头片尾配置失败');
    throw err;
  }
}
