/* eslint-disable no-console, @typescript-eslint/no-explicit-any, @typescript-eslint/no-empty-function */
'use client';

/**
 * 仅在浏览器端使用的数据库工具，目前基于 localStorage 实现。
 * 之所以单独拆分文件，是为了避免在客户端 bundle 中引入 `fs`, `path` 等 Node.js 内置模块，
 * 从而解决诸如 "Module not found: Can't resolve 'fs'" 的问题。
 *
 * 功能：
 * 1. 获取全部播放记录（getAllPlayRecords）。
 * 2. 保存播放记录（savePlayRecord）。
 * 3. 数据库存储模式下的混合缓存策略，提升用户体验。
 *
 * 具体实现按领域拆分至 `src/lib/db.client/` 目录（本文件仅作为桶文件转发导出）：
 * - core.ts：全局错误触发、STORAGE_TYPE 探测、fetchWithAuth/fetchFromApi、
 *   数据库操作失败补偿（handleDatabaseOperationFailure）。
 * - cache-manager.ts：HybridCacheManager、内存缓存、播放记录并发控制（revision/写队列）
 *   与缓存维护 API。
 * - play-records.ts / favorites.ts / search-history.ts / skip-configs.ts / user-stats.ts：
 *   各业务领域的读写 API。
 *
 * 如后续需要在客户端读取收藏等其它数据，可按同样方式在 db.client/ 目录中补充实现。
 */

// 重新导出类型以保持API兼容性
export type { Favorite, UserStats } from './db.client/core';
export { generateStorageKey, parseStorageKey } from './storage-key';
export type { EpisodeSkipConfig, PlayRecord, SkipSegment } from './types';

// ---- 缓存维护 ----
export type { CacheUpdateEvent } from './db.client/cache-manager';
export {
  clearUserCache,
  forceRefreshPlayRecordsCache,
  getCacheStatus,
  preloadUserData,
  refreshAllCache,
  subscribeToDataUpdates,
} from './db.client/cache-manager';

// ---- 播放记录 ----
export {
  clearAllPlayRecords,
  deletePlayRecord,
  getAllPlayRecords,
  getPlayRecordsPage,
  savePlayRecord,
} from './db.client/play-records';

// ---- 收藏 ----
export {
  clearAllFavorites,
  deleteFavorite,
  getAllFavorites,
  isFavorited,
  saveFavorite,
} from './db.client/favorites';

// ---- 搜索历史 ----
export {
  addSearchHistory,
  clearSearchHistory,
  deleteSearchHistory,
  getSearchHistory,
} from './db.client/search-history';

// ---- 跳过片头片尾配置 ----
export {
  deleteSkipConfig,
  getAllSkipConfigs,
  getSkipConfig,
  saveSkipConfig,
} from './db.client/skip-configs';

// ---- 用户统计 ----
export {
  calculateRegistrationDays,
  clearUserStats,
  getUserStats,
  updateUserStats,
} from './db.client/user-stats';
