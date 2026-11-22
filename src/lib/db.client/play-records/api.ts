/* eslint-disable no-console, @typescript-eslint/no-explicit-any */
'use client';

import { dispatchPlayRecordsUpdated } from './events';
import {
  type MutationReconciliation,
  applyOptimisticPlayRecordsMutation,
  commitAuthoritativePlayRecords,
  commitExternalPlayRecordsRead,
  commitOptimisticPlayRecordsClear,
  enqueuePlayRecordsMutation,
  getCurrentPlayRecordsUsername,
  getOrCreatePlayRecordsRead,
  getPlayRecordsPendingMutations,
  getPlayRecordsQueueTail,
  getPlayRecordsStoreRevision,
  getValidPlayRecordsSnapshot,
  invalidatePlayRecordsSnapshot,
  PlayRecordsMutationError,
  restorePlayRecordsSnapshot,
} from './store';
import {
  fetchFromApi,
  fetchWithAuth,
  invalidateWatchingUpdatesClientCache,
  triggerGlobalError,
} from '../core';
import { findCrossKeySameShowRecords } from '../../play-record-merge';
import {
  DEFAULT_PLAY_RECORDS_PAGE_SIZE,
  paginatePlayRecords,
} from '../../play-records-pagination';
import { generateStorageKey } from '../../storage-key';
import type {
  PlayRecord,
  PlayRecordsPage,
  PlayRecordsPageOptions,
} from '../../types';
import { shouldInvalidateWatchingUpdates } from '../../watching-updates-invalidation';

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

  // 条件1：用户观看进度超过原始集数，说明用户追到了新更新
  const hasWatchedBeyondOriginal = newRecord.index > originalEpisodes;

  // 条件2：当前总集数确实比原始集数多
  const hasMoreEpisodes = newRecord.total_episodes > originalEpisodes;

  // 条件3：用户观看进度有实质性进展（不是刚点进去就退出）
  const hasSignificantProgress = newRecord.play_time > 60; // 观看超过1分钟

  // 条件4：新增集数增量合理，避免接口异常导致大幅跳变
  const episodeIncrement = newRecord.total_episodes - originalEpisodes;
  const reasonableIncrement = episodeIncrement > 0 && episodeIncrement <= 100; // 最多增加100集

  // 条件5：用户观看的新集数至少比原始集数多 1 集（确保真的看了新内容）
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

// ---- 内部权威读取 ----

/**
 * 内部权威读取：直接、可抛错（禁止把 public API 降级返回的 {} 当作服务器确认空数据）。
 */
async function fetchAuthoritativePlayRecords(): Promise<
  Record<string, PlayRecord>
> {
  return fetchFromApi<Record<string, PlayRecord>>(`/api/playrecords`);
}

/**
 * 写队列任务内的权威补偿读取：具有队列独占执行权，提交不受 pending 门禁限制。
 * 身份变化时使旧用户快照失效并返回 null（不抛错，保持 ignored 补偿的 resolve 语义）。
 */
async function reconcilePlayRecordsWithinTask(
  username: string | null,
): Promise<Record<string, PlayRecord> | null> {
  if (getCurrentPlayRecordsUsername() !== username) {
    invalidatePlayRecordsSnapshot(username);
    return null;
  }

  let data: Record<string, PlayRecord>;
  try {
    data = await fetchAuthoritativePlayRecords();
  } catch (error) {
    // 补偿读取失败必须使缓存失效，不能继续把乐观快照当有效结果
    invalidatePlayRecordsSnapshot(username);
    throw error;
  }
  const result = commitAuthoritativePlayRecords(username, data);
  if (result === 'committed') {
    dispatchPlayRecordsUpdated(data, username);
  }
  return data;
}

/**
 * 写失败后的队列内补偿：执行一次完整权威读取供 hook 消费（不变量见方案 4.5）。
 * 补偿读取失败必须使缓存失效，且不把原写失败静默改成成功。
 */
async function compensatePlayRecords(
  username: string | null,
): Promise<MutationReconciliation> {
  if (getCurrentPlayRecordsUsername() !== username) {
    invalidatePlayRecordsSnapshot(username);
    return { kind: 'cancelled' };
  }

  try {
    const records = await reconcilePlayRecordsWithinTask(username);
    if (!records) {
      return { kind: 'cancelled' };
    }
    return { kind: 'confirmed', username, revision: 0, records };
  } catch {
    invalidatePlayRecordsSnapshot(username);
    return { kind: 'unconfirmed' };
  }
}

function assertSameUser(
  username: string | null,
  action: '保存' | '删除' | '清空',
): void {
  if (getCurrentPlayRecordsUsername() !== username) {
    invalidatePlayRecordsSnapshot(username);
    throw new PlayRecordsMutationError(`用户已切换，取消${action}播放记录`, {
      kind: 'cancelled',
    });
  }
}

function toMutationErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * 后台同步播放记录快照：去重提交，与提交时快照比较，数据不同才派发事件。
 */
function scheduleBackgroundPlayRecordsSync(username: string | null): void {
  getOrCreatePlayRecordsRead(username, () =>
    fetchFromApi<Record<string, PlayRecord>>(`/api/playrecords`),
  )
    .then(({ data, revision }) => {
      const result = commitExternalPlayRecordsRead(username, revision, data);
      if (result === 'committed') {
        dispatchPlayRecordsUpdated(data, username);
      }
    })
    .catch((err) => {
      console.warn('后台同步播放记录失败:', err);
      triggerGlobalError('后台同步播放记录失败');
    });
}

// ---- API ----
/**
 * 读取全部播放记录。
 * 使用完整快照策略：优先返回有效快照，无 pending 写时后台异步同步最新数据。
 * 在服务端渲染阶段 (window === undefined) 时返回空对象，避免报错。
 */
export async function getAllPlayRecords(): Promise<Record<string, PlayRecord>> {
  // 服务器端渲染阶段直接返回空，交由客户端 useEffect 再行请求
  if (typeof window === 'undefined') {
    return {};
  }

  // 访客（未登录）无播放记录，直接返回空，避免 401 触发跳登录
  if (!getCurrentPlayRecordsUsername()) {
    return {};
  }

  const username = getCurrentPlayRecordsUsername();
  const validSnapshot = getValidPlayRecordsSnapshot(username);

  if (validSnapshot) {
    // 有 pending 写时不再触发后台刷新，完整快照可供乐观展示（方案 4.3）
    if (getPlayRecordsPendingMutations(username) === 0) {
      scheduleBackgroundPlayRecordsSync(username);
    }
    return validSnapshot.data;
  }

  // cold 且存在 pending 写：等待已排队写完成后重新判断，避免读取越过写队列
  if (getPlayRecordsPendingMutations(username) > 0) {
    await getPlayRecordsQueueTail(username);
    const settledSnapshot = getValidPlayRecordsSnapshot(username);
    if (settledSnapshot) {
      if (getPlayRecordsPendingMutations(username) === 0) {
        scheduleBackgroundPlayRecordsSync(username);
      }
      return settledSnapshot.data;
    }
  }

  // 缓存为空，使用去重机制从 API 获取并缓存
  try {
    const { data, revision } = await getOrCreatePlayRecordsRead(username, () =>
      fetchFromApi<Record<string, PlayRecord>>(`/api/playrecords`),
    );
    const result = commitExternalPlayRecordsRead(username, revision, data);
    if (result === 'stale') {
      return getValidPlayRecordsSnapshot(username)?.data ?? {};
    }
    return data;
  } catch (err) {
    console.error('获取播放记录失败:', err);
    triggerGlobalError('获取播放记录失败');
    return {};
  }
}

export async function getPlayRecordsPage(
  options: PlayRecordsPageOptions = {},
): Promise<PlayRecordsPage> {
  if (typeof window === 'undefined') {
    return paginatePlayRecords({}, options);
  }

  // 访客（未登录）无播放记录，直接返回空页，避免 401 触发跳登录
  if (!getCurrentPlayRecordsUsername()) {
    return paginatePlayRecords({}, options);
  }

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

/**
 * 保存播放记录。
 * 使用乐观更新策略：先更新完整快照（立即生效），再异步同步到数据库。
 * @param existingRecords 可选参数：已有的播放记录，用于避免重复GET请求（部分数据不会写入缓存）
 */
export async function savePlayRecord(
  source: string,
  id: string,
  record: PlayRecord,
  existingRecords?: Record<string, PlayRecord>,
): Promise<void> {
  // 访客（未登录）不保存播放记录
  if (typeof window !== 'undefined' && !getCurrentPlayRecordsUsername()) {
    return;
  }

  const key = generateStorageKey(source, id);
  const username = getCurrentPlayRecordsUsername();

  // 乐观更新策略
  return enqueuePlayRecordsMutation(username, async () => {
    assertSameUser(username, '保存');

    try {
      const cachedRecords = getValidPlayRecordsSnapshot(username);
      let existingRecord: PlayRecord | undefined;
      if (cachedRecords) {
        existingRecord = cachedRecords.data[key];
      } else if (existingRecords) {
        existingRecord = existingRecords[key];
      } else {
        // 内部预读：直接、可抛错的权威读取，禁止等待自身所在队列；
        // 预读失败同样视为本次保存失败并走统一补偿（禁止把失败读取降级为“记录不存在”）
        existingRecord = (await fetchAuthoritativePlayRecords())[key];
      }

      assertSameUser(username, '保存');

      const invalidatesWatchingUpdates = preparePlayRecordForSave(
        existingRecord,
        record,
      );

      const applied = applyOptimisticPlayRecordsMutation(
        username,
        (records) => {
          records[key] = record;
          // 镜像服务端跨源同名合并：乐观快照里同步移除旧源记录，避免界面残留
          for (const target of findCrossKeySameShowRecords(
            record,
            key,
            records,
          )) {
            delete records[target.key];
          }
        },
      );
      if (applied) {
        dispatchPlayRecordsUpdated(applied.next.data, username);
      }

      const response = await fetchWithAuth('/api/playrecords', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ key, record }),
      });
      const result = (await response.json()) as { ignored?: boolean };

      if (result.ignored) {
        if (applied) {
          restorePlayRecordsSnapshot(username, applied.previous);
          dispatchPlayRecordsUpdated(applied.previous.data, username);
        }
        try {
          await reconcilePlayRecordsWithinTask(username);
        } catch (reconcileError) {
          console.error('刷新被忽略保存后的播放记录失败:', reconcileError);
          triggerGlobalError('刷新播放记录缓存失败');
        }
      }

      if (
        (invalidatesWatchingUpdates || result.ignored) &&
        getCurrentPlayRecordsUsername() === username
      ) {
        await invalidateWatchingUpdatesClientCache();
      }
    } catch (err) {
      const reconciliation = await compensatePlayRecords(username);
      triggerGlobalError('保存播放记录失败');
      throw new PlayRecordsMutationError(
        toMutationErrorMessage(err),
        reconciliation,
        err,
      );
    }
  });
}

/**
 * 删除播放记录。
 * 使用乐观更新策略：先更新完整快照，再异步同步到数据库；
 * 失败时在队列内执行一次权威补偿读取（结果附着在 PlayRecordsMutationError 上），并仍然 reject。
 */
export async function deletePlayRecord(
  source: string,
  id: string,
): Promise<void> {
  // 访客（未登录）无播放记录可删除
  if (typeof window !== 'undefined' && !getCurrentPlayRecordsUsername()) {
    return;
  }

  const key = generateStorageKey(source, id);
  const username = getCurrentPlayRecordsUsername();

  // 乐观更新策略
  return enqueuePlayRecordsMutation(username, async () => {
    assertSameUser(username, '删除');

    const applied = applyOptimisticPlayRecordsMutation(username, (records) => {
      delete records[key];
    });
    if (applied) {
      dispatchPlayRecordsUpdated(applied.next.data, username);
    }

    try {
      await fetchWithAuth(`/api/playrecords?key=${encodeURIComponent(key)}`, {
        method: 'DELETE',
      });
      if (getCurrentPlayRecordsUsername() === username) {
        await invalidateWatchingUpdatesClientCache();
      }
    } catch (err) {
      const reconciliation = await compensatePlayRecords(username);
      triggerGlobalError('删除播放记录失败');
      throw new PlayRecordsMutationError(
        toMutationErrorMessage(err),
        reconciliation,
        err,
      );
    }
  });
}

/**
 * 清空全部播放记录
 * 使用乐观更新策略：先更新完整快照，再异步同步到数据库；
 * 失败时在队列内执行一次权威补偿读取（结果附着在 PlayRecordsMutationError 上），并仍然 reject。
 */
export async function clearAllPlayRecords(): Promise<void> {
  // 访客（未登录）无播放记录可清空
  if (typeof window !== 'undefined' && !getCurrentPlayRecordsUsername()) {
    return;
  }

  const username = getCurrentPlayRecordsUsername();

  // 乐观更新策略
  return enqueuePlayRecordsMutation(username, async () => {
    assertSameUser(username, '清空');

    commitOptimisticPlayRecordsClear(username);
    dispatchPlayRecordsUpdated({}, username);

    try {
      await fetchWithAuth(`/api/playrecords`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      });
      if (getCurrentPlayRecordsUsername() === username) {
        await invalidateWatchingUpdatesClientCache();
      }
    } catch (err) {
      const reconciliation = await compensatePlayRecords(username);
      triggerGlobalError('清空播放记录失败');
      throw new PlayRecordsMutationError(
        toMutationErrorMessage(err),
        reconciliation,
        err,
      );
    }
  });
}

// ---- 供新 hook / 维护入口使用的内部入口（不作为产品公共 API）----

export type PlayRecordsAuthoritativeSnapshot = {
  username: string | null;
  revision: number;
  records: Record<string, PlayRecord>;
};

/**
 * 手工 retry 使用的权威读取：排到写队列之后执行，不重复发送写请求。
 * 抛错（含用户切换取消）由调用方消费。
 */
export async function reconcilePlayRecordsAuthoritative(): Promise<PlayRecordsAuthoritativeSnapshot> {
  // 访客（未登录）无播放记录可核实
  if (typeof window !== 'undefined' && !getCurrentPlayRecordsUsername()) {
    return { username: null, revision: 0, records: {} };
  }

  const username = getCurrentPlayRecordsUsername();
  return enqueuePlayRecordsMutation(username, async () => {
    if (getCurrentPlayRecordsUsername() !== username) {
      invalidatePlayRecordsSnapshot(username);
      throw new PlayRecordsMutationError('用户已切换，取消播放记录核实', {
        kind: 'cancelled',
      });
    }

    const records = await fetchAuthoritativePlayRecords();
    const result = commitAuthoritativePlayRecords(username, records);
    if (result === 'committed') {
      dispatchPlayRecordsUpdated(records, username);
    }
    return {
      username,
      revision: getPlayRecordsStoreRevision(username),
      records,
    };
  });
}

export { getPlayRecordsStoreRevision };
export { PlayRecordsMutationError };
export type { MutationReconciliation as PlayRecordsReconciliationResult };

/** 当前用户的 store revision（供 hook 做 receipt 时效校验） */
export function getPlayRecordsRevision(): number {
  return getPlayRecordsStoreRevision(getCurrentPlayRecordsUsername());
}

/**
 * 兼容入口：供 core.handleDatabaseOperationFailure('playRecords') 委托统一补偿。
 * 语义与旧 reconcilePlayRecordsCache 一致：成功返回 true，身份变化返回 false，读取失败抛错。
 */
export async function reconcilePlayRecordsForExternalCaller(
  username: string | null,
): Promise<boolean> {
  // 访客（未登录）无播放记录可补偿
  if (typeof window !== 'undefined' && !getCurrentPlayRecordsUsername()) {
    return false;
  }

  if (getCurrentPlayRecordsUsername() !== username) {
    invalidatePlayRecordsSnapshot(username);
    return false;
  }

  try {
    const records = await reconcilePlayRecordsWithinTask(username);
    return records !== null;
  } catch (error) {
    invalidatePlayRecordsSnapshot(username);
    throw error;
  }
}

/** 供维护入口（forceRefresh / clearUserCache / 失效补偿）使用 */
export { invalidatePlayRecordsSnapshot as invalidatePlayRecordsStore };
