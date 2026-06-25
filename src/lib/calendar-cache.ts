import { db } from './db';
import type { ReleaseCalendarResult } from './types';

// 日历缓存键
const CALENDAR_DATA_KEY = 'calendar:release_calendar_data';
const CALENDAR_TIME_KEY = 'calendar:release_calendar_time';
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24小时缓存

// 获取存储类型
function getStorageType(): string {
  return process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage';
}

// 日历数据库缓存管理器
export class CalendarCacheManager {
  // 保存日历数据到数据库
  static async saveCalendarData(data: unknown): Promise<boolean> {
    const storageType = getStorageType();

    // 如果是localStorage模式，跳过数据库缓存
    if (storageType === 'localstorage') {
      return false;
    }

    try {
      const timestamp = Date.now().toString();
      const _sizeKB = Math.round(JSON.stringify(data).length / 1024);
      const expireSeconds = Math.floor(CACHE_DURATION / 1000);

      await db.setCache(CALENDAR_DATA_KEY, data, expireSeconds);
      await db.setCache(CALENDAR_TIME_KEY, timestamp, expireSeconds);

      return true;
    } catch (error) {
      console.error('❌ 保存日历数据到数据库缓存失败:', error);
      return false;
    }
  }

  // 从数据库获取日历缓存数据
  static async getCalendarData(): Promise<ReleaseCalendarResult | null> {
    const storageType = getStorageType();

    // 如果是localStorage模式，跳过数据库缓存
    if (storageType === 'localstorage') {
      return null;
    }

    try {
      const dataValue = await db.getCache(CALENDAR_DATA_KEY);
      const timeStr = await db.getCache(CALENDAR_TIME_KEY);

      if (!dataValue || !timeStr) {
        return null;
      }

      // 检查缓存是否过期
      const age = Date.now() - parseInt(timeStr);
      if (age >= CACHE_DURATION) {
        await this.clearCalendarData(); // 清理过期数据
        return null;
      }

      let data: ReleaseCalendarResult;
      if (typeof dataValue === 'string') {
        data = JSON.parse(dataValue) as ReleaseCalendarResult;
      } else if (typeof dataValue === 'object' && dataValue !== null) {
        data = dataValue as ReleaseCalendarResult;
      } else {
        console.warn('⚠️ 数据库返回的日历缓存格式不正确:', typeof dataValue);
        return null;
      }

      return data;
    } catch (error) {
      console.error('❌ 从数据库读取日历缓存失败:', error);
      return null;
    }
  }

  // 清除日历缓存
  static async clearCalendarData(): Promise<void> {
    const storageType = getStorageType();

    if (storageType === 'localstorage') {
      return;
    }

    try {
      await db.deleteCache(CALENDAR_DATA_KEY);
      await db.deleteCache(CALENDAR_TIME_KEY);

    } catch (error) {
      console.error('❌ 清除数据库日历缓存失败:', error);
    }
  }

  // 检查缓存是否有效
  static async isCacheValid(): Promise<boolean> {
    const storageType = getStorageType();

    if (storageType === 'localstorage') {
      return false;
    }

    try {
      const timeStr = await db.getCache(CALENDAR_TIME_KEY);

      if (!timeStr) {
        return false;
      }

      const age = Date.now() - parseInt(timeStr);
      return age < CACHE_DURATION;
    } catch (error) {
      console.error('检查缓存有效性失败:', error);
      return false;
    }
  }
}
