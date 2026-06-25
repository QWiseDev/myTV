import { db } from './db';

// 格式化字节大小
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

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

      const allCacheKeys = await db.keys('cache:*');


      if (allCacheKeys.length === 0) {
        return stats;
      }

      const values = await Promise.all(
        allCacheKeys.map(async (fullKey) => {
          try {
            return await db.getCache(fullKey.replace(/^cache:/, ''));
          } catch (error) {
            console.warn(`获取缓存键 ${fullKey} 失败:`, error);
            return null;
          }
        })
      );

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
          key === 'lunatv_danmu_cache'
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
    type: 'douban' | 'tmdb' | 'danmu' | 'netdisk' | 'youtube'
  ): Promise<number> {
    let clearedCount = 0;

    try {
      switch (type) {
        case 'douban':
          await db.clearExpiredCache('douban-');
          break;
        case 'tmdb':
          await db.clearExpiredCache('tmdb-');
          // 清理localStorage中的TMDB缓存（兜底）
          if (typeof localStorage !== 'undefined') {
            const keys = Object.keys(localStorage).filter((key) =>
              key.startsWith('tmdb-')
            );
            keys.forEach((key) => {
              localStorage.removeItem(key);
              clearedCount++;
            });
          }
          break;
        case 'danmu':
          await db.clearExpiredCache('danmu-cache');
          break;
        case 'netdisk':
          await db.clearExpiredCache('netdisk-search');
          // 清理localStorage中的网盘缓存（兜底）
          if (typeof localStorage !== 'undefined') {
            const keys = Object.keys(localStorage).filter((key) =>
              key.startsWith('netdisk-search')
            );
            keys.forEach((key) => {
              localStorage.removeItem(key);
              clearedCount++;
            });
          }
          break;
        case 'youtube':
          await db.clearExpiredCache('youtube-search');
          // 清理localStorage中的YouTube缓存（兜底）
          if (typeof localStorage !== 'undefined') {
            const keys = Object.keys(localStorage).filter((key) =>
              key.startsWith('youtube-search')
            );
            keys.forEach((key) => {
              localStorage.removeItem(key);
              clearedCount++;
            });
          }
          break;
      }

      // 由于clearExpiredCache不返回数量，我们无法精确统计
      clearedCount = 1; // 标记操作已执行
    } catch (error) {
      console.error(`清理${type}缓存失败:`, error);
    }

    return clearedCount;
  }

  // 清理所有过期缓存
  static async clearExpiredCache(): Promise<number> {
    try {
      await db.clearExpiredCache();
      return 1; // 标记操作已执行
    } catch (error) {
      console.error('清理过期缓存失败:', error);
      return 0;
    }
  }
}
