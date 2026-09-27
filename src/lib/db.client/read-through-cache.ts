'use client';

import { cacheManager } from './cache-manager';

/**
 * “缓存优先 + 后台同步 + JSON.stringify 深比较”读取块的泛型工厂。
 *
 * 各领域块存在刻意保留的差异，通过配置注入而非内部分支：
 * - 背景同步/初始拉取的去重键：传 null 表示跳过去重直接请求（skip-configs 现状）
 * - 事件派发、失败文案：由调用方注入，保持各自 console 与全局错误语义
 * - 失败后的返回策略（return 默认值 / 抛出）：工厂统一 rethrow，调用点自行 catch
 *
 * play-records（revision 门禁 + snapshot 拉取）与 user-stats（forceRefresh
 * 双条件 + 失败回退本地计算）语义差异过大，未并入本工厂。
 */
interface ReadThroughCacheConfig<T> {
  readCache: () => T | null;
  writeCache: (data: T) => void;
  fetchFromServer: () => Promise<T>;
  backgroundSyncKey: string | null;
  initialFetchKey: string | null;
  dispatchUpdated: (data: T) => void;
  warnSyncFailure: (err: unknown) => void;
  handleFetchFailure: (err: unknown) => void;
}

async function readThroughCache<T>(
  config: ReadThroughCacheConfig<T>,
): Promise<T> {
  const cachedData = config.readCache();

  if (cachedData) {
    // 返回缓存数据，同时后台异步更新
    const backgroundSyncKey = config.backgroundSyncKey;
    const schedule = backgroundSyncKey
      ? (fetch: () => Promise<T>) =>
          cacheManager.getOrCreateRequest(backgroundSyncKey, fetch)
      : (fetch: () => Promise<T>) => fetch();

    schedule(config.fetchFromServer)
      .then((freshData) => {
        // 只有数据真正不同时才更新缓存
        if (JSON.stringify(cachedData) !== JSON.stringify(freshData)) {
          config.writeCache(freshData);
          // 触发数据更新事件
          config.dispatchUpdated(freshData);
        }
      })
      .catch((err) => config.warnSyncFailure(err));

    return cachedData;
  }

  // 缓存为空，从 API 获取并缓存
  try {
    const freshData = config.initialFetchKey
      ? await cacheManager.getOrCreateRequest(
          config.initialFetchKey,
          config.fetchFromServer,
        )
      : await config.fetchFromServer();
    config.writeCache(freshData);
    return freshData;
  } catch (err) {
    config.handleFetchFailure(err);
    throw err;
  }
}

export { readThroughCache };
export type { ReadThroughCacheConfig };
