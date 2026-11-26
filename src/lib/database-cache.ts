import { db } from './db';

// 格式化字节大小
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

const CACHE_STATS_BATCH_SIZE = 20;
const MAX_INSPECTED_CACHE_KEYS = 2000;

// 数据库缓存统计和管理模块
export class DatabaseCacheManager {
  // 获取Redis兼容数据库中的缓存统计（支持KVRocks、Upstash、Redis）
  static async getKVRocksCacheStats() {
    const stats = {
      douban: { count: 0, size: 0, types: {} as Record<string, number> },
      tmdb: { count: 0, size: 0, types: {} as Record<string, number> },
      danmu: { count: 0, size: 0 },
      netdisk: { count: 0, size: 0 },
      youtube: { count: 0, size: 0 },
      total: { count: 0, size: 0 },
    };

    try {
      const allCacheKeys = (await db.keys('cache:*')).slice(
        0,
        MAX_INSPECTED_CACHE_KEYS,
      );

      if (allCacheKeys.length === 0) {
        return stats;
      }

      const values: unknown[] = [];
      for (let i = 0; i < allCacheKeys.length; i += CACHE_STATS_BATCH_SIZE) {
        const batchKeys = allCacheKeys.slice(i, i + CACHE_STATS_BATCH_SIZE);
        const batchValues = await Promise.all(
          batchKeys.map(async (fullKey) => {
            try {
              return await db.getCache(fullKey.replace(/^cache:/, ''));
            } catch (error) {
              console.warn(`获取缓存键 ${fullKey} 失败:`, error);
              return null;
            }
          }),
        );
        values.push(...batchValues);
      }

      allCacheKeys.forEach((fullKey: string, idx: number) => {
        const key = fullKey.replace('cache:', ''); // 移除前缀
        const data = values[idx];
        if (!data) return;

        // 计算数据大小 - 智能处理不同数据类型
        let size = 0;
        if (typeof data === 'string') {
          size = data.length;
        } else if (typeof data === 'object' && data !== null) {
          // 如果是对象，序列化后计算大小
          size = JSON.stringify(data).length;
        } else {
          size = String(data).length;
        }

        if (key.startsWith('douban-')) {
          stats.douban.count++;
          stats.douban.size += size;

          const type = key.split('-')[1];
          stats.douban.types[type] = (stats.douban.types[type] || 0) + 1;
        } else if (key.startsWith('tmdb-')) {
          stats.tmdb.count++;
          stats.tmdb.size += size;

          const type = key.split('-')[1];
          stats.tmdb.types[type] = (stats.tmdb.types[type] || 0) + 1;
        } else if (
          key.startsWith('danmu-cache') ||
          key.startsWith('danmaku-shared-sel:') ||
          key === 'lunatv_danmu_cache'
        ) {
          stats.danmu.count++;
          stats.danmu.size += size;
        } else if (key.startsWith('netdisk-search')) {
          stats.netdisk.count++;
          stats.netdisk.size += size;
        } else if (key.startsWith('youtube-search')) {
          stats.youtube.count++;
          stats.youtube.size += size;
        }
        // 移除了search和other分类，只统计明确的缓存类型

        stats.total.count++;
        stats.total.size += size;
      });

      return stats;
    } catch (error) {
      console.error('Redis缓存统计失败:', error);
      return null;
    }
  }

  // 获取缓存统计信息（支持KVRocks/Upstash/Redis，localStorage作为备用）
  static async getSimpleCacheStats() {
    // 从 Redis兼容数据库 获取统计（支持KVRocks、Upstash、Redis）
    const redisStats = await DatabaseCacheManager.getKVRocksCacheStats();
    if (redisStats) {
      return {
        ...redisStats,
        timestamp: new Date().toISOString(),
        source: 'redis-database',
        note: '数据来源：Redis兼容数据库（KVRocks/Upstash/Redis）',
        formattedSizes: {
          douban: formatBytes(redisStats.douban.size),
          tmdb: formatBytes(redisStats.tmdb.size),
          danmu: formatBytes(redisStats.danmu.size),
          netdisk: formatBytes(redisStats.netdisk.size),
          youtube: formatBytes(redisStats.youtube.size),
          total: formatBytes(redisStats.total.size),
        },
      };
    }

    // 如果 Redis数据库 不可用，使用 localStorage 作为备用
    const stats = {
      douban: { count: 0, size: 0, types: {} as Record<string, number> },
      tmdb: { count: 0, size: 0, types: {} as Record<string, number> },
      danmu: { count: 0, size: 0 },
      netdisk: { count: 0, size: 0 },
      youtube: { count: 0, size: 0 },
      total: { count: 0, size: 0 },
    };

    // 从localStorage统计（备用数据源）
    if (typeof localStorage !== 'undefined') {
      const keys = Object.keys(localStorage).filter(
        (key) =>
          key.startsWith('douban-') ||
          key.startsWith('tmdb-') ||
          key.startsWith('danmu-cache') ||
          key.startsWith('netdisk-search') ||
          key.startsWith('youtube-search') ||
          key.startsWith('search-') ||
          key.startsWith('cache-') ||
          key === 'lunatv_danmu_cache',
      );

      keys.forEach((key) => {
        const data = localStorage.getItem(key);
        if (!data) return;

        const size = data.length;

        if (key.startsWith('douban-')) {
          stats.douban.count++;
          stats.douban.size += size;

          const type = key.split('-')[1];
          stats.douban.types[type] = (stats.douban.types[type] || 0) + 1;
        } else if (key.startsWith('tmdb-')) {
          stats.tmdb.count++;
          stats.tmdb.size += size;

          const type = key.split('-')[1];
          stats.tmdb.types[type] = (stats.tmdb.types[type] || 0) + 1;
        } else if (
          key.startsWith('danmu-cache') ||
          key.startsWith('danmaku-shared-sel:') ||
          key === 'lunatv_danmu_cache'
        ) {
          stats.danmu.count++;
          stats.danmu.size += size;
        } else if (key.startsWith('netdisk-search')) {
          stats.netdisk.count++;
          stats.netdisk.size += size;
        } else if (key.startsWith('youtube-search')) {
          stats.youtube.count++;
          stats.youtube.size += size;
        }
        // 移除了search和other分类，只统计明确的缓存类型

        stats.total.count++;
        stats.total.size += size;
      });
    }

    return {
      ...stats,
      timestamp: new Date().toISOString(),
      source: 'localStorage-fallback',
      note: 'Redis数据库不可用，使用localStorage作为备用数据源',
      formattedSizes: {
        douban: formatBytes(stats.douban.size),
        tmdb: formatBytes(stats.tmdb.size),
        danmu: formatBytes(stats.danmu.size),
        netdisk: formatBytes(stats.netdisk.size),
        youtube: formatBytes(stats.youtube.size),
        total: formatBytes(stats.total.size),
      },
    };
  }

  // 清理指定类型的缓存
  static async clearCacheByType(
    type: 'douban' | 'tmdb' | 'danmu' | 'netdisk' | 'youtube',
  ): Promise<number> {
    let clearedCount = 0;

    try {
      const prefixByType: Record<typeof type, string> = {
        douban: 'douban-',
        tmdb: 'tmdb-',
        danmu: 'danmu-cache',
        netdisk: 'netdisk-search',
        youtube: 'youtube-search',
      };
      const prefix = prefixByType[type];
      const matchingKeys = await db.keys(`cache:${prefix}*`);
      await db.clearExpiredCache(prefix);
      clearedCount += matchingKeys.length;

      if (type === 'danmu') {
        const sharedKeys = await db.keys('cache:danmaku-shared-sel:*');
        if (sharedKeys.length > 0) {
          await db.clearExpiredCache('danmaku-shared-sel:');
          clearedCount += sharedKeys.length;
        }
        if (typeof localStorage !== 'undefined') {
          if (localStorage.getItem('lunatv_danmu_cache') !== null) {
            localStorage.removeItem('lunatv_danmu_cache');
            clearedCount++;
          }
        }
      }

      if (
        (type === 'tmdb' || type === 'netdisk' || type === 'youtube') &&
        typeof localStorage !== 'undefined'
      ) {
        const keys = Object.keys(localStorage).filter((key) =>
          key.startsWith(prefix),
        );
        keys.forEach((key) => {
          localStorage.removeItem(key);
          clearedCount++;
        });
      }
    } catch (error) {
      console.error(`清理${type}缓存失败:`, error);
    }

    return clearedCount;
  }

  // 清理所有过期缓存
  static async clearExpiredCache(): Promise<number> {
    try {
      const existingKeys = await db.keys('cache:*');
      await db.clearExpiredCache();
      return existingKeys.length;
    } catch (error) {
      console.error('清理过期缓存失败:', error);
      return 0;
    }
  }
}
