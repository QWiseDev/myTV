/* eslint-disable no-console, @typescript-eslint/no-explicit-any */

import { AccessLog } from './access-log';

/**
 * 访问日志存储的实用函数方法
 * 为各种存储后端提供统一的访问日志实现
 */
export const AccessLogStorageMethods = {
  /**
   * 生成访问日志存储key
   */
  accessLogKey: (entryId: string) => `al:${entryId}`, // access-log
  accessLogIndexKey: (date: string, username?: string) =>
    username ? `al:index:${date}:${username}` : `al:index:${date}`, // 按日期+用户索引
  accessLogActionIndexKey: (action: string, date: string) => `al:action:${action}:${date}`,

  generateEntryId: () => `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,

  /**
   * 将访问日志对象转换为适合存储格式的字符串
   */
  serializeAccessLog: (log: AccessLog): string => JSON.stringify(log),

  /**
   * 将存储字符串/对象转换为访问日志对象
   * 支持Upstash可能返回对象或字符串的情况
   */
  deserializeAccessLog: (data: any): AccessLog | null => {
    try {
      // 如果已经是对象，直接使用
      let parsed = data;
      // 如果是字符串，解析为对象
      if (typeof data === 'string') {
        try {
          parsed = JSON.parse(data);
        } catch (parseError) {
          console.warn('[AccessLogStorage] JSON解析失败，数据可能已损坏:', data);
          return null;
        }
      }

      // 验证必要字段
      if (parsed && typeof parsed === 'object' && parsed.action && typeof parsed.action === 'string') {
        return parsed as AccessLog;
      }
      console.warn('[AccessLogStorage] 反序列化数据格式无效，缺少必要字段:', parsed);
      return null;
    } catch (e) {
      console.warn('[AccessLogStorage] 反序列化失败:', e, '源数据:', data);
      return null;
    }
  },

  /**
   * 计算时间范围的key模式
   * 统一使用UTC时间计算，避免时区问题
   */
  getTimeRangePatterns: (startTime?: number, endTime?: number): string[] => {
    const now = Date.now();
    const defaultStartTime = startTime || (now - 7 * 24 * 60 * 60 * 1000); // 默认7天前
    const defaultEndTime = endTime || now; // 默认当前时间

    const patterns: string[] = [];

    // 统一使用UTC时间
    const startDateUTC = new Date(defaultStartTime);
    const endDateUTC = new Date(defaultEndTime);

    // 生成日期范围内的所有日期pattern（UTC格式）
    const currentDateUTC = new Date(Date.UTC(
      startDateUTC.getUTCFullYear(),
      startDateUTC.getUTCMonth(),
      startDateUTC.getUTCDate()
    ));

    const endDateOnlyUTC = new Date(Date.UTC(
      endDateUTC.getUTCFullYear(),
      endDateUTC.getUTCMonth(),
      endDateUTC.getUTCDate()
    ));

    while (currentDateUTC <= endDateOnlyUTC) {
      // 使用UTC格式的日期字符串
      const dateStr = currentDateUTC.toISOString().split('T')[0]; // YYYY-MM-DD (UTC)
      patterns.push(dateStr);
      currentDateUTC.setUTCDate(currentDateUTC.getUTCDate() + 1);
    }

    console.log(`[ALStorage] 时间范围: ${patterns[0]} 到 ${patterns[patterns.length - 1]} (${patterns.length}天)`);
    return patterns;
  },

  /**
   * 基于访问日志创建相关的索引
   */
  createAccessLogIndices: (
    storage: any,
    log: AccessLog,
    id: string
  ): Promise<void[]> => {
    const timestamp = log.timestamp;
    const date = new Date(timestamp).toISOString().split('T')[0]; // YYYY-MM-DD

    const promises: Promise<void>[] = [];

    // 1. 按日期+用户的主要索引
    const username = log.username || 'anonymous';
    const indexKey = (username ? `al:index:${date}:${username}` : `al:index:${date}`);
    promises.push(
      storage.sadd(indexKey, id).then(() => {
        // 设置索引过期时间为31天
        return storage.expire(indexKey, 31 * 24 * 60 * 60);
      })
    );

    // 2. 按操作类型和日期的索引
    const actionIndexKey = `al:action:${log.action}:${date}`;
    promises.push(storage.sadd(actionIndexKey, id));

    // 3. 按用户和时间范围的索引（用户名:日期）
    if (log.username) {
      const userIndexKey = `al:user:${log.username}:${date}`;
      promises.push(storage.sadd(userIndexKey, id));
    }

    return Promise.all(promises);
  },
};

/**
 * 基础的访问日志存储实现方法
 * 可以作为所有存储后端的基础实现
 */
export class BaseAccessLogStorage {
  /**
   * saveAccessLog 基础实现
   * 应该在具体存储实现中调用此方法
   */
  protected async baseSaveAccessLog(
    storage: any,
    accessLog: AccessLog
  ): Promise<void> {
    const { accessLogKey, serializeAccessLog, generateEntryId, createAccessLogIndices } = AccessLogStorageMethods;
    const entryId = generateEntryId();
    const key = accessLogKey(entryId);

    try {
      // 保存主要的访问日志数据
      await storage.set(key, serializeAccessLog(accessLog));

      // 创建各种索引
      await createAccessLogIndices(storage, accessLog, entryId);

      console.log(`[BaseAccessLogStorage] 保存访问日志完成: ${accessLog.username} -> ${accessLog.action}`);
    } catch (error) {
      console.error('[BaseAccessLogStorage] 保存访问日志失败:', error);
      throw error;
    }
  }

  /**
   * deleteAccessLogs 基础实现
   * 删除特定用户或所有用户的访问日志
   */
  protected async baseDeleteAccessLogs(
    storage: any,
    username?: string
  ): Promise<number> {
    const { accessLogKey } = AccessLogStorageMethods;
    let deletedCount = 0;

    try {
      // 获取所有可能的索引键
      const indexPattern = 'al:index:*';
      const indexKeys = await storage.keys(indexPattern);

      for (const indexKey of indexKeys) {
        // 如果指定了用户名，只处理相关的索引
        if (username && !indexKey.includes(`:${username}:`) && !indexKey.endsWith(`:${username}`)) {
          continue;
        }

        const entryIds = await storage.smembers(indexKey) as string[];

        for (const entryId of entryIds) {
          const entryKey = accessLogKey(entryId);
          const entryData = await storage.get(entryKey);

          if (entryData) {
            try {
              const log = AccessLogStorageMethods.deserializeAccessLog(entryData);
              if (!log) continue;

              // 如果指定了用户名，只删除该用户的日志
              if (username && log.username !== username) {
                continue;
              }

              // 删除日志条目
              await storage.del(entryKey);
              // 从索引中移除
              await storage.srem(indexKey, entryId);
              deletedCount++;
            } catch (err) {
              console.warn('[BaseAccessLogStorage] 删除日志条目失败:', entryKey, err);
            }
          }
        }
      }

      console.log(`[BaseAccessLogStorage] 删除访问日志完成: ${deletedCount}条 (username=${username || 'all'})`);
      return deletedCount;

    } catch (error) {
      console.error('[BaseAccessLogStorage] 删除访问日志失败:', error);
      return deletedCount;
    }
  }

  /**
   * getAccessLogs 基础实现
   * 需要从具体的存储后端按各种索引过滤实现
   */
  protected async baseGetAccessLogs(
    storage: any,
    filters: {
      username?: string;
      startTime?: number;
      endTime?: number;
      action?: string;
    },
    limit = 50,
    offset = 0
  ): Promise<AccessLog[]> {
    const { deserializeAccessLog, getTimeRangePatterns } = AccessLogStorageMethods;
    const allLogs: AccessLog[] = [];

    try {
      // 1. 先根据日期范围和用户名选择合适的索引
      const timeRangePatterns = getTimeRangePatterns(filters.startTime, filters.endTime);
      let candidateKeys: string[] = [];

      // 收集所有可能记录
      for (const datePattern of timeRangePatterns) {
        if (filters.username) {
          // 有用户名和时间限制，用user索引
          const userIndexKey = `al:user:${filters.username}:${datePattern}`;
          const userIds = await storage.smembers(userIndexKey) as string[];
          candidateKeys.push(...userIds);
        } else if (filters.action) {
          // 有操作类型，用action索引
          const actionIndexKey = AccessLogStorageMethods.accessLogActionIndexKey(filters.action, datePattern);
          const actionIds = await storage.smembers(actionIndexKey) as string[];
          candidateKeys.push(...actionIds);
        } else {
          // 只有日期，用日期索引
          const indexKey = AccessLogStorageMethods.accessLogIndexKey(datePattern);
          const dateIds = await storage.smembers(indexKey) as string[];
          candidateKeys.push(...dateIds);
        }
      }

      // 2. 用JavaScript做进一步的筛选（精确时间范围）
      candidateKeys = Array.from(new Set(candidateKeys)); // 去重
      const candidateLogs: AccessLog[] = [];

      for (const id of candidateKeys) {
        const key = AccessLogStorageMethods.accessLogKey(id);
        const data = await storage.get(key);
        if (data) {
          try {
            const log = deserializeAccessLog(data);
            if (!log) continue; // 跳过无效日志

            // 应用更多过滤器
            const inTimeRange = () => {
              // 时间过滤
              if (filters.startTime && log.timestamp < filters.startTime) return false;
              if (filters.endTime && log.timestamp > filters.endTime) return false;
              // 操作类型过滤
              if (filters.action && log.action !== filters.action) return false;
              // 用户名过滤
              if (filters.username && log.username !== filters.username) return false;
              return true;
            };

            if (inTimeRange()) {
              candidateLogs.push(log);
            }
          } catch (err) {
            console.warn('[BaseAccessLogStorage] 反序列化单个日志失败:', err);
          }
        }
      }

      // 3. 按时间倒序排序和分页
      const sortedLogs = candidateLogs.sort((a, b) => b.timestamp - a.timestamp);
      const paginatedLogs = sortedLogs.slice(offset, offset + limit);

      return paginatedLogs;

    } catch (error) {
      console.error('[BaseAccessLogStorage] 查询访问日志失败:', error);
      return [];
    }
  }
}

/**
 * 创建一个简单的本地存储访问日志实现
 * 用于开发测试
 */
export class LocalAccessLogStorage {
  private storage: Map<string, AccessLog> = new Map();
  private indexations: Map<string, Set<string>> = new Map();

  async saveAccessLog(accessLog: AccessLog): Promise<void> {
    const entryId = AccessLogStorageMethods.generateEntryId();
    this.storage.set(entryId, accessLog);

    // 简单索引（本地模式用于开发测试，不实现过期）
    const date = new Date(accessLog.timestamp).toISOString().split('T')[0];

    // 日期索引
    const dateIndexKey = `al:index:${date}`;
    if (!this.indexations.has(dateIndexKey)) {
      this.indexations.set(dateIndexKey, new Set());
    }
    this.indexations.get(dateIndexKey)!.add(entryId);

    // 操作索引
    const actionIndexKey = AccessLogStorageMethods.accessLogActionIndexKey(accessLog.action, date);
    if (!this.indexations.has(actionIndexKey)) {
      this.indexations.set(actionIndexKey, new Set());
    }
    this.indexations.get(actionIndexKey)!.add(entryId);

    // 用户索引
    if (accessLog.username) {
      const userIndexKey = `al:user:${accessLog.username}:${date}`;
      if (!this.indexations.has(userIndexKey)) {
        this.indexations.set(userIndexKey, new Set());
      }
      this.indexations.get(userIndexKey)!.add(entryId);
    }

    console.log(`[LocalAccessLogStorage] 保存访问日志: ${accessLog.username || '匿名'} -> ${accessLog.action}`);
  }

  async getAccessLogs(filters: any, limit = 50, offset = 0): Promise<AccessLog[]> {
    const allLogs = Array.from(this.storage.values());
    let filteredLogs = allLogs;

    // 过滤逻辑
    if (filters.username) {
      filteredLogs = filteredLogs.filter(log => log.username === filters.username);
    }
    if (filters.startTime) {
      filteredLogs = filteredLogs.filter(log => log.timestamp >= filters.startTime);
    }
    if (filters.endTime) {
      filteredLogs = filteredLogs.filter(log => log.timestamp <= filters.endTime);
    }
    if (filters.action) {
      filteredLogs = filteredLogs.filter(log => log.action === filters.action);
    }

    // 排序和分页
    const sorted = filteredLogs.sort((a, b) => Number(b.timestamp) - Number(a.timestamp));
    return sorted.slice(offset, offset + limit);
  }

  async deleteAccessLogs(username?: string): Promise<number> {
    let deletedCount = 0;

    // 转换Map.entries()为数组以避免迭代器问题
    const entries = Array.from(this.storage.entries());
    for (const [entryId, log] of entries) {
      // 如果指定了用户名，只删除该用户的日志
      if (username && log.username !== username) {
        continue;
      }

      // 删除存储的日志
      this.storage.delete(entryId);
      deletedCount++;
    }

    // 清理所有索引
    this.indexations.clear();

    // 重新构建剩余日志的索引
    const remainingEntries = Array.from(this.storage.entries());
    for (const [entryId, log] of remainingEntries) {
      const date = new Date(log.timestamp).toISOString().split('T')[0];

      // 日期索引
      const dateIndexKey = `al:index:${date}`;
      if (!this.indexations.has(dateIndexKey)) {
        this.indexations.set(dateIndexKey, new Set());
      }
      this.indexations.get(dateIndexKey)!.add(entryId);

      // 操作索引
      const actionIndexKey = AccessLogStorageMethods.accessLogActionIndexKey(log.action, date);
      if (!this.indexations.has(actionIndexKey)) {
        this.indexations.set(actionIndexKey, new Set());
      }
      this.indexations.get(actionIndexKey)!.add(entryId);

      // 用户索引
      if (log.username) {
        const userIndexKey = `al:user:${log.username}:${date}`;
        if (!this.indexations.has(userIndexKey)) {
          this.indexations.set(userIndexKey, new Set());
        }
        this.indexations.get(userIndexKey)!.add(entryId);
      }
    }

    console.log(`[LocalAccessLogStorage] 删除访问日志: ${deletedCount}条 (username=${username || 'all'})`);
    return deletedCount;
  }
}

/**
 * 空实现，用于不支持的存储类型（如localstorage绝对路径）
 */
export class NoOpAccessLogStorage {
  async saveAccessLog(_accessLog: AccessLog): Promise<void> {
    // 什么都处于空操作状态
  }

  async getAccessLogs(_filters: any, _limit = 50, _offset = 0): Promise<AccessLog[]> {
    return [];
  }

  async deleteAccessLogs(_username?: string): Promise<number> {
    // 什么都不做
    return 0;
  }
}

/**
 * 工厂函数创建一个合适的访问日志存储实例
 */
export function createAccessLogStorage(storageType = 'none'): {
  saveAccessLog: (accessLog: AccessLog) => Promise<void>;
  getAccessLogs: (filters: any, limit?: number, offset?: number) => Promise<AccessLog[]>;
  deleteAccessLogs: (username?: string) => Promise<number>;
} {
  switch (storageType.toLowerCase()) {
    case 'local_development': {
      const localStorage = new LocalAccessLogStorage();
      return {
        saveAccessLog: localStorage.saveAccessLog.bind(localStorage),
        getAccessLogs: localStorage.getAccessLogs.bind(localStorage),
        deleteAccessLogs: localStorage.deleteAccessLogs.bind(localStorage)
      };
    }
    case 'none':
    default: {
      const noOpStorage = new NoOpAccessLogStorage();
      return {
        saveAccessLog: noOpStorage.saveAccessLog.bind(noOpStorage),
        getAccessLogs: noOpStorage.getAccessLogs.bind(noOpStorage),
        deleteAccessLogs: noOpStorage.deleteAccessLogs.bind(noOpStorage)
      };
    }
  }
}

/**
 * 最大存储生命周期为31天的控制策略，避免历史访问日志无限膨胀
 */
const ACCESS_LOG_RETENTION_DAYS = 31 * 24 * 60 * 60; // 31天

/**
 * 批量清理过期访问日志
 */
export async function cleanupExpiredAccessLogs(storage: any): Promise<number> {
  let cleanedCount = 0;
  const cutoffTime = Date.now() - ACCESS_LOG_RETENTION_DAYS;

  try {
    // 获取所有可能的索引键以进行遍历
    const indexPattern = 'al:index:*';
    const indexKeys = await storage.keys(indexPattern);

    for (const indexKey of indexKeys) {
      const entryIds = await storage.smembers(indexKey);

      for (const entryId of entryIds) {
        const entryKey = `al:${entryId}`;
        const entryData = await storage.get(entryKey);

        if (entryData) {
          try {
            const log = AccessLogStorageMethods.deserializeAccessLog(entryData);
            if (!log) continue; // 跳过无效日志

            if (log.timestamp < cutoffTime) {
              // 删除超期的日志条目
              await storage.del(entryKey);
              // 从索引中移除
              await storage.srem(indexKey, entryId);
              cleanedCount++;
            }
          } catch (err) {
            console.warn('[Cleanup] 无法解析日志条目:', entryKey, err);
          }
        }
      }
    }

    console.log(`[AccessLog Cleanup] 清理了 ${cleanedCount} 条过期访问日志`);
    return cleanedCount;

  } catch (error) {
    console.error('[AccessLog Cleanup] 清理过程发生错误:', error);
    return cleanedCount;
  }
}

export { AccessLogStorageMethods as ALStorage };  // 简短别名导出
