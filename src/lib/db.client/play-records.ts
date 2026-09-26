/* eslint-disable no-console, @typescript-eslint/no-explicit-any, @typescript-eslint/no-empty-function */
'use client';

import {
  beginPlayRecordsCacheMutation,
  cacheManager,
  canCommitPlayRecordsSnapshot,
  dispatchPlayRecordsUpdated,
  fetchPlayRecordsSnapshot,
  finishPlayRecordsCacheMutation,
  getPlayRecordsUserKey,
  reconcilePlayRecordsCache,
  serializePlayRecordsMutation,
  updateCachedPlayRecords,
} from './cache-manager';
import {
  fetchFromApi,
  fetchWithAuth,
  handleDatabaseOperationFailure,
  invalidateWatchingUpdatesClientCache,
  STORAGE_TYPE,
  triggerGlobalError,
} from './core';
import {
  DEFAULT_PLAY_RECORDS_PAGE_SIZE,
  paginatePlayRecords,
} from '../play-records-pagination';
import { generateStorageKey } from '../storage-key';
import type {
  PlayRecord,
  PlayRecordsPage,
  PlayRecordsPageOptions,
} from '../types';
import { shouldInvalidateWatchingUpdates } from '../watching-updates-invalidation';

// ---- 常量 ----
const PLAY_RECORDS_KEY = 'moontv_play_records';

/**
 * 检查是否应该更新原始集数
 *
 * 设计思路：original_episodes 记录的是"用户上次知道的总集数"
 * 当用户观看了超出原始集数的新集数后，说明用户已经"消费"了这次更新提醒
 * 此时应该更新 original_episodes，这样下次更新才能准确计算新增集数
 *
 * 更新条件（所有条件都必须满足）：
 * 1. 用户观看了超过原始集数的集数（说明看了新更新的内容）
 * 2. 当前总集数比原始集数多（确实有新集数）
 * 3. 用户观看进度有实质性进展（防止误触）
 * 4. 新集数增加量合理（防止API错误数据）
 * 5. 用户观看的新集数超过原始集数至少1集（确保真的看了新内容）
 *
 * 例子：
 * - 第一次看10集 → original_episodes = 10
 * - 更新到15集 → 提醒"5集新增"
 * - 用户看第11集 → original_episodes 更新为 15（用户已消费这次更新）
 * - 下次更新到24集 → 提醒"9集新增"（24-15），而不是"14集新增"（24-10）
 */
function checkShouldUpdateOriginalEpisodes(
  existingRecord: PlayRecord,
  newRecord: PlayRecord,
): boolean {
  const originalEpisodes =
    existingRecord.original_episodes || existingRecord.total_episodes;

  // 条件1：用户观看进度超过原始集数，说明追到了新更新
  const hasWatchedBeyondOriginal = newRecord.index > originalEpisodes;

  // 条件2：当前总集数确实比原始集数多
  const hasMoreEpisodes = newRecord.total_episodes > originalEpisodes;

  // 条件3：用户观看进度有实质性进展（不是刚点进去就退出）
  const hasSignificantProgress = newRecord.play_time > 60; // 观看超过1分钟

  // 条件4：新增集数增量合理，避免接口异常导致大幅跳变
  const episodeIncrement = newRecord.total_episodes - originalEpisodes;
  const reasonableIncrement = episodeIncrement > 0 && episodeIncrement <= 100; // 最多增加100集

  // 条件5：用户观看的新集数至少比原始集数多 1 集
  const watchedNewEpisodes = newRecord.index >= originalEpisodes + 1;

  // 条件6：观看进度与总集数匹配，避免脏数据
  const progressMatches = newRecord.index <= newRecord.total_episodes;

  const shouldUpdate =
    hasWatchedBeyondOriginal &&
    hasMoreEpisodes &&
    hasSignificantProgress &&
    reasonableIncrement &&
    watchedNewEpisodes &&
    progressMatches;

  return shouldUpdate;
}

function preparePlayRecordForSave(
  existingRecord: PlayRecord | undefined,
  record: PlayRecord,
): boolean {
  if (!existingRecord && record.total_episodes > 1) {
    record.original_episodes = record.total_episodes;
  } else if (
    existingRecord &&
    !existingRecord.original_episodes &&
    record.total_episodes > 1
  ) {
    record.original_episodes = record.total_episodes;
  } else if (existingRecord?.original_episodes) {
    const shouldUpdateOriginal = checkShouldUpdateOriginalEpisodes(
      existingRecord,
      record,
    );
    record.original_episodes = shouldUpdateOriginal
      ? record.total_episodes
      : existingRecord.original_episodes;
  }

  return shouldInvalidateWatchingUpdates(existingRecord || null, record);
}

// ---- API ----
/**
 * 读取全部播放记录。
 * 非本地存储模式下使用混合缓存策略：优先返回缓存数据，后台异步同步最新数据。
 * 在服务端渲染阶段 (window === undefined) 时返回空对象，避免报错。
 */
export async function getAllPlayRecords(): Promise<Record<string, PlayRecord>> {
  // 服务器端渲染阶段直接返回空，交由客户端 useEffect 再行请求
  if (typeof window === 'undefined') {
    return {};
  }

  // 数据库存储模式：使用混合缓存策略（包括 redis 和 upstash）
  if (STORAGE_TYPE !== 'localstorage') {
    const username = cacheManager.getCurrentUsername();
    const userKey = getPlayRecordsUserKey(username);
    // 优先从缓存获取数据
    const cachedData = cacheManager.getCachedPlayRecords(username);

    if (cachedData) {
      // 返回缓存数据，同时后台异步更新（使用去重机制）
      cacheManager
        .getOrCreateRequest(`playrecords-background-sync:${userKey}`, () =>
          fetchPlayRecordsSnapshot(username),
        )
        .then(({ data: freshData, revision }) => {
          if (!canCommitPlayRecordsSnapshot(username, revision)) return;

          // 只有数据真正不同时才更新缓存
          if (JSON.stringify(cachedData) !== JSON.stringify(freshData)) {
            cacheManager.cachePlayRecords(freshData, username);
            // 触发数据更新事件，供组件监听
            dispatchPlayRecordsUpdated(freshData, username);
          }
        })
        .catch((err) => {
          console.warn('后台同步播放记录失败:', err);
          triggerGlobalError('后台同步播放记录失败');
        });

      return cachedData;
    } else {
      // 缓存为空，使用去重机制从 API 获取并缓存
      try {
        const { data: freshData, revision } =
          await cacheManager.getOrCreateRequest(
            `playrecords-initial-fetch:${userKey}`,
            () => fetchPlayRecordsSnapshot(username),
          );
        if (!canCommitPlayRecordsSnapshot(username, revision)) {
          return cacheManager.getCachedPlayRecords(username) || {};
        }
        cacheManager.cachePlayRecords(freshData, username);
        return freshData;
      } catch (err) {
        console.error('获取播放记录失败:', err);
        triggerGlobalError('获取播放记录失败');
        return {};
      }
    }
  }

  // localstorage 模式
  try {
    const raw = localStorage.getItem(PLAY_RECORDS_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, PlayRecord>;
  } catch (err) {
    console.error('读取播放记录失败:', err);
    triggerGlobalError('读取播放记录失败');
    return {};
  }
}

export async function getPlayRecordsPage(
  options: PlayRecordsPageOptions = {},
): Promise<PlayRecordsPage> {
  if (typeof window === 'undefined') {
    return paginatePlayRecords({}, options);
  }

  if (STORAGE_TYPE !== 'localstorage') {
    try {
      const params = new URLSearchParams();
      if (options.cursor) {
        params.set('cursor', options.cursor);
      }
      options.includeKeys?.forEach((key) => {
        params.append('includeKey', key);
      });
      params.set(
        'pageSize',
        String(options.pageSize || DEFAULT_PLAY_RECORDS_PAGE_SIZE),
      );

      return await fetchFromApi<PlayRecordsPage>(
        `/api/playrecords?${params.toString()}`,
      );
    } catch (err) {
      console.warn('分页获取播放记录失败:', err);
      triggerGlobalError('分页获取播放记录失败');
      throw err;
    }
  }

  try {
    const raw = localStorage.getItem(PLAY_RECORDS_KEY);
    const records = raw ? (JSON.parse(raw) as Record<string, PlayRecord>) : {};
    return paginatePlayRecords(records, options);
  } catch (err) {
    console.error('分页读取播放记录失败:', err);
    triggerGlobalError('分页读取播放记录失败');
    throw err;
  }
}

/**
 * 保存播放记录。
 * 数据库存储模式下使用乐观更新：先更新缓存（立即生效），再异步同步到数据库。
 * @param existingRecords 可选参数：已有的播放记录，用于避免重复GET请求
 */
export async function savePlayRecord(
  source: string,
  id: string,
  record: PlayRecord,
  existingRecords?: Record<string, PlayRecord>,
): Promise<void> {
  const key = generateStorageKey(source, id);
  const username = cacheManager.getCurrentUsername();

  // 数据库存储模式：乐观更新策略（包括 redis 和 upstash）
  if (STORAGE_TYPE !== 'localstorage') {
    return serializePlayRecordsMutation(username, async () => {
      if (cacheManager.getCurrentUsername() !== username) {
        cacheManager.forceRefreshPlayRecordsCache(username);
        throw new Error('用户已切换，取消保存播放记录');
      }

      const cachedRecords = cacheManager.getCachedPlayRecords(username);
      let existingRecord: PlayRecord | undefined;
      if (cachedRecords) {
        existingRecord = cachedRecords[key];
      } else if (existingRecords) {
        existingRecord = existingRecords[key];
      } else {
        existingRecord = (await getAllPlayRecords())[key];
      }

      if (cacheManager.getCurrentUsername() !== username) {
        cacheManager.forceRefreshPlayRecordsCache(username);
        throw new Error('用户已切换，取消保存播放记录');
      }

      const invalidatesWatchingUpdates = preparePlayRecordForSave(
        existingRecord,
        record,
      );
      beginPlayRecordsCacheMutation(username);
      try {
        const previousCachedRecords = updateCachedPlayRecords(
          username,
          (records) => {
            records[key] = record;
          },
        );

        const response = await fetchWithAuth('/api/playrecords', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ key, record }),
        });
        const result = (await response.json()) as { ignored?: boolean };

        if (result.ignored) {
          if (previousCachedRecords) {
            cacheManager.cachePlayRecords(previousCachedRecords, username);
            dispatchPlayRecordsUpdated(previousCachedRecords, username);
          }
          try {
            await reconcilePlayRecordsCache(username);
          } catch (reconcileError) {
            console.error('刷新被忽略保存后的播放记录失败:', reconcileError);
            triggerGlobalError('刷新播放记录缓存失败');
          }
        }

        if (
          (invalidatesWatchingUpdates || result.ignored) &&
          cacheManager.getCurrentUsername() === username
        ) {
          await invalidateWatchingUpdatesClientCache();
        }
      } catch (err) {
        await handleDatabaseOperationFailure('playRecords', err, username);
        triggerGlobalError('保存播放记录失败');
        throw err;
      } finally {
        finishPlayRecordsCacheMutation(username);
      }
    });
  }

  // 优先使用传入的记录，如果没有则获取
  const existingRecord = existingRecords
    ? existingRecords[key]
    : (await getAllPlayRecords())[key];
  const invalidatesWatchingUpdates = preparePlayRecordForSave(
    existingRecord,
    record,
  );

  // localstorage 模式
  if (typeof window === 'undefined') {
    console.warn('无法在服务端保存播放记录到 localStorage');
    return;
  }

  try {
    const allRecords = await getAllPlayRecords();
    allRecords[key] = record;
    localStorage.setItem(PLAY_RECORDS_KEY, JSON.stringify(allRecords));
    window.dispatchEvent(
      new CustomEvent('playRecordsUpdated', {
        detail: allRecords,
      }),
    );

    if (invalidatesWatchingUpdates) {
      await invalidateWatchingUpdatesClientCache();
    }

    // 播放记录保存已经包含了统计更新逻辑，无需单独调用
  } catch (err) {
    console.error('保存播放记录失败:', err);
    triggerGlobalError('保存播放记录失败');
    throw err;
  }
}

/**
 * 删除播放记录。
 * 数据库存储模式下使用乐观更新：先更新缓存，再异步同步到数据库。
 */
export async function deletePlayRecord(
  source: string,
  id: string,
): Promise<void> {
  const key = generateStorageKey(source, id);
  const username = cacheManager.getCurrentUsername();

  // 数据库存储模式：乐观更新策略（包括 redis 和 upstash）
  if (STORAGE_TYPE !== 'localstorage') {
    return serializePlayRecordsMutation(username, async () => {
      if (cacheManager.getCurrentUsername() !== username) {
        cacheManager.forceRefreshPlayRecordsCache(username);
        throw new Error('用户已切换，取消删除播放记录');
      }

      beginPlayRecordsCacheMutation(username);
      try {
        updateCachedPlayRecords(username, (records) => {
          delete records[key];
        });

        await fetchWithAuth(`/api/playrecords?key=${encodeURIComponent(key)}`, {
          method: 'DELETE',
        });
        if (cacheManager.getCurrentUsername() === username) {
          await invalidateWatchingUpdatesClientCache();
        }
      } catch (err) {
        await handleDatabaseOperationFailure('playRecords', err, username);
        triggerGlobalError('删除播放记录失败');
        throw err;
      } finally {
        finishPlayRecordsCacheMutation(username);
      }
    });
  }

  // localstorage 模式
  if (typeof window === 'undefined') {
    console.warn('无法在服务端删除播放记录到 localStorage');
    return;
  }

  try {
    const allRecords = await getAllPlayRecords();
    delete allRecords[key];
    localStorage.setItem(PLAY_RECORDS_KEY, JSON.stringify(allRecords));
    window.dispatchEvent(
      new CustomEvent('playRecordsUpdated', {
        detail: allRecords,
      }),
    );
    await invalidateWatchingUpdatesClientCache();
  } catch (err) {
    console.error('删除播放记录失败:', err);
    triggerGlobalError('删除播放记录失败');
    throw err;
  }
}

/**
 * 清空全部播放记录
 * 数据库存储模式下使用乐观更新：先更新缓存，再异步同步到数据库。
 */
export async function clearAllPlayRecords(): Promise<void> {
  // 数据库存储模式：乐观更新策略（包括 redis 和 upstash）
  if (STORAGE_TYPE !== 'localstorage') {
    const username = cacheManager.getCurrentUsername();
    return serializePlayRecordsMutation(username, async () => {
      if (cacheManager.getCurrentUsername() !== username) {
        cacheManager.forceRefreshPlayRecordsCache(username);
        throw new Error('用户已切换，取消清空播放记录');
      }

      beginPlayRecordsCacheMutation(username);
      try {
        cacheManager.cachePlayRecords({}, username);
        dispatchPlayRecordsUpdated({}, username);

        await fetchWithAuth(`/api/playrecords`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
        });
        if (cacheManager.getCurrentUsername() === username) {
          await invalidateWatchingUpdatesClientCache();
        }
      } catch (err) {
        await handleDatabaseOperationFailure('playRecords', err, username);
        triggerGlobalError('清空播放记录失败');
        throw err;
      } finally {
        finishPlayRecordsCacheMutation(username);
      }
    });
  }

  // localStorage 模式
  if (typeof window === 'undefined') return;
  localStorage.removeItem(PLAY_RECORDS_KEY);
  window.dispatchEvent(
    new CustomEvent('playRecordsUpdated', {
      detail: {},
    }),
  );
  await invalidateWatchingUpdatesClientCache();
}
