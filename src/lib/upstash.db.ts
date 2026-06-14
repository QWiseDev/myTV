/* eslint-disable no-console, @typescript-eslint/no-explicit-any, @typescript-eslint/no-non-null-assertion */

import { Redis } from '@upstash/redis';

import { AdminConfig } from './admin.types';
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

// 搜索历史最大条数
const SEARCH_HISTORY_LIMIT = 20;

// 数据类型转换辅助函数
function ensureString(value: any): string {
  return String(value);
}

function ensureStringArray(value: any[]): string[] {
  return value.map((item) => String(item));
}

interface LoginStats {
  loginCount: number;
  firstLoginTime: number;
  lastLoginTime: number;
  lastLoginDate: number;
}

type SlotUserData = Record<string, any>;

// 添加Upstash Redis操作重试包装器
async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries = 3
): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (err: any) {
      const isLastAttempt = i === maxRetries - 1;
      const isConnectionError =
        err.message?.includes('Connection') ||
        err.message?.includes('ECONNREFUSED') ||
        err.message?.includes('ENOTFOUND') ||
        err.code === 'ECONNRESET' ||
        err.code === 'EPIPE' ||
        err.name === 'UpstashError';

      if (isConnectionError && !isLastAttempt) {
        console.log(
          `Upstash Redis operation failed, retrying... (${i + 1}/${maxRetries})`
        );
        console.error('Error:', err.message);

        // 等待一段时间后重试
        await new Promise((resolve) => setTimeout(resolve, 1000 * (i + 1)));
        continue;
      }

      throw err;
    }
  }

  throw new Error('Max retries exceeded');
}

export class UpstashRedisStorage implements IStorage {
  private client: Redis;
  private userStatsCache: Map<string, { data: UserPlayStat; timestamp: number }> = new Map();
  private userStatsCacheTTL = 60000; // 60秒缓存

  constructor() {
    this.client = getUpstashRedisClient();
  }

  private async scanKeys(pattern: string): Promise<string[]> {
    const keys: string[] = [];
    let cursor = '0';

    do {
      const [nextCursor, batch] = await withRetry(() =>
        this.client.scan(cursor, { match: pattern, count: 100 })
      );
      cursor = String(nextCursor);
      keys.push(...batch);
    } while (cursor !== '0');

    return keys;
  }

  private normalizeLoginStats(raw?: Partial<LoginStats> | null): LoginStats {
    return {
      loginCount: Number(raw?.loginCount || 0),
      firstLoginTime: Number(raw?.firstLoginTime || 0),
      lastLoginTime: Number(raw?.lastLoginTime || 0),
      lastLoginDate: Number(raw?.lastLoginDate || raw?.lastLoginTime || 0),
    };
  }

  private parseStoredObject<T>(value: unknown): T | null {
    if (!value) {
      return null;
    }
    if (typeof value === 'string') {
      return JSON.parse(value) as T;
    }
    return value as T;
  }

  private loginStatsKey(userName: string) {
    return `user_login_stats:${userName}`;
  }

  private async getLoginStats(userName: string): Promise<LoginStats> {
    const stored = await withRetry(() =>
      this.client.hgetall<Partial<LoginStats>>(this.loginStatsKey(userName))
    );
    return this.normalizeLoginStats(stored);
  }

  private encodeHashValue(value: any): string {
    return JSON.stringify(value);
  }

  private decodeHashValue(value: unknown): any {
    if (value === undefined) {
      return undefined;
    }
    if (typeof value !== 'string') {
      return value;
    }

    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }

  private encodeHashObject(data: Record<string, any>): Record<string, string> {
    return Object.fromEntries(
      Object.entries(data).map(([key, value]) => [
        key,
        this.encodeHashValue(value),
      ])
    );
  }

  private decodeHashObject(data: Record<string, unknown>): Record<string, any> {
    return Object.fromEntries(
      Object.entries(data).map(([key, value]) => [
        key,
        this.decodeHashValue(value),
      ])
    );
  }

  // ---------- 播放记录 ----------
  private prHashKey(user: string) {
    return `u:${user}:prh`; // 新结构：u:username:prh（Hash）
  }

  async getPlayRecord(
    userName: string,
    key: string
  ): Promise<PlayRecord | null> {
    const hashKey = this.prHashKey(userName);

    return await withRetry(() =>
      this.client.hget<PlayRecord>(hashKey, key)
    );
  }

  async setPlayRecord(
    userName: string,
    key: string,
    record: PlayRecord
  ): Promise<void> {
    const hashKey = this.prHashKey(userName);

    await withRetry(() => this.client.hset(hashKey, { [key]: record }));
  }

  async getAllPlayRecords(
    userName: string
  ): Promise<Record<string, PlayRecord>> {
    const records = await withRetry(() =>
      this.client.hgetall<Record<string, PlayRecord>>(this.prHashKey(userName))
    );

    return records ?? {};
  }

  async deletePlayRecord(userName: string, key: string): Promise<void> {
    await withRetry(() => this.client.hdel(this.prHashKey(userName), key));
  }

  async clearAllPlayRecords(userName: string): Promise<void> {
    await withRetry(() => this.client.del(this.prHashKey(userName)));
  }

  // ---------- 收藏 ----------
  private favHashKey(user: string) {
    return `u:${user}:favh`;
  }

  async getFavorite(userName: string, key: string): Promise<Favorite | null> {
    return await withRetry(() =>
      this.client.hget<Favorite>(this.favHashKey(userName), key)
    );
  }

  async setFavorite(
    userName: string,
    key: string,
    favorite: Favorite
  ): Promise<void> {
    await withRetry(() =>
      this.client.hset(this.favHashKey(userName), { [key]: favorite })
    );
  }

  async getAllFavorites(userName: string): Promise<Record<string, Favorite>> {
    return (
      (await withRetry(() =>
        this.client.hgetall<Record<string, Favorite>>(this.favHashKey(userName))
      )) ?? {}
    );
  }

  async deleteFavorite(userName: string, key: string): Promise<void> {
    await withRetry(() => this.client.hdel(this.favHashKey(userName), key));
  }

  // ---------- 用户注册 / 登录 ----------
  private userPwdKey(user: string) {
    return `u:${user}:pwd`;
  }

  async registerUser(userName: string, password: string): Promise<void> {
    // 简单存储明文密码，生产环境应加密
    await withRetry(() => this.client.set(this.userPwdKey(userName), password));
  }

  async verifyUser(userName: string, password: string): Promise<boolean> {
    const stored = await withRetry(() =>
      this.client.get(this.userPwdKey(userName))
    );
    if (stored === null) return false;
    // 确保比较时都是字符串类型
    return ensureString(stored) === password;
  }

  // 检查用户是否存在
  async checkUserExist(userName: string): Promise<boolean> {
    // 使用 EXISTS 判断 key 是否存在
    const exists = await withRetry(() =>
      this.client.exists(this.userPwdKey(userName))
    );
    return exists === 1;
  }

  // 修改用户密码
  async changePassword(userName: string, newPassword: string): Promise<void> {
    // 简单存储明文密码，生产环境应加密
    await withRetry(() =>
      this.client.set(this.userPwdKey(userName), newPassword)
    );
  }

  // 删除用户及其所有数据
  async deleteUser(userName: string): Promise<void> {
    // 删除用户密码
    await withRetry(() => this.client.del(this.userPwdKey(userName)));

    // 删除搜索历史
    await withRetry(() => this.client.del(this.shKey(userName)));

    // 删除播放记录
    await this.clearAllPlayRecords(userName);

    // 删除收藏夹
    await withRetry(() => this.client.del(this.favHashKey(userName)));

    // 删除跳过片头片尾配置
    await this.clearAllSkipConfigs(userName);

    // 删除用户登入统计数据
    await withRetry(() => this.client.del(this.loginStatsKey(userName)));
  }

  // ---------- 搜索历史 ----------
  private shKey(user: string) {
    return `u:${user}:sh`; // u:username:sh
  }

  async getSearchHistory(userName: string): Promise<string[]> {
    const result = await withRetry(() =>
      this.client.lrange(this.shKey(userName), 0, -1)
    );
    // 确保返回的都是字符串类型
    return ensureStringArray(result as any[]);
  }

  async addSearchHistory(userName: string, keyword: string): Promise<void> {
    const key = this.shKey(userName);
    // 先去重
    await withRetry(() => this.client.lrem(key, 0, ensureString(keyword)));
    // 插入到最前
    await withRetry(() => this.client.lpush(key, ensureString(keyword)));
    // 限制最大长度
    await withRetry(() => this.client.ltrim(key, 0, SEARCH_HISTORY_LIMIT - 1));
  }

  async deleteSearchHistory(userName: string, keyword?: string): Promise<void> {
    const key = this.shKey(userName);
    if (keyword) {
      await withRetry(() => this.client.lrem(key, 0, ensureString(keyword)));
    } else {
      await withRetry(() => this.client.del(key));
    }
  }

  // ---------- 获取全部用户 ----------
  async getAllUsers(): Promise<string[]> {
    const keys = await this.scanKeys('u:*:pwd');
    return keys
      .map((k) => {
        const match = k.match(/^u:(.+?):pwd$/);
        return match ? ensureString(match[1]) : undefined;
      })
      .filter((u): u is string => typeof u === 'string');
  }

  // ---------- 管理员配置 ----------
  private adminConfigKey() {
    return 'admin:config';
  }

  async getAdminConfig(): Promise<AdminConfig | null> {
    const val = await withRetry(() => this.client.get(this.adminConfigKey()));
    if (!val) return null;
    return JSON.parse(String(val)) as AdminConfig;
  }

  async setAdminConfig(config: AdminConfig): Promise<void> {
    await withRetry(() =>
      this.client.set(this.adminConfigKey(), JSON.stringify(config))
    );
  }

  // ---------- 跳过片头片尾配置 ----------
  private skipHashKey(user: string) {
    return `u:${user}:skiph`;
  }

  async getSkipConfig(
    userName: string,
    source: string,
    id: string
  ): Promise<EpisodeSkipConfig | null> {
    const field = `${source}+${id}`;
    return await withRetry(() =>
      this.client.hget<EpisodeSkipConfig>(this.skipHashKey(userName), field)
    );
  }

  async setSkipConfig(
    userName: string,
    source: string,
    id: string,
    config: EpisodeSkipConfig
  ): Promise<void> {
    const field = `${source}+${id}`;

    await withRetry(() => this.client.hset(this.skipHashKey(userName), { [field]: config }));
  }

  async deleteSkipConfig(
    userName: string,
    source: string,
    id: string
  ): Promise<void> {
    const field = `${source}+${id}`;

    await withRetry(() => this.client.hdel(this.skipHashKey(userName), field));
  }

  async getAllSkipConfigs(
    userName: string
  ): Promise<{ [key: string]: EpisodeSkipConfig }> {
    const configs = await withRetry(() =>
      this.client.hgetall<Record<string, EpisodeSkipConfig>>(this.skipHashKey(userName))
    );

    return configs ?? {};
  }

  async clearAllSkipConfigs(userName: string): Promise<void> {
    await withRetry(() => this.client.del(this.skipHashKey(userName)));
  }

  // ---------- 剧集跳过配置（新版，多片段支持）----------
  private episodeSkipConfigKey(user: string, source: string, id: string) {
    return `u:${user}:episodeskip:${source}+${id}`;
  }

  async getEpisodeSkipConfig(
    userName: string,
    source: string,
    id: string
  ): Promise<EpisodeSkipConfig | null> {
    const val = await withRetry(() =>
      this.client.get(this.episodeSkipConfigKey(userName, source, id))
    );
    return val ? (val as EpisodeSkipConfig) : null;
  }

  async saveEpisodeSkipConfig(
    userName: string,
    source: string,
    id: string,
    config: EpisodeSkipConfig
  ): Promise<void> {
    await withRetry(() =>
      this.client.set(this.episodeSkipConfigKey(userName, source, id), config)
    );
  }

  async deleteEpisodeSkipConfig(
    userName: string,
    source: string,
    id: string
  ): Promise<void> {
    await withRetry(() =>
      this.client.del(this.episodeSkipConfigKey(userName, source, id))
    );
  }

  async getAllEpisodeSkipConfigs(
    userName: string
  ): Promise<{ [key: string]: EpisodeSkipConfig }> {
    const pattern = `u:${userName}:episodeskip:*`;
    const keys = await this.scanKeys(pattern);

    if (keys.length === 0) {
      return {};
    }

    const configs: { [key: string]: EpisodeSkipConfig } = {};

    // 批量获取所有配置
    const values = await withRetry(() => this.client.mget(keys));

    keys.forEach((key, index) => {
      const value = values[index];
      if (value) {
        // 从key中提取source+id
        const match = key.match(/^u:.+?:episodeskip:(.+)$/);
        if (match) {
          const sourceAndId = match[1];
          configs[sourceAndId] = value as EpisodeSkipConfig;
        }
      }
    });

    return configs;
  }

  // 清空所有数据
  async clearAllData(): Promise<void> {
    try {
      // 获取所有用户
      const allUsers = await this.getAllUsers();

      // 删除所有用户及其数据
      for (const username of allUsers) {
        await this.deleteUser(username);
      }

      // 删除管理员配置
      await withRetry(() => this.client.del(this.adminConfigKey()));

      console.log('所有数据已清空');
    } catch (error) {
      console.error('清空数据失败:', error);
      throw new Error('清空数据失败');
    }
  }

  // ---------- 通用缓存方法 ----------
  private cacheKey(key: string) {
    return `cache:${key}`;
  }

  async getCache(key: string): Promise<any | null> {
    try {
      const val = await withRetry(() => this.client.get(this.cacheKey(key)));
      if (!val) return null;

      // 智能处理返回值：Upstash 可能返回字符串或已解析的对象
      if (typeof val === 'string') {
        try {
          return JSON.parse(val);
        } catch (parseError) {
          console.warn(`JSON解析失败，返回原字符串 (key: ${key}):`, parseError);
          return val; // 解析失败返回原字符串
        }
      } else {
        // Upstash 可能直接返回解析后的对象
        return val;
      }
    } catch (error) {
      console.error(`Upstash getCache error (key: ${key}):`, error);
      return null;
    }
  }

  async setCache(
    key: string,
    data: any,
    expireSeconds?: number
  ): Promise<void> {
    const cacheKey = this.cacheKey(key);
    const value = JSON.stringify(data);

    if (expireSeconds) {
      await withRetry(() => this.client.setex(cacheKey, expireSeconds, value));
    } else {
      await withRetry(() => this.client.set(cacheKey, value));
    }
  }

  async deleteCache(key: string): Promise<void> {
    await withRetry(() => this.client.del(this.cacheKey(key)));
  }

  async keys(pattern: string): Promise<string[]> {
    try {
      return await this.scanKeys(pattern);
    } catch (error) {
      console.error(`Upstash keys error (pattern: ${pattern}):`, error);
      return [];
    }
  }

  async clearExpiredCache(prefix?: string): Promise<void> {
    // Upstash的TTL机制会自动清理过期数据，这里主要用于手动清理
    // 可以根据需要实现特定前缀的缓存清理
    const pattern = prefix ? `cache:${prefix}*` : 'cache:*';
    const keys = await this.scanKeys(pattern);

    if (keys.length > 0) {
      await withRetry(() => this.client.del(...keys));
      console.log(
        `Cleared ${keys.length} cache entries with pattern: ${pattern}`
      );
    }
  }

  // ---------- Redis 业务结构化能力 ----------
  private slotUserKey(userName: string) {
    return `slot:user:${userName}`;
  }

  private slotUsersKey() {
    return 'slot:users';
  }

  private slotRankKey(type: string) {
    return `slot:rank:${type}`;
  }

  private getSlotRankTypes() {
    return ['coins', 'biggestWin', 'totalWins'];
  }

  private getSlotRankScore(data: SlotUserData, type: string): number {
    return Number(data[type] || 0);
  }

  private async updateSlotRanks(
    userName: string,
    data: SlotUserData
  ): Promise<void> {
    for (const type of this.getSlotRankTypes()) {
      await withRetry(() =>
        this.client.zadd(this.slotRankKey(type), {
          score: this.getSlotRankScore(data, type),
          member: userName,
        })
      );
    }
  }

  private parseRankMembers(raw: unknown): string[] {
    if (!Array.isArray(raw)) {
      return [];
    }

    if (raw.length > 0 && Array.isArray(raw[0])) {
      return raw.map((item) => String(item[0]));
    }

    if (raw.length > 0 && typeof raw[0] === 'object' && raw[0] !== null) {
      return raw
        .map((item: any) => item.member ?? item.value ?? item[0])
        .filter((member) => member !== undefined)
        .map(String);
    }

    const members: string[] = [];
    for (let i = 0; i < raw.length; i += 2) {
      members.push(String(raw[i]));
    }
    return members;
  }

  async getSlotUserData(userName: string): Promise<SlotUserData | null> {
    const hashData = await withRetry(() =>
      this.client.hgetall<Record<string, unknown>>(this.slotUserKey(userName))
    );

    return hashData && Object.keys(hashData).length > 0
      ? this.decodeHashObject(hashData)
      : null;
  }

  async setSlotUserData(
    userName: string,
    data: SlotUserData,
    expireSeconds = 86400 * 30
  ): Promise<void> {
    const key = this.slotUserKey(userName);
    await withRetry(() => this.client.hset(key, this.encodeHashObject(data)));
    await withRetry(() => this.client.expire(key, expireSeconds));
    await withRetry(() => this.client.sadd(this.slotUsersKey(), userName));
    await this.updateSlotRanks(userName, data);
  }

  async listSlotUsers(): Promise<Array<SlotUserData & { username: string }>> {
    const users = await withRetry(() =>
      this.client.smembers<string[]>(this.slotUsersKey())
    );

    const result: Array<SlotUserData & { username: string }> = [];
    for (const userName of users ?? []) {
      const data = await this.getSlotUserData(userName);
      if (data) {
        result.push({ username: userName, ...data });
      }
    }
    return result;
  }

  async getSlotLeaderboard(
    type = 'coins',
    limit = 10
  ): Promise<Array<SlotUserData & { username: string }>> {
    const rankType = this.getSlotRankTypes().includes(type) ? type : 'coins';

    const raw = await withRetry(() =>
      this.client.zrange(this.slotRankKey(rankType), 0, Math.max(0, limit - 1), {
        rev: true,
        withScores: true,
      })
    );

    const result: Array<SlotUserData & { username: string }> = [];
    for (const userName of this.parseRankMembers(raw)) {
      const data = await this.getSlotUserData(userName);
      if (data) {
        result.push({ username: userName, ...data });
      }
    }
    return result;
  }

  async incrementRateLimit(key: string, expireSeconds: number): Promise<number> {
    const count = await withRetry(() => this.client.incr(key));
    if (count === 1) {
      await withRetry(() => this.client.expire(key, expireSeconds));
    }
    return count;
  }

  // ---------- 播放统计相关 ----------
  async getPlayStats(): Promise<PlayStatsResult> {
    try {
      const cached = await this.getCache('play_stats_summary');
      if (cached) {
        return cached as PlayStatsResult;
      }

      const allUsers = await this.getAllUsers();
      const userStats: Array<{
        username: string;
        totalWatchTime: number;
        totalPlays: number;
        lastPlayTime: number;
        recentRecords: PlayRecord[];
        avgWatchTime: number;
        mostWatchedSource: string;
        registrationDays: number;
        lastLoginTime: number;
        loginCount: number;
        createdAt: number;
      }> = [];
      let totalWatchTime = 0;
      let totalPlays = 0;
      const sourceCount: Record<string, number> = {};
      const dailyData: Record<string, { watchTime: number; plays: number }> = {};

      const now = Date.now();
      const todayStart = new Date(now).setHours(0, 0, 0, 0);
      let todayNewUsers = 0;
      const registrationData: Record<string, number> = {};

      const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
      const PROJECT_START_DATE = new Date('2025-09-14').getTime();

      for (const username of allUsers) {
        const records = await this.getAllPlayRecords(username);
        const playRecords = Object.values(records);

        let userTotalWatchTime = 0;
        let userLastPlayTime = 0;
        const userSourceCount: Record<string, number> = {};
        let firstWatchDate = PROJECT_START_DATE;

        playRecords.forEach((record) => {
          const watchTime = record.play_time || 0;
          userTotalWatchTime += watchTime;
          if (record.save_time > userLastPlayTime) {
            userLastPlayTime = record.save_time;
          }
          if (record.save_time < firstWatchDate) {
            firstWatchDate = record.save_time;
          }
          const sourceName = record.source_name || '未知来源';
          userSourceCount[sourceName] = (userSourceCount[sourceName] || 0) + 1;

          const recordDate = new Date(record.save_time);
          if (recordDate.getTime() >= sevenDaysAgo) {
            const dateKey = recordDate.toISOString().split('T')[0];
            if (!dailyData[dateKey]) {
              dailyData[dateKey] = { watchTime: 0, plays: 0 };
            }
            dailyData[dateKey].watchTime += watchTime;
            dailyData[dateKey].plays += 1;
          }
        });

        const userCreatedAt = firstWatchDate;
        const registrationDays =
          Math.floor((now - userCreatedAt) / (1000 * 60 * 60 * 24)) + 1;

        if (userCreatedAt >= todayStart) {
          todayNewUsers++;
        }

        if (userCreatedAt >= sevenDaysAgo) {
          const regDate = new Date(userCreatedAt).toISOString().split('T')[0];
          registrationData[regDate] = (registrationData[regDate] || 0) + 1;
        }

        let mostWatchedSource = '';
        let maxCount = 0;
        for (const [source, count] of Object.entries(userSourceCount)) {
          if (count > maxCount) {
            maxCount = count;
            mostWatchedSource = source;
          }
        }

        const recentRecords = playRecords
          .sort((a, b) => (b.save_time || 0) - (a.save_time || 0))
          .slice(0, 10);

        const enhancedUserStat = {
          username,
          totalWatchTime: userTotalWatchTime,
          totalPlays: playRecords.length,
          lastPlayTime: userLastPlayTime,
          recentRecords,
          avgWatchTime:
            playRecords.length > 0 ? userTotalWatchTime / playRecords.length : 0,
          mostWatchedSource,
          registrationDays,
          lastLoginTime: userLastPlayTime,
          loginCount: 0,
          createdAt: userCreatedAt,
        };

        userStats.push(enhancedUserStat);
        totalWatchTime += userTotalWatchTime;
        totalPlays += playRecords.length;

        Object.entries(userSourceCount).forEach(([source, count]) => {
          sourceCount[source] = (sourceCount[source] || 0) + count;
        });
      }

      userStats.sort((a, b) => b.totalWatchTime - a.totalWatchTime);

      const topSources = Object.entries(sourceCount)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([source, count]) => ({ source, count }));

      const dailyStats: Array<{
        date: string;
        watchTime: number;
        plays: number;
      }> = [];
      for (let i = 6; i >= 0; i--) {
        const date = new Date(now - i * 24 * 60 * 60 * 1000);
        const dateKey = date.toISOString().split('T')[0];
        const data = dailyData[dateKey] || { watchTime: 0, plays: 0 };
        dailyStats.push({
          date: dateKey,
          watchTime: data.watchTime,
          plays: data.plays,
        });
      }

      // 计算注册趋势
      const registrationStats = [];
      for (let i = 6; i >= 0; i--) {
        const date = new Date(now - i * 24 * 60 * 60 * 1000);
        const dateKey = date.toISOString().split('T')[0];
        registrationStats.push({
          date: dateKey,
          newUsers: registrationData[dateKey] || 0,
        });
      }

      // 计算活跃用户统计
      const oneDayAgo = now - 24 * 60 * 60 * 1000;
      const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

      const activeUsers = {
        daily: userStats.filter((user) => user.lastLoginTime >= oneDayAgo)
          .length,
        weekly: userStats.filter((user) => user.lastLoginTime >= sevenDaysAgo)
          .length,
        monthly: userStats.filter((user) => user.lastLoginTime >= thirtyDaysAgo)
          .length,
      };

      const result: PlayStatsResult = {
        totalUsers: allUsers.length,
        totalWatchTime,
        totalPlays,
        avgWatchTimePerUser:
          allUsers.length > 0 ? totalWatchTime / allUsers.length : 0,
        avgPlaysPerUser: allUsers.length > 0 ? totalPlays / allUsers.length : 0,
        userStats,
        topSources,
        dailyStats,
        // 新增：用户注册统计
        registrationStats: {
          todayNewUsers,
          totalRegisteredUsers: allUsers.length,
          registrationTrend: registrationStats,
        },
        // 新增：用户活跃度统计
        activeUsers,
      };

      // 缓存结果30分钟
      await this.setCache('play_stats_summary', result, 1800);
      return result;
    } catch (error) {
      console.error('获取播放统计失败:', error);
      return {
        totalUsers: 0,
        totalWatchTime: 0,
        totalPlays: 0,
        avgWatchTimePerUser: 0,
        avgPlaysPerUser: 0,
        userStats: [],
        topSources: [],
        dailyStats: [],
        // 新增：用户注册统计
        registrationStats: {
          todayNewUsers: 0,
          totalRegisteredUsers: 0,
          registrationTrend: [],
        },
        // 新增：用户活跃度统计
        activeUsers: {
          daily: 0,
          weekly: 0,
          monthly: 0,
        },
      };
    }
  }

  async getUserPlayStat(userName: string): Promise<UserPlayStat> {
    // 检查缓存
    const now = Date.now();
    const cached = this.userStatsCache.get(userName);
    if (cached && now - cached.timestamp < this.userStatsCacheTTL) {
      console.log(`[Upstash] 用户 ${userName} 统计数据从缓存获取`);
      return cached.data;
    }

    try {
      // 获取用户的所有播放记录
      const records = await this.getAllPlayRecords(userName);
      const playRecords = Object.values(records);

      if (playRecords.length === 0) {
        // 即使没有播放记录，也要获取登入统计
        let loginStats = {
          loginCount: 0,
          firstLoginTime: 0,
          lastLoginTime: 0,
          lastLoginDate: 0,
        };

        try {
          loginStats = await this.getLoginStats(userName);
        } catch (error) {
          console.error(`获取用户 ${userName} 登入统计失败:`, error);
        }

        return {
          username: userName,
          totalWatchTime: 0,
          totalPlays: 0,
          lastPlayTime: 0,
          recentRecords: [],
          avgWatchTime: 0,
          mostWatchedSource: '',
          // 新增字段
          totalMovies: 0,
          firstWatchDate: Date.now(),
          lastUpdateTime: Date.now(),
          // 登入统计字段
          loginCount: loginStats.loginCount,
          firstLoginTime: loginStats.firstLoginTime,
          lastLoginTime: loginStats.lastLoginTime,
          lastLoginDate: loginStats.lastLoginDate,
        };
      }

      // 计算统计
      let totalWatchTime = 0;
      let lastPlayTime = 0;
      const sourceCount: Record<string, number> = {};

      playRecords.forEach((record) => {
        totalWatchTime += record.play_time || 0;
        if (record.save_time > lastPlayTime) {
          lastPlayTime = record.save_time;
        }
        const sourceName = record.source_name || '未知来源';
        sourceCount[sourceName] = (sourceCount[sourceName] || 0) + 1;
      });

      // 计算观看影片总数（去重）
      const totalMovies = new Set(
        playRecords.map((r) => `${r.title}_${r.source_name}_${r.year}`)
      ).size;

      // 计算首次观看时间
      const firstWatchDate = Math.min(
        ...playRecords.map((r) => r.save_time || Date.now())
      );

      // 获取最近播放记录
      const recentRecords = playRecords
        .sort((a, b) => (b.save_time || 0) - (a.save_time || 0))
        .slice(0, 10);

      // 找出最常观看的来源
      let mostWatchedSource = '';
      let maxCount = 0;
      for (const [source, count] of Object.entries(sourceCount)) {
        if (count > maxCount) {
          maxCount = count;
          mostWatchedSource = source;
        }
      }

      // 获取登入统计数据
      let loginStats = {
        loginCount: 0,
        firstLoginTime: 0,
        lastLoginTime: 0,
        lastLoginDate: 0,
      };

      try {
        loginStats = await this.getLoginStats(userName);
      } catch (error) {
        console.error(`获取用户 ${userName} 登入统计失败:`, error);
      }

      const result = {
        username: userName,
        totalWatchTime,
        totalPlays: playRecords.length,
        lastPlayTime,
        recentRecords,
        avgWatchTime:
          playRecords.length > 0 ? totalWatchTime / playRecords.length : 0,
        mostWatchedSource,
        totalMovies,
        firstWatchDate,
        lastUpdateTime: Date.now(),
        loginCount: loginStats.loginCount,
        firstLoginTime: loginStats.firstLoginTime,
        lastLoginTime: loginStats.lastLoginTime,
        lastLoginDate: loginStats.lastLoginDate,
      };

      // 存入缓存
      this.userStatsCache.set(userName, {
        data: result,
        timestamp: Date.now(),
      });

      return result;
    } catch (error) {
      console.error(`获取用户 ${userName} 统计失败:`, error);
      const errorResult = {
        username: userName,
        totalWatchTime: 0,
        totalPlays: 0,
        lastPlayTime: 0,
        recentRecords: [],
        avgWatchTime: 0,
        mostWatchedSource: '',
        totalMovies: 0,
        firstWatchDate: Date.now(),
        lastUpdateTime: Date.now(),
        loginCount: 0,
        firstLoginTime: 0,
        lastLoginTime: 0,
        lastLoginDate: 0,
      };

      // 错误时也存入缓存，避免短时间内重复请求
      this.userStatsCache.set(userName, {
        data: errorResult,
        timestamp: Date.now(),
      });

      return errorResult;
    }
  }

  async getContentStats(limit = 10): Promise<ContentStat[]> {
    try {
      // 获取所有用户的播放记录
      const allUsers = await this.getAllUsers();
      const contentStats: Record<
        string,
        {
          source: string;
          id: string;
          title: string;
          source_name: string;
          cover: string;
          year: string;
          playCount: number;
          totalWatchTime: number;
          uniqueUsers: Set<string>;
          lastPlayed: number;
        }
      > = {};

      for (const username of allUsers) {
        const records = await this.getAllPlayRecords(username);
        Object.entries(records).forEach(([key, record]) => {
          if (!contentStats[key]) {
            // 从key中解析source和id
            const [source, id] = key.split('+', 2);
            contentStats[key] = {
              source: source || '',
              id: id || '',
              title: record.title || '未知标题',
              source_name: record.source_name || '未知来源',
              cover: record.cover || '',
              year: record.year || '',
              playCount: 0,
              totalWatchTime: 0,
              uniqueUsers: new Set(),
              lastPlayed: 0,
            };
          }

          const stat = contentStats[key];
          stat.playCount += 1;
          stat.totalWatchTime += record.play_time || 0;
          stat.uniqueUsers.add(username);
          if (record.save_time > stat.lastPlayed) {
            stat.lastPlayed = record.save_time;
          }
        });
      }

      // 转换 Set 为数量并排序
      const result = Object.values(contentStats)
        .map((stat) => ({
          source: stat.source,
          id: stat.id,
          title: stat.title,
          source_name: stat.source_name,
          cover: stat.cover,
          year: stat.year,
          playCount: stat.playCount,
          totalWatchTime: stat.totalWatchTime,
          averageWatchTime:
            stat.playCount > 0 ? stat.totalWatchTime / stat.playCount : 0,
          lastPlayed: stat.lastPlayed,
          uniqueUsers: stat.uniqueUsers.size,
        }))
        .sort((a, b) => b.playCount - a.playCount)
        .slice(0, limit);

      return result;
    } catch (error) {
      console.error('获取内容统计失败:', error);
      return [];
    }
  }

  async updatePlayStatistics(
    _userName: string,
    _source: string,
    _id: string,
    _watchTime: number
  ): Promise<void> {
    try {
      // 清除全站统计缓存，下次查询时重新计算
      await this.deleteCache('play_stats_summary');
    } catch (error) {
      console.error('更新播放统计失败:', error);
    }
  }

  // 更新用户登入统计
  async updateUserLoginStats(
    userName: string,
    loginTime: number,
    isFirstLogin?: boolean
  ): Promise<void> {
    try {
      const loginStatsKey = this.loginStatsKey(userName);
      const currentStats = await this.getLoginStats(userName);
      const firstLoginTime =
        isFirstLogin || !currentStats.firstLoginTime
          ? loginTime
          : currentStats.firstLoginTime;

      const loginCount = await withRetry(() =>
        this.client.hincrby(loginStatsKey, 'loginCount', 1)
      );
      const loginStats = {
        loginCount,
        firstLoginTime,
        lastLoginTime: loginTime,
        lastLoginDate: loginTime,
      };

      await withRetry(() =>
        this.client.hset(loginStatsKey, {
          firstLoginTime: loginStats.firstLoginTime,
          lastLoginTime: loginStats.lastLoginTime,
          lastLoginDate: loginStats.lastLoginDate,
        })
      );

      console.log(`用户 ${userName} 登入统计已更新:`, loginStats);
    } catch (error) {
      console.error(`更新用户 ${userName} 登入统计失败:`, error);
      throw error;
    }
  }

  // ---------- 访问日志相关 ----------
  // 已禁用：访问日志会产生大量 Redis 调用，导致 Upstash 费用过高
  async saveAccessLog(_accessLog: AccessLog): Promise<void> {
    console.log('[Upstash] 访问日志功能已禁用以节省 Upstash 调用次数');
  }

  async getAccessLogs(
    _filters: {
      username?: string;
      startTime?: number;
      endTime?: number;
      action?: string;
    },
    _limit = 50,
    _offset = 0
  ): Promise<AccessLog[]> {
    console.log('[Upstash] 访问日志功能已禁用，返回空数组');
    return [];
  }

  async deleteAccessLogs(_username?: string): Promise<number> {
    console.log('[Upstash] 访问日志功能已禁用，跳过删除操作');
    return 0;
  }
}

// 单例 Upstash Redis 客户端
function getUpstashRedisClient(): Redis {
  const globalKey = Symbol.for('__MOONTV_UPSTASH_REDIS_CLIENT__');
  let client: Redis | undefined = (global as any)[globalKey];

  if (!client) {
    const upstashUrl = process.env.UPSTASH_URL;
    const upstashToken = process.env.UPSTASH_TOKEN;

    if (!upstashUrl || !upstashToken) {
      throw new Error(
        'UPSTASH_URL and UPSTASH_TOKEN env variables must be set'
      );
    }

    // 创建 Upstash Redis 客户端
    client = new Redis({
      url: upstashUrl,
      token: upstashToken,
      // 可选配置
      retry: {
        retries: 3,
        backoff: (retryCount: number) =>
          Math.min(1000 * Math.pow(2, retryCount), 30000),
      },
    });

    console.log('Upstash Redis client created successfully');

    (global as any)[globalKey] = client;
  }

  return client;
}
