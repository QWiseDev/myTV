/* eslint-disable no-console, @typescript-eslint/no-explicit-any, @typescript-eslint/no-non-null-assertion */

import { AdminConfig } from './admin.types';
import { KvrocksStorage } from './kvrocks.db';
import { paginatePlayRecords } from './play-records-pagination';
import { RedisStorage } from './redis.db';
import { generateStorageKey } from './storage-key';
import {
  AccessLog,
  ContentStat,
  EpisodeSkipConfig,
  Favorite,
  IStorage,
  PlayRecord,
  PlayRecordsPage,
  PlayRecordsPageOptions,
  PlayStatsResult,
  UserPlayStat,
} from './types';
import { UpstashRedisStorage } from './upstash.db';

export { generateStorageKey, parseStorageKey } from './storage-key';

const STORAGE_TYPE =
  (process.env.NEXT_PUBLIC_STORAGE_TYPE as
    | 'redis'
    | 'upstash'
    | 'kvrocks'
    | undefined) || 'redis';

let storageInstance: IStorage | null = null;

async function createStorage(): Promise<IStorage> {
  switch (STORAGE_TYPE) {
    case 'redis':
      return new RedisStorage();
    case 'upstash':
      return new UpstashRedisStorage();
    case 'kvrocks':
      return new KvrocksStorage();
    default:
      throw new Error(`不支持的存储类型: ${STORAGE_TYPE}`);
  }
}

async function getStorage(): Promise<IStorage> {
  if (!storageInstance) {
    storageInstance = await createStorage();
  }
  return storageInstance;
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

  async getPlayRecordsPage(
    userName: string,
    options: PlayRecordsPageOptions = {},
  ): Promise<PlayRecordsPage> {
    const storage = await this.getStorage();
    if (typeof storage.getPlayRecordsPage === 'function') {
      return storage.getPlayRecordsPage(userName, options);
    }

    const records = await storage.getAllPlayRecords(userName);
    return paginatePlayRecords(records, options);
  }

  async clearAllPlayRecords(userName: string): Promise<void> {
    const storage = await this.getStorage();
    await storage.clearAllPlayRecords(userName);
  }

  async clearAllFavorites(userName: string): Promise<void> {
    const storage = await this.getStorage();
    await storage.clearAllFavorites(userName);
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
    return storage.getAllUsers();
  }

  async getAdminConfig(): Promise<AdminConfig | null> {
    const storage = await this.getStorage();
    return storage.getAdminConfig();
  }

  async saveAdminConfig(config: AdminConfig): Promise<void> {
    const storage = await this.getStorage();
    await storage.setAdminConfig(config);
  }

  async getSkipConfig(
    userName: string,
    source: string,
    id: string,
  ): Promise<EpisodeSkipConfig | null> {
    const storage = await this.getStorage();
    return storage.getSkipConfig(userName, source, id);
  }

  async setSkipConfig(
    userName: string,
    source: string,
    id: string,
    config: EpisodeSkipConfig,
  ): Promise<void> {
    const storage = await this.getStorage();
    await storage.setSkipConfig(userName, source, id, config);
  }

  async deleteSkipConfig(
    userName: string,
    source: string,
    id: string,
  ): Promise<void> {
    const storage = await this.getStorage();
    await storage.deleteSkipConfig(userName, source, id);
  }

  async getAllSkipConfigs(
    userName: string,
  ): Promise<{ [key: string]: EpisodeSkipConfig }> {
    const storage = await this.getStorage();
    return storage.getAllSkipConfigs(userName);
  }

  async getEpisodeSkipConfig(
    userName: string,
    source: string,
    id: string,
  ): Promise<EpisodeSkipConfig | null> {
    const storage = await this.getStorage();
    return storage.getEpisodeSkipConfig(userName, source, id);
  }

  async saveEpisodeSkipConfig(
    userName: string,
    source: string,
    id: string,
    config: EpisodeSkipConfig,
  ): Promise<void> {
    const storage = await this.getStorage();
    await storage.saveEpisodeSkipConfig(userName, source, id, config);
  }

  async deleteEpisodeSkipConfig(
    userName: string,
    source: string,
    id: string,
  ): Promise<void> {
    const storage = await this.getStorage();
    await storage.deleteEpisodeSkipConfig(userName, source, id);
  }

  async getAllEpisodeSkipConfigs(
    userName: string,
  ): Promise<{ [key: string]: EpisodeSkipConfig }> {
    const storage = await this.getStorage();
    return storage.getAllEpisodeSkipConfigs(userName);
  }

  async clearAllData(): Promise<void> {
    const storage = await this.getStorage();
    await storage.clearAllData();
  }

  async getCache(key: string): Promise<any | null> {
    const storage = await this.getStorage();
    return storage.getCache(key);
  }

  async setCache(
    key: string,
    data: any,
    expireSeconds?: number,
  ): Promise<void> {
    const storage = await this.getStorage();
    await storage.setCache(key, data, expireSeconds);
  }

  async keys(pattern: string): Promise<string[]> {
    const storage = await this.getStorage();
    return storage.keys(pattern);
  }

  async deleteCache(key: string): Promise<void> {
    const storage = await this.getStorage();
    await storage.deleteCache(key);
  }

  async clearExpiredCache(prefix?: string): Promise<void> {
    const storage = await this.getStorage();
    await storage.clearExpiredCache(prefix);
  }

  async getSlotUserData(userName: string): Promise<any | null> {
    const storage = await this.getStorage();
    return storage.getSlotUserData(userName);
  }

  async setSlotUserData(
    userName: string,
    data: any,
    expireSeconds = 86400 * 30,
  ): Promise<void> {
    const storage = await this.getStorage();
    await storage.setSlotUserData(userName, data, expireSeconds);
  }

  async listSlotUsers(): Promise<Array<any & { username: string }>> {
    const storage = await this.getStorage();
    return storage.listSlotUsers();
  }

  async getSlotLeaderboard(type = 'coins', limit = 10): Promise<any[]> {
    const storage = await this.getStorage();
    return storage.getSlotLeaderboard(type, limit);
  }

  async incrementRateLimit(
    key: string,
    expireSeconds: number,
  ): Promise<number | null> {
    const storage = await this.getStorage();
    return storage.incrementRateLimit(key, expireSeconds);
  }

  async getPlayStats(): Promise<PlayStatsResult> {
    const storage = await this.getStorage();
    return storage.getPlayStats();
  }

  async getUserPlayStat(userName: string): Promise<UserPlayStat> {
    const storage = await this.getStorage();
    return storage.getUserPlayStat(userName);
  }

  async getUserPlayStatWithRecords(
    userName: string,
  ): Promise<{ stat: UserPlayStat; records: PlayRecord[] }> {
    const storage = await this.getStorage();
    return storage.getUserPlayStatWithRecords(userName);
  }

  async getContentStats(limit = 10): Promise<ContentStat[]> {
    const storage = await this.getStorage();
    return storage.getContentStats(limit);
  }

  async updatePlayStatistics(
    userName: string,
    source: string,
    id: string,
    watchTime: number,
  ): Promise<void> {
    const storage = await this.getStorage();
    await storage.updatePlayStatistics(userName, source, id, watchTime);
  }

  async updateUserLoginStats(
    userName: string,
    loginTime: number,
    isFirstLogin?: boolean,
  ): Promise<void> {
    const storage = await this.getStorage();
    await storage.updateUserLoginStats(userName, loginTime, isFirstLogin);
  }

  async saveAccessLog(accessLog: AccessLog): Promise<void> {
    const storage = await this.getStorage();
    await storage.saveAccessLog(accessLog);
  }

  async getAccessLogs(
    filters: any,
    limit = 50,
    offset = 0,
  ): Promise<AccessLog[]> {
    const storage = await this.getStorage();
    return storage.getAccessLogs(filters, limit, offset);
  }

  async deleteAccessLogs(username?: string): Promise<number> {
    const storage = await this.getStorage();
    return storage.deleteAccessLogs(username);
  }
}

export const db = new DbManager();
