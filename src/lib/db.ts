/* eslint-disable no-console, @typescript-eslint/no-explicit-any, @typescript-eslint/no-non-null-assertion */

import { AdminConfig } from './admin.types';
import { KvrocksStorage } from './kvrocks.db';
import { RedisStorage } from './redis.db';
import {
  AccessLog,
  ContentStat,
  EpisodeSkipConfig,
  Favorite,
  IStorage,
  PlayRecord,
  PlayStatsResult,
  UserPlayStat,
} from './types';
import { UpstashRedisStorage } from './upstash.db';

const STORAGE_TYPE =
  (process.env.NEXT_PUBLIC_STORAGE_TYPE as
    | 'localstorage'
    | 'redis'
    | 'upstash'
    | 'kvrocks'
    | 'supabase'
    | undefined) || 'localstorage';

let storageInstance: IStorage | null = null;
let storagePromise: Promise<IStorage> | null = null;
let useLocalStorage = false;

async function createStorage(): Promise<IStorage> {
  switch (STORAGE_TYPE) {
    case 'redis':
      return new RedisStorage();
    case 'upstash':
      return new UpstashRedisStorage();
    case 'kvrocks':
      return new KvrocksStorage();
    case 'supabase': {
      const { SupabaseStorage } = await import('./supabase/storage');
      return new SupabaseStorage();
    }
    case 'localstorage':
    default:
      useLocalStorage = true;
      return null as unknown as IStorage;
  }
}

async function getStorage(): Promise<IStorage> {
  if (useLocalStorage) {
    return null as unknown as IStorage;
  }

  if (STORAGE_TYPE === 'supabase') {
    if (!storagePromise) {
      storagePromise = createStorage();
    }
    return storagePromise;
  }

  if (!storageInstance) {
    storageInstance = await createStorage();
  }
  return storageInstance;
}

export function generateStorageKey(source: string, id: string): string {
  return `${source}+${id}`;
}

export class DbManager {
  private storagePromise: Promise<IStorage>;

  constructor() {
    this.storagePromise = getStorage();
  }

  private async getStorage(): Promise<IStorage> {
    return this.storagePromise;
  }

  async getPlayRecord(
    userName: string,
    source: string,
    id: string,
  ): Promise<PlayRecord | null> {
    const storage = await this.getStorage();
    const key = generateStorageKey(source, id);
    return storage.getPlayRecord(userName, key);
  }

  async savePlayRecord(
    userName: string,
    source: string,
    id: string,
    record: PlayRecord,
  ): Promise<void> {
    const storage = await this.getStorage();
    const key = generateStorageKey(source, id);
    await storage.setPlayRecord(userName, key, record);
  }

  async getAllPlayRecords(userName: string): Promise<{
    [key: string]: PlayRecord;
  }> {
    const storage = await this.getStorage();
    return storage.getAllPlayRecords(userName);
  }

  async clearAllPlayRecords(userName: string): Promise<void> {
    const storage = await this.getStorage();

    if (storage instanceof UpstashRedisStorage) {
      await storage.clearAllPlayRecords(userName);
      return;
    }

    const allRecords = await storage.getAllPlayRecords(userName);
    await Promise.all(
      Object.keys(allRecords).map((key) =>
        storage.deletePlayRecord(userName, key),
      ),
    );
  }

  async deletePlayRecord(
    userName: string,
    source: string,
    id: string,
  ): Promise<void> {
    const storage = await this.getStorage();
    const key = generateStorageKey(source, id);
    await storage.deletePlayRecord(userName, key);
  }

  async getFavorite(
    userName: string,
    source: string,
    id: string,
  ): Promise<Favorite | null> {
    const storage = await this.getStorage();
    const key = generateStorageKey(source, id);
    return storage.getFavorite(userName, key);
  }

  async saveFavorite(
    userName: string,
    source: string,
    id: string,
    favorite: Favorite,
  ): Promise<void> {
    const storage = await this.getStorage();
    const key = generateStorageKey(source, id);
    await storage.setFavorite(userName, key, favorite);
  }

  async getAllFavorites(
    userName: string,
  ): Promise<{ [key: string]: Favorite }> {
    const storage = await this.getStorage();
    return storage.getAllFavorites(userName);
  }

  async deleteFavorite(
    userName: string,
    source: string,
    id: string,
  ): Promise<void> {
    const storage = await this.getStorage();
    const key = generateStorageKey(source, id);
    await storage.deleteFavorite(userName, key);
  }

  async isFavorited(
    userName: string,
    source: string,
    id: string,
  ): Promise<boolean> {
    const favorite = await this.getFavorite(userName, source, id);
    return favorite !== null;
  }

  async registerUser(userName: string, password: string): Promise<void> {
    const storage = await this.getStorage();
    await storage.registerUser(userName, password);
  }

  async verifyUser(userName: string, password: string): Promise<boolean> {
    const storage = await this.getStorage();
    return storage.verifyUser(userName, password);
  }

  async checkUserExist(userName: string): Promise<boolean> {
    const storage = await this.getStorage();
    return storage.checkUserExist(userName);
  }

  async changePassword(userName: string, newPassword: string): Promise<void> {
    const storage = await this.getStorage();
    await storage.changePassword(userName, newPassword);
  }

  async deleteUser(userName: string): Promise<void> {
    const storage = await this.getStorage();
    await storage.deleteUser(userName);
  }

  async getSearchHistory(userName: string): Promise<string[]> {
    const storage = await this.getStorage();
    return storage.getSearchHistory(userName);
  }

  async addSearchHistory(userName: string, keyword: string): Promise<void> {
    const storage = await this.getStorage();
    await storage.addSearchHistory(userName, keyword);
  }

  async deleteSearchHistory(userName: string, keyword?: string): Promise<void> {
    const storage = await this.getStorage();
    await storage.deleteSearchHistory(userName, keyword);
  }

  async getAllUsers(): Promise<string[]> {
    const storage = await this.getStorage();
    if (typeof (storage as any).getAllUsers === 'function') {
      return (storage as any).getAllUsers();
    }
    return [];
  }

  async getAdminConfig(): Promise<AdminConfig | null> {
    const storage = await this.getStorage();
    if (typeof (storage as any).getAdminConfig === 'function') {
      return (storage as any).getAdminConfig();
    }
    return null;
  }

  async saveAdminConfig(config: AdminConfig): Promise<void> {
    const storage = await this.getStorage();
    if (typeof (storage as any).setAdminConfig === 'function') {
      await (storage as any).setAdminConfig(config);
    }
  }

  async getSkipConfig(
    userName: string,
    source: string,
    id: string,
  ): Promise<EpisodeSkipConfig | null> {
    const storage = await this.getStorage();
    if (typeof (storage as any).getSkipConfig === 'function') {
      return (storage as any).getSkipConfig(userName, source, id);
    }
    return null;
  }

  async setSkipConfig(
    userName: string,
    source: string,
    id: string,
    config: EpisodeSkipConfig,
  ): Promise<void> {
    const storage = await this.getStorage();
    if (typeof (storage as any).setSkipConfig === 'function') {
      await (storage as any).setSkipConfig(userName, source, id, config);
    }
  }

  async deleteSkipConfig(
    userName: string,
    source: string,
    id: string,
  ): Promise<void> {
    const storage = await this.getStorage();
    if (typeof (storage as any).deleteSkipConfig === 'function') {
      await (storage as any).deleteSkipConfig(userName, source, id);
    }
  }

  async getAllSkipConfigs(
    userName: string,
  ): Promise<{ [key: string]: EpisodeSkipConfig }> {
    const storage = await this.getStorage();
    if (typeof (storage as any).getAllSkipConfigs === 'function') {
      return (storage as any).getAllSkipConfigs(userName);
    }
    return {};
  }

  async getEpisodeSkipConfig(
    userName: string,
    source: string,
    id: string,
  ): Promise<EpisodeSkipConfig | null> {
    const storage = await this.getStorage();
    if (typeof (storage as any).getEpisodeSkipConfig === 'function') {
      return (storage as any).getEpisodeSkipConfig(userName, source, id);
    }
    return null;
  }

  async saveEpisodeSkipConfig(
    userName: string,
    source: string,
    id: string,
    config: EpisodeSkipConfig,
  ): Promise<void> {
    const storage = await this.getStorage();
    if (typeof (storage as any).saveEpisodeSkipConfig === 'function') {
      await (storage as any).saveEpisodeSkipConfig(
        userName,
        source,
        id,
        config,
      );
    }
  }

  async deleteEpisodeSkipConfig(
    userName: string,
    source: string,
    id: string,
  ): Promise<void> {
    const storage = await this.getStorage();
    if (typeof (storage as any).deleteEpisodeSkipConfig === 'function') {
      await (storage as any).deleteEpisodeSkipConfig(userName, source, id);
    }
  }

  async getAllEpisodeSkipConfigs(
    userName: string,
  ): Promise<{ [key: string]: EpisodeSkipConfig }> {
    const storage = await this.getStorage();
    if (typeof (storage as any).getAllEpisodeSkipConfigs === 'function') {
      return (storage as any).getAllEpisodeSkipConfigs(userName);
    }
    return {};
  }

  async clearAllData(): Promise<void> {
    const storage = await this.getStorage();
    if (typeof (storage as any).clearAllData === 'function') {
      await (storage as any).clearAllData();
    } else {
      throw new Error('存储类型不支持清空数据操作');
    }
  }

  async getCache(key: string): Promise<any | null> {
    const storage = await this.getStorage();
    if (typeof storage.getCache === 'function') {
      return storage.getCache(key);
    }
    return null;
  }

  async setCache(
    key: string,
    data: any,
    expireSeconds?: number,
  ): Promise<void> {
    const storage = await this.getStorage();
    if (typeof storage.setCache === 'function') {
      await storage.setCache(key, data, expireSeconds);
    }
  }

  async keys(pattern: string): Promise<string[]> {
    const storage = await this.getStorage();
    if (typeof (storage as any).keys === 'function') {
      return (storage as any).keys(pattern);
    }
    return [];
  }

  async deleteCache(key: string): Promise<void> {
    const storage = await this.getStorage();
    if (typeof storage.deleteCache === 'function') {
      await storage.deleteCache(key);
    }
  }

  async clearExpiredCache(prefix?: string): Promise<void> {
    const storage = await this.getStorage();
    if (typeof storage.clearExpiredCache === 'function') {
      await storage.clearExpiredCache(prefix);
    }
  }

  async getSlotUserData(userName: string): Promise<any | null> {
    const storage = await this.getStorage();
    if (typeof (storage as any)?.getSlotUserData === 'function') {
      return (storage as any).getSlotUserData(userName);
    }
    return null;
  }

  async setSlotUserData(
    userName: string,
    data: any,
    expireSeconds = 86400 * 30,
  ): Promise<void> {
    const storage = await this.getStorage();
    if (typeof (storage as any)?.setSlotUserData === 'function') {
      await (storage as any).setSlotUserData(userName, data, expireSeconds);
      return;
    }
    throw new Error(`当前存储类型 ${STORAGE_TYPE} 不支持 slot:user Hash 写入`);
  }

  async listSlotUsers(): Promise<Array<any & { username: string }>> {
    const storage = await this.getStorage();
    if (typeof (storage as any)?.listSlotUsers === 'function') {
      return (storage as any).listSlotUsers();
    }
    return [];
  }

  async getSlotLeaderboard(type = 'coins', limit = 10): Promise<any[]> {
    const storage = await this.getStorage();
    if (typeof (storage as any)?.getSlotLeaderboard === 'function') {
      return (storage as any).getSlotLeaderboard(type, limit);
    }
    return [];
  }

  async incrementRateLimit(
    key: string,
    expireSeconds: number,
  ): Promise<number | null> {
    const storage = await this.getStorage();
    if (typeof (storage as any)?.incrementRateLimit === 'function') {
      return (storage as any).incrementRateLimit(key, expireSeconds);
    }
    return null;
  }

  async getPlayStats(): Promise<PlayStatsResult> {
    const storage = await this.getStorage();
    if (typeof (storage as any).getPlayStats === 'function') {
      return (storage as any).getPlayStats();
    }
    return {
      totalUsers: 0,
      totalWatchTime: 0,
      totalPlays: 0,
      avgWatchTimePerUser: 0,
      avgPlaysPerUser: 0,
      userStats: [],
      topSources: [],
      dailyStats: [],
      registrationStats: {
        todayNewUsers: 0,
        totalRegisteredUsers: 0,
        registrationTrend: [],
      },
      activeUsers: {
        daily: 0,
        weekly: 0,
        monthly: 0,
      },
    };
  }

  async getUserPlayStat(userName: string): Promise<UserPlayStat> {
    const storage = await this.getStorage();
    if (typeof (storage as any).getUserPlayStat === 'function') {
      return (storage as any).getUserPlayStat(userName);
    }
    return {
      username: userName,
      totalWatchTime: 0,
      totalPlays: 0,
      lastPlayTime: 0,
      recentRecords: [],
      avgWatchTime: 0,
      mostWatchedSource: '',
    };
  }

  async getContentStats(limit = 10): Promise<ContentStat[]> {
    const storage = await this.getStorage();
    if (typeof (storage as any).getContentStats === 'function') {
      return (storage as any).getContentStats(limit);
    }
    return [];
  }

  async updatePlayStatistics(
    userName: string,
    source: string,
    id: string,
    watchTime: number,
  ): Promise<void> {
    const storage = await this.getStorage();
    if (typeof (storage as any).updatePlayStatistics === 'function') {
      await (storage as any).updatePlayStatistics(
        userName,
        source,
        id,
        watchTime,
      );
    }
  }

  async updateUserLoginStats(
    userName: string,
    loginTime: number,
    isFirstLogin?: boolean,
  ): Promise<void> {
    const storage = await this.getStorage();
    if (typeof (storage as any).updateUserLoginStats === 'function') {
      await (storage as any).updateUserLoginStats(
        userName,
        loginTime,
        isFirstLogin,
      );
    }
  }

  isStatsSupported(): boolean {
    return STORAGE_TYPE !== 'localstorage';
  }

  async saveAccessLog(accessLog: AccessLog): Promise<void> {
    const storage = await this.getStorage();
    if (typeof (storage as any).saveAccessLog === 'function') {
      await (storage as any).saveAccessLog(accessLog);
      console.log(
        `[DbManager] 保存访问日志: ${accessLog.username} -> ${accessLog.action}`,
      );
    } else {
      console.warn('[DbManager] 后端存储不支持访问日志');
    }
  }

  async getAccessLogs(
    filters: any,
    limit = 50,
    offset = 0,
  ): Promise<AccessLog[]> {
    const storage = await this.getStorage();
    if (typeof (storage as any).getAccessLogs === 'function') {
      const logs = await (storage as any).getAccessLogs(filters, limit, offset);
      console.log(`[DbManager] 获取访问日志: ${limit}条 (offset=${offset})`);
      return logs;
    }
    console.warn('[DbManager] 后端存储不支持访问日志查询');
    return [];
  }

  async deleteAccessLogs(username?: string): Promise<number> {
    const storage = await this.getStorage();
    if (typeof (storage as any).deleteAccessLogs === 'function') {
      const deletedCount = await (storage as any).deleteAccessLogs(username);
      console.log(
        `[DbManager] 删除访问日志: ${deletedCount}条 (username=${username || 'all'})`,
      );
      return deletedCount;
    }
    console.warn('[DbManager] 后端存储不支持访问日志删除');
    return 0;
  }
}

export const db = new DbManager();
