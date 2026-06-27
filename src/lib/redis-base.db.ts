/* eslint-disable no-console, @typescript-eslint/no-explicit-any, @typescript-eslint/no-non-null-assertion */

import { createClient, RedisClientType } from 'redis';

import { AdminConfig } from './admin.types';
import { parseStorageKey } from './storage-key';
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

// 连接配置接口
export interface RedisConnectionConfig {
  url: string;
  clientName: string; // 用于日志显示，如 "Redis" 或 "Pika"
}

// 添加Redis操作重试包装器
function createRetryWrapper(
  clientName: string,
  getClient: () => RedisClientType,
) {
  return async function withRetry<T>(
    operation: () => Promise<T>,
    maxRetries = 3,
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
          err.code === 'EPIPE';

        if (isConnectionError && !isLastAttempt) {
          console.error('Error:', err.message);

          // 等待一段时间后重试
          await new Promise((resolve) => setTimeout(resolve, 1000 * (i + 1)));

          // 尝试重新连接
          try {
            const client = getClient();
            if (!client.isOpen) {
              await client.connect();
            }
          } catch (reconnectErr) {
            console.error('Failed to reconnect:', reconnectErr);
          }

          continue;
        }

        throw err;
      }
    }

    throw new Error('Max retries exceeded');
  };
}

// 创建客户端的工厂函数
export function createRedisClient(
  config: RedisConnectionConfig,
  globalSymbol: symbol,
): RedisClientType {
  let client: RedisClientType | undefined = (global as any)[globalSymbol];

  if (!client) {
    if (!config.url) {
      throw new Error(`${config.clientName}_URL env variable not set`);
    }

    // 创建客户端配置
    const clientConfig: any = {
      url: config.url,
      socket: {
        // 重连策略：指数退避，最大30秒
        reconnectStrategy: (retries: number) => {
          if (retries > 10) {
            console.error(
              `${config.clientName} max reconnection attempts exceeded`,
            );
            return false; // 停止重连
          }
          return Math.min(1000 * Math.pow(2, retries), 30000); // 指数退避，最大30秒
        },
        connectTimeout: 10000, // 10秒连接超时
        // 设置no delay，减少延迟
        noDelay: true,
      },
      // 添加其他配置
      pingInterval: 30000, // 30秒ping一次，保持连接活跃
    };

    client = createClient(clientConfig);

    // 添加错误事件监听
    client.on('error', (err) => {
      console.error(`${config.clientName} client error:`, err);
    });

    client.on('connect', () => {
      /* no-op */
    });

    client.on('reconnecting', () => {
      /* no-op */
    });

    client.on('ready', () => {
      /* no-op */
    });

    // 初始连接，带重试机制
    const connectWithRetry = async () => {
      try {
        await client!.connect();
      } catch (err) {
        console.error(`${config.clientName} initial connection failed:`, err);
        setTimeout(connectWithRetry, 5000);
      }
    };

    connectWithRetry();

    (global as any)[globalSymbol] = client;
  }

  return client;
}

// 抽象基类，包含所有通用的Redis操作逻辑
export abstract class BaseRedisStorage implements IStorage {
  protected client: RedisClientType;
  protected config: RedisConnectionConfig;
  protected withRetry: <T>(
    operation: () => Promise<T>,
    maxRetries?: number,
  ) => Promise<T>;

  constructor(config: RedisConnectionConfig, globalSymbol: symbol) {
    this.config = config; // 保存配置
    this.client = createRedisClient(config, globalSymbol);
    this.withRetry = createRetryWrapper(config.clientName, () => this.client);
  }

  // ---------- 播放记录 ----------
  private prHashKey(user: string) {
    return `u:${user}:prh`;
  }

  private parseJsonValue<T>(value: string | null): T | null {
    return value ? (JSON.parse(value) as T) : null;
  }

  private async scanKeys(pattern: string): Promise<string[]> {
    const keys: string[] = [];
    let cursor = '0';

    do {
      const reply = (await this.withRetry(() =>
        this.client.sendCommand([
          'SCAN',
          cursor,
          'MATCH',
          pattern,
          'COUNT',
          '100',
        ]),
      )) as [string, string[]];

      cursor = String(reply[0]);
      keys.push(...reply[1]);
    } while (cursor !== '0');

    return keys;
  }

  private encodeHashValue(value: any): string {
    return JSON.stringify(value);
  }

  private decodeHashValue(value: string | undefined): any {
    if (value === undefined) {
      return undefined;
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
      ]),
    );
  }

  private decodeHashObject(data: Record<string, string>): Record<string, any> {
    return Object.fromEntries(
      Object.entries(data).map(([key, value]) => [
        key,
        this.decodeHashValue(value),
      ]),
    );
  }

  async getPlayRecord(
    userName: string,
    key: string,
  ): Promise<PlayRecord | null> {
    const hashVal = await this.withRetry(() =>
      this.client.hGet(this.prHashKey(userName), key),
    );
    return this.parseJsonValue<PlayRecord>(hashVal);
  }

  async setPlayRecord(
    userName: string,
    key: string,
    record: PlayRecord,
  ): Promise<void> {
    await this.withRetry(() =>
      this.client.hSet(this.prHashKey(userName), key, JSON.stringify(record)),
    );
  }

  async getAllPlayRecords(
    userName: string,
  ): Promise<Record<string, PlayRecord>> {
    const hashRecords = await this.withRetry(() =>
      this.client.hGetAll(this.prHashKey(userName)),
    );
    const result: Record<string, PlayRecord> = {};
    Object.entries(hashRecords).forEach(([key, raw]) => {
      const record = this.parseJsonValue<PlayRecord>(raw);
      if (record) {
        result[key] = record;
      }
    });
    return result;
  }

  async deletePlayRecord(userName: string, key: string): Promise<void> {
    await this.withRetry(() => this.client.hDel(this.prHashKey(userName), key));
  }

  async clearAllPlayRecords(userName: string): Promise<void> {
    await this.withRetry(() => this.client.del(this.prHashKey(userName)));
  }

  // ---------- 收藏 ----------
  private favHashKey(user: string) {
    return `u:${user}:favh`;
  }

  async getFavorite(userName: string, key: string): Promise<Favorite | null> {
    const hashVal = await this.withRetry(() =>
      this.client.hGet(this.favHashKey(userName), key),
    );
    return this.parseJsonValue<Favorite>(hashVal);
  }

  async setFavorite(
    userName: string,
    key: string,
    favorite: Favorite,
  ): Promise<void> {
    await this.withRetry(() =>
      this.client.hSet(
        this.favHashKey(userName),
        key,
        JSON.stringify(favorite),
      ),
    );
  }

  async getAllFavorites(userName: string): Promise<Record<string, Favorite>> {
    const hashFavorites = await this.withRetry(() =>
      this.client.hGetAll(this.favHashKey(userName)),
    );
    const result: Record<string, Favorite> = {};
    Object.entries(hashFavorites).forEach(([key, raw]) => {
      const fav = this.parseJsonValue<Favorite>(raw);
      if (fav) {
        result[key] = fav;
      }
    });

    return result;
  }

  async deleteFavorite(userName: string, key: string): Promise<void> {
    await this.withRetry(() =>
      this.client.hDel(this.favHashKey(userName), key),
    );
  }

  // ---------- 用户注册 / 登录 ----------
  private userPwdKey(user: string) {
    return `u:${user}:pwd`;
  }

  async registerUser(userName: string, password: string): Promise<void> {
    // 简单存储明文密码，生产环境应加密
    await this.withRetry(() =>
      this.client.set(this.userPwdKey(userName), password),
    );
  }

  async verifyUser(userName: string, password: string): Promise<boolean> {
    const stored = await this.withRetry(() =>
      this.client.get(this.userPwdKey(userName)),
    );
    if (stored === null) return false;
    // 确保比较时都是字符串类型
    return ensureString(stored) === password;
  }

  // 检查用户是否存在
  async checkUserExist(userName: string): Promise<boolean> {
    // 使用 EXISTS 判断 key 是否存在
    const exists = await this.withRetry(() =>
      this.client.exists(this.userPwdKey(userName)),
    );
    return exists === 1;
  }

  // 修改用户密码
  async changePassword(userName: string, newPassword: string): Promise<void> {
    // 简单存储明文密码，生产环境应加密
    await this.withRetry(() =>
      this.client.set(this.userPwdKey(userName), newPassword),
    );
  }

  // 删除用户及其所有数据
  async deleteUser(userName: string): Promise<void> {
    // 删除用户密码
    await this.withRetry(() => this.client.del(this.userPwdKey(userName)));

    // 删除搜索历史
    await this.withRetry(() => this.client.del(this.shKey(userName)));

    // 删除播放记录
    await this.clearAllPlayRecords(userName);

    // 删除收藏夹
    await this.withRetry(() => this.client.del(this.favHashKey(userName)));

    // 删除跳过片头片尾配置
    await this.clearAllSkipConfigs(userName);

    // 删除用户登入统计数据
    await this.withRetry(() => this.client.del(this.loginStatsKey(userName)));
  }

  // ---------- 搜索历史 ----------
  private shKey(user: string) {
    return `u:${user}:sh`; // u:username:sh
  }

  async getSearchHistory(userName: string): Promise<string[]> {
    const result = await this.withRetry(() =>
      this.client.lRange(this.shKey(userName), 0, -1),
    );
    // 确保返回的都是字符串类型
    return ensureStringArray(result as any[]);
  }

  async addSearchHistory(userName: string, keyword: string): Promise<void> {
    const key = this.shKey(userName);
    // 先去重
    await this.withRetry(() => this.client.lRem(key, 0, ensureString(keyword)));
    // 插入到最前
    await this.withRetry(() => this.client.lPush(key, ensureString(keyword)));
    // 限制最大长度
    await this.withRetry(() =>
      this.client.lTrim(key, 0, SEARCH_HISTORY_LIMIT - 1),
    );
  }

  async deleteSearchHistory(userName: string, keyword?: string): Promise<void> {
    const key = this.shKey(userName);
    if (keyword) {
      await this.withRetry(() =>
        this.client.lRem(key, 0, ensureString(keyword)),
      );
    } else {
      await this.withRetry(() => this.client.del(key));
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
    const val = await this.withRetry(() =>
      this.client.get(this.adminConfigKey()),
    );
    return val ? (JSON.parse(val) as AdminConfig) : null;
  }

  async setAdminConfig(config: AdminConfig): Promise<void> {
    await this.withRetry(() =>
      this.client.set(this.adminConfigKey(), JSON.stringify(config)),
    );
  }

  // ---------- 跳过片头片尾配置 ----------
  private skipHashKey(user: string) {
    return `u:${user}:skiph`;
  }

  async getSkipConfig(
    userName: string,
    source: string,
    id: string,
  ): Promise<EpisodeSkipConfig | null> {
    const field = `${source}+${id}`;
    const hashVal = await this.withRetry(() =>
      this.client.hGet(this.skipHashKey(userName), field),
    );
    return this.parseJsonValue<EpisodeSkipConfig>(hashVal);
  }

  async setSkipConfig(
    userName: string,
    source: string,
    id: string,
    config: EpisodeSkipConfig,
  ): Promise<void> {
    await this.withRetry(() =>
      this.client.hSet(
        this.skipHashKey(userName),
        `${source}+${id}`,
        JSON.stringify(config),
      ),
    );
  }

  async deleteSkipConfig(
    userName: string,
    source: string,
    id: string,
  ): Promise<void> {
    await this.withRetry(() =>
      this.client.hDel(this.skipHashKey(userName), `${source}+${id}`),
    );
  }

  async getAllSkipConfigs(
    userName: string,
  ): Promise<{ [key: string]: EpisodeSkipConfig }> {
    const hashConfigs = await this.withRetry(() =>
      this.client.hGetAll(this.skipHashKey(userName)),
    );
    const configs: { [key: string]: EpisodeSkipConfig } = {};
    Object.entries(hashConfigs).forEach(([key, raw]) => {
      const config = this.parseJsonValue<EpisodeSkipConfig>(raw);
      if (config) {
        configs[key] = config;
      }
    });
    return configs;
  }

  async clearAllSkipConfigs(userName: string): Promise<void> {
    await this.withRetry(() => this.client.del(this.skipHashKey(userName)));
  }

  // ---------- 剧集跳过配置（新版，多片段支持）----------
  private episodeSkipConfigKey(user: string, source: string, id: string) {
    return `u:${user}:episodeskip:${source}+${id}`;
  }

  async getEpisodeSkipConfig(
    userName: string,
    source: string,
    id: string,
  ): Promise<EpisodeSkipConfig | null> {
    const val = await this.withRetry(() =>
      this.client.get(this.episodeSkipConfigKey(userName, source, id)),
    );
    return val ? (JSON.parse(val) as EpisodeSkipConfig) : null;
  }

  async saveEpisodeSkipConfig(
    userName: string,
    source: string,
    id: string,
    config: EpisodeSkipConfig,
  ): Promise<void> {
    await this.withRetry(() =>
      this.client.set(
        this.episodeSkipConfigKey(userName, source, id),
        JSON.stringify(config),
      ),
    );
  }

  async deleteEpisodeSkipConfig(
    userName: string,
    source: string,
    id: string,
  ): Promise<void> {
    await this.withRetry(() =>
      this.client.del(this.episodeSkipConfigKey(userName, source, id)),
    );
  }

  async getAllEpisodeSkipConfigs(
    userName: string,
  ): Promise<{ [key: string]: EpisodeSkipConfig }> {
    const pattern = `u:${userName}:episodeskip:*`;
    const keys = await this.scanKeys(pattern);

    if (keys.length === 0) {
      return {};
    }

    const configs: { [key: string]: EpisodeSkipConfig } = {};

    // 批量获取所有配置
    const values = await this.withRetry(() => this.client.mGet(keys));

    keys.forEach((key, index) => {
      const value = values[index];
      if (value) {
        // 从key中提取source+id
        const match = key.match(/^u:.+?:episodeskip:(.+)$/);
        if (match) {
          const sourceAndId = match[1];
          configs[sourceAndId] = JSON.parse(
            value as string,
          ) as EpisodeSkipConfig;
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
      await this.withRetry(() => this.client.del(this.adminConfigKey()));
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
      const cacheKey = this.cacheKey(key);
      const val = await this.withRetry(() => this.client.get(cacheKey));

      // 如果 key 不存在，检查 TTL（调试用）
      if (!val && process.env.NODE_ENV === 'development') {
        const ttl = await this.withRetry(() => this.client.ttl(cacheKey));
        if (ttl === -2) {
          /* key 不存在 */
        } else if (ttl === -1) {
          console.warn(
            `${this.config.clientName} getCache: Key ${key} exists but has no expiration (TTL: -1)`,
          );
        } else if (ttl > 0) {
          console.warn(
            `${this.config.clientName} getCache: Key ${key} exists with TTL ${ttl}s but returned null value`,
          );
        }
        return null;
      }

      if (!val) return null;

      // 调试：显示剩余 TTL
      if (process.env.NODE_ENV === 'development') {
        const _ttl = await this.withRetry(() => this.client.ttl(cacheKey));
      }

      // 智能处理返回值：兼容不同Redis客户端的行为
      if (typeof val === 'string') {
        // 检查是否是HTML错误页面
        if (
          val.trim().startsWith('<!DOCTYPE') ||
          val.trim().startsWith('<html')
        ) {
          console.error(
            `${this.config.clientName} returned HTML instead of JSON. Connection issue detected.`,
          );
          return null;
        }

        try {
          return JSON.parse(val);
        } catch (parseError) {
          console.warn(
            `${this.config.clientName} JSON解析失败，返回原字符串 (key: ${key}):`,
            parseError,
          );
          return val; // 解析失败返回原字符串
        }
      } else {
        // 某些Redis客户端可能直接返回解析后的对象
        return val;
      }
    } catch (error: any) {
      console.error(
        `${this.config.clientName} getCache error (key: ${key}):`,
        error,
      );
      return null;
    }
  }

  async setCache(
    key: string,
    data: any,
    expireSeconds?: number,
  ): Promise<void> {
    try {
      const cacheKey = this.cacheKey(key);
      const value = JSON.stringify(data);

      if (expireSeconds !== undefined) {
        // 验证 TTL 值的有效性
        if (expireSeconds <= 0) {
          const error = new Error(
            `${this.config.clientName} Invalid TTL: ${expireSeconds} seconds. TTL must be positive.`,
          );
          console.error(error.message);
          throw error;
        }

        // Kvrocks 兼容性：确保 TTL 是整数
        const ttl = Math.floor(expireSeconds);

        if (ttl !== expireSeconds) {
          console.warn(
            `${this.config.clientName} TTL rounded from ${expireSeconds} to ${ttl} seconds`,
          );
        }

        await this.withRetry(() => this.client.setEx(cacheKey, ttl, value));

        // 验证是否成功设置（可选，仅在调试模式下）
        if (process.env.NODE_ENV === 'development') {
          const setTtl = await this.withRetry(() => this.client.ttl(cacheKey));

          if (setTtl < 0) {
            console.warn(
              `${this.config.clientName} WARNING: TTL not set correctly for ${key}. Got: ${setTtl}`,
            );
          }
        }
      } else {
        await this.withRetry(() => this.client.set(cacheKey, value));
      }
    } catch (error) {
      console.error(
        `${this.config.clientName} setCache error (key: ${key}):`,
        error,
      );
      throw error; // 重新抛出错误以便上层处理
    }
  }

  async deleteCache(key: string): Promise<void> {
    await this.withRetry(() => this.client.del(this.cacheKey(key)));
  }

  async keys(pattern: string): Promise<string[]> {
    try {
      return await this.scanKeys(pattern);
    } catch (error) {
      console.error(
        `${this.config.clientName} keys error (pattern: ${pattern}):`,
        error,
      );
      return [];
    }
  }

  async clearExpiredCache(prefix?: string): Promise<void> {
    // Redis的TTL机制会自动清理过期数据，这里主要用于手动清理
    // 可以根据需要实现特定前缀的缓存清理
    const pattern = prefix ? `cache:${prefix}*` : 'cache:*';
    const keys = await this.scanKeys(pattern);

    if (keys.length > 0) {
      await this.withRetry(() => this.client.del(keys));
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
    data: SlotUserData,
  ): Promise<void> {
    for (const type of this.getSlotRankTypes()) {
      await this.withRetry(() =>
        this.client.sendCommand([
          'ZADD',
          this.slotRankKey(type),
          String(this.getSlotRankScore(data, type)),
          userName,
        ]),
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
    const hashData = await this.withRetry(() =>
      this.client.hGetAll(this.slotUserKey(userName)),
    );

    return Object.keys(hashData).length > 0
      ? this.decodeHashObject(hashData)
      : null;
  }

  async setSlotUserData(
    userName: string,
    data: SlotUserData,
    expireSeconds = 86400 * 30,
  ): Promise<void> {
    const key = this.slotUserKey(userName);
    await this.withRetry(() =>
      this.client.hSet(key, this.encodeHashObject(data)),
    );
    await this.withRetry(() => this.client.expire(key, expireSeconds));
    await this.withRetry(() =>
      this.client.sendCommand(['SADD', this.slotUsersKey(), userName]),
    );
    await this.updateSlotRanks(userName, data);
  }

  async listSlotUsers(): Promise<Array<SlotUserData & { username: string }>> {
    const users = (await this.withRetry(() =>
      this.client.sendCommand(['SMEMBERS', this.slotUsersKey()]),
    )) as string[];

    const result: Array<SlotUserData & { username: string }> = [];
    for (const userName of users) {
      const data = await this.getSlotUserData(userName);
      if (data) {
        result.push({ username: userName, ...data });
      }
    }
    return result;
  }

  async getSlotLeaderboard(
    type = 'coins',
    limit = 10,
  ): Promise<Array<SlotUserData & { username: string }>> {
    const rankType = this.getSlotRankTypes().includes(type) ? type : 'coins';

    const raw = await this.withRetry(() =>
      this.client.sendCommand([
        'ZREVRANGE',
        this.slotRankKey(rankType),
        '0',
        String(Math.max(0, limit - 1)),
        'WITHSCORES',
      ]),
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

  async incrementRateLimit(
    key: string,
    expireSeconds: number,
  ): Promise<number> {
    const count = Number(
      await this.withRetry(() => this.client.sendCommand(['INCR', key])),
    );

    if (count === 1) {
      await this.withRetry(() => this.client.expire(key, expireSeconds));
    }

    return count;
  }

  // ---------- 播放统计相关 ----------
  private playStatsKey() {
    return 'global:play_stats';
  }

  private userStatsKey(userName: string) {
    return `u:${userName}:stats`;
  }

  private loginStatsKey(userName: string) {
    return `user_login_stats:${userName}`;
  }

  private contentStatsKey(source: string, id: string) {
    return `content:stats:${source}+${id}`;
  }

  private normalizeLoginStats(raw?: Partial<LoginStats> | null): LoginStats {
    return {
      loginCount: Number(raw?.loginCount || 0),
      firstLoginTime: Number(raw?.firstLoginTime || 0),
      lastLoginTime: Number(raw?.lastLoginTime || 0),
      lastLoginDate: Number(raw?.lastLoginDate || raw?.lastLoginTime || 0),
    };
  }

  private async getLoginStats(userName: string): Promise<LoginStats> {
    const key = this.loginStatsKey(userName);
    const stored = await this.withRetry(() => this.client.hGetAll(key));
    return this.normalizeLoginStats(stored);
  }

  // 获取全站播放统计
  async getPlayStats(): Promise<PlayStatsResult> {
    try {
      // 尝试从缓存获取
      const cached = await this.getCache('play_stats_summary');
      if (cached) {
        return cached;
      }

      // 重新计算统计数据
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

      // 用户注册统计
      const now = Date.now();
      const todayStart = new Date(now).setHours(0, 0, 0, 0);
      let todayNewUsers = 0;
      const registrationData: Record<string, number> = {};
      const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

      // 收集所有用户统计
      for (const username of allUsers) {
        const userStat = await this.getUserPlayStat(username);

        // 设置项目开始时间，2025年9月14日
        const PROJECT_START_DATE = new Date('2025-09-14').getTime();
        // 模拟用户创建时间（Redis模式下通常没有这个信息，使用首次播放时间或项目开始时间）
        const userCreatedAt = userStat.firstWatchDate || PROJECT_START_DATE;
        const registrationDays =
          Math.floor((now - userCreatedAt) / (1000 * 60 * 60 * 24)) + 1;

        // 统计今日新增用户
        if (userCreatedAt >= todayStart) {
          todayNewUsers++;
        }

        // 统计注册时间分布（近7天）
        if (userCreatedAt >= sevenDaysAgo) {
          const regDate = new Date(userCreatedAt).toISOString().split('T')[0];
          registrationData[regDate] = (registrationData[regDate] || 0) + 1;
        }

        // 推断最后登录时间（基于最后播放时间）
        const lastLoginTime = userStat.lastPlayTime || userCreatedAt;

        const enhancedUserStat = {
          username: userStat.username,
          totalWatchTime: userStat.totalWatchTime,
          totalPlays: userStat.totalPlays,
          lastPlayTime: userStat.lastPlayTime,
          recentRecords: userStat.recentRecords,
          avgWatchTime: userStat.avgWatchTime,
          mostWatchedSource: userStat.mostWatchedSource,
          registrationDays,
          lastLoginTime,
          loginCount: userStat.loginCount || 0, // 添加登入次数字段
          createdAt: userCreatedAt,
        };

        userStats.push(enhancedUserStat);
        totalWatchTime += userStat.totalWatchTime;
        totalPlays += userStat.totalPlays;
      }

      // 计算热门来源
      const sourceMap = new Map<string, number>();
      for (const user of userStats) {
        for (const record of user.recentRecords) {
          const count = sourceMap.get(record.source_name) || 0;
          sourceMap.set(record.source_name, count + 1);
        }
      }

      const topSources = Array.from(sourceMap.entries())
        .map(([source, count]) => ({ source, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      // 生成近7天统计（简化版本）
      const dailyStats = [];
      for (let i = 6; i >= 0; i--) {
        const date = new Date(now - i * 24 * 60 * 60 * 1000);
        dailyStats.push({
          date: date.toISOString().split('T')[0],
          watchTime: Math.floor(totalWatchTime / 7), // 简化计算
          plays: Math.floor(totalPlays / 7),
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
        userStats: userStats.sort(
          (a, b) => b.totalWatchTime - a.totalWatchTime,
        ),
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

  // 获取用户播放统计
  async getUserPlayStat(userName: string): Promise<UserPlayStat> {
    try {
      // 获取用户所有播放记录
      const playRecords = await this.getAllPlayRecords(userName);
      const records = Object.values(playRecords);

      if (records.length === 0) {
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

      // 计算统计数据
      const totalWatchTime = records.reduce(
        (sum, record) => sum + (record.play_time || 0),
        0,
      );
      const totalPlays = records.length;
      const lastPlayTime = Math.max(...records.map((r) => r.save_time || 0));

      // 计算观看影片总数（去重）
      const totalMovies = new Set(
        records.map((r) => `${r.title}_${r.source_name}_${r.year}`),
      ).size;

      // 计算首次观看时间
      const firstWatchDate = Math.min(
        ...records.map((r) => r.save_time || Date.now()),
      );

      // 最近10条记录，按时间排序
      const recentRecords = records
        .sort((a, b) => (b.save_time || 0) - (a.save_time || 0))
        .slice(0, 10);

      // 平均观看时长
      const avgWatchTime = totalPlays > 0 ? totalWatchTime / totalPlays : 0;

      // 最常观看的来源
      const sourceMap = new Map<string, number>();
      records.forEach((record) => {
        const sourceName = record.source_name || '未知来源';
        const count = sourceMap.get(sourceName) || 0;
        sourceMap.set(sourceName, count + 1);
      });

      const mostWatchedSource =
        sourceMap.size > 0
          ? Array.from(sourceMap.entries()).reduce((a, b) =>
              a[1] > b[1] ? a : b,
            )[0]
          : '';

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

      return {
        username: userName,
        totalWatchTime,
        totalPlays,
        lastPlayTime,
        recentRecords,
        avgWatchTime,
        mostWatchedSource,
        // 新增字段
        totalMovies,
        firstWatchDate,
        lastUpdateTime: Date.now(),
        // 登入统计字段
        loginCount: loginStats.loginCount,
        firstLoginTime: loginStats.firstLoginTime,
        lastLoginTime: loginStats.lastLoginTime,
        lastLoginDate: loginStats.lastLoginDate,
      };
    } catch (error) {
      console.error(`获取用户 ${userName} 统计失败:`, error);
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
        loginCount: 0,
        firstLoginTime: 0,
        lastLoginTime: 0,
        lastLoginDate: 0,
      };
    }
  }

  // 获取内容热度统计
  async getContentStats(limit = 10): Promise<ContentStat[]> {
    try {
      // 获取所有用户
      const allUsers = await this.getAllUsers();
      const contentMap = new Map<
        string,
        {
          record: PlayRecord;
          playCount: number;
          totalWatchTime: number;
          users: Set<string>;
        }
      >();

      // 收集所有播放记录
      for (const username of allUsers) {
        const playRecords = await this.getAllPlayRecords(username);

        Object.entries(playRecords).forEach(([key, record]) => {
          const contentKey = key; // source+id

          if (!contentMap.has(contentKey)) {
            contentMap.set(contentKey, {
              record,
              playCount: 0,
              totalWatchTime: 0,
              users: new Set(),
            });
          }

          const content = contentMap.get(contentKey)!;
          content.playCount++;
          content.totalWatchTime += record.play_time;
          content.users.add(username);
        });
      }

      // 转换为ContentStat数组并排序
      const contentStats: ContentStat[] = Array.from(contentMap.entries())
        .map(([key, data]) => {
          const { source, id } = parseStorageKey(key) || { source: '', id: '' };
          return {
            source,
            id,
            title: data.record.title,
            source_name: data.record.source_name,
            cover: data.record.cover,
            year: data.record.year,
            playCount: data.playCount,
            totalWatchTime: data.totalWatchTime,
            averageWatchTime:
              data.playCount > 0 ? data.totalWatchTime / data.playCount : 0,
            lastPlayed: data.record.save_time,
            uniqueUsers: data.users.size,
          };
        })
        .sort((a, b) => b.playCount - a.playCount)
        .slice(0, limit);

      return contentStats;
    } catch (error) {
      console.error('获取内容统计失败:', error);
      return [];
    }
  }

  // 更新播放统计（当用户播放时调用）
  async updatePlayStatistics(
    _userName: string,
    _source: string,
    _id: string,
    _watchTime: number,
  ): Promise<void> {
    try {
      // 清除全站统计缓存，下次查询时重新计算
      await this.deleteCache('play_stats_summary');

      // 这里可以添加更多实时统计更新逻辑
      // 比如更新用户统计缓存、内容热度等
      // 暂时只是清除缓存，实际统计在查询时重新计算
    } catch (error) {
      console.error('更新播放统计失败:', error);
    }
  }

  // 更新用户登入统计
  async updateUserLoginStats(
    userName: string,
    loginTime: number,
    isFirstLogin?: boolean,
  ): Promise<void> {
    try {
      const loginStatsKey = this.loginStatsKey(userName);
      const currentStats = await this.getLoginStats(userName);
      const firstLoginTime =
        isFirstLogin || !currentStats.firstLoginTime
          ? loginTime
          : currentStats.firstLoginTime;

      const loginCount = await this.withRetry(() =>
        this.client.hIncrBy(loginStatsKey, 'loginCount', 1),
      );

      const loginStats = {
        loginCount,
        firstLoginTime,
        lastLoginTime: loginTime,
        lastLoginDate: loginTime,
      };

      await this.withRetry(() =>
        this.client.hSet(loginStatsKey, {
          firstLoginTime: String(loginStats.firstLoginTime),
          lastLoginTime: String(loginStats.lastLoginTime),
          lastLoginDate: String(loginStats.lastLoginDate),
        }),
      );
    } catch (error) {
      console.error(`更新用户 ${userName} 登入统计失败:`, error);
      throw error;
    }
  }

  // ---------- 访问日志相关 ----------
  private accessLogKey(timestamp: number, username?: string) {
    const date = new Date(timestamp).toISOString().split('T')[0]; // YYYY-MM-DD
    if (username) {
      return `al:${date}:${username}:${timestamp}`;
    }
    return `al:${date}:${timestamp}`;
  }

  private accessLogIndexKey(date: string, username?: string) {
    if (username) {
      return `al:index:${date}:${username}`;
    }
    return `al:index:${date}`;
  }

  async saveAccessLog(accessLog: AccessLog): Promise<void> {
    try {
      const timestamp = accessLog.timestamp || Date.now();
      const logKey = this.accessLogKey(timestamp, accessLog.username);
      const date = new Date(timestamp).toISOString().split('T')[0];

      // 保存访问日志记录
      await this.withRetry(() =>
        this.client.set(logKey, JSON.stringify(accessLog)),
      );

      // 添加到时间序列索引，便于查询
      const indexKey = this.accessLogIndexKey(date, accessLog.username);
      await this.withRetry(() => this.client.lPush(indexKey, logKey));

      // 设置索引过期时间（保留30天）
      await this.withRetry(() =>
        this.client.expire(indexKey, 30 * 24 * 60 * 60),
      );

      // 设置日志记录过期时间（保留30天）
      await this.withRetry(() => this.client.expire(logKey, 30 * 24 * 60 * 60));
    } catch (error) {
      console.error(`[${this.config.clientName}] 保存访问日志失败:`, error);
      throw error;
    }
  }

  async getAccessLogs(
    filters: {
      username?: string;
      startTime?: number;
      endTime?: number;
      action?: string;
    },
    limit = 50,
    offset = 0,
  ): Promise<AccessLog[]> {
    try {
      const logs: AccessLog[] = [];
      const now = Date.now();
      const startTime = filters.startTime || now - 7 * 24 * 60 * 60 * 1000; // 默认7天前
      const endTime = filters.endTime || now;

      // 生成日期范围
      const startDate = new Date(startTime).toISOString().split('T')[0];
      const endDate = new Date(endTime).toISOString().split('T')[0];

      // 遍历日期范围内的索引
      const currentDate = new Date(startDate);
      while (currentDate.toISOString().split('T')[0] <= endDate) {
        const dateStr = currentDate.toISOString().split('T')[0];
        const indexKey = this.accessLogIndexKey(dateStr, filters.username);

        // 获取当天的索引列表
        const logKeys = await this.withRetry(() =>
          this.client.lRange(indexKey, 0, -1),
        );

        // 获取日志记录
        if (logKeys.length > 0) {
          const values = await this.withRetry(() => this.client.mGet(logKeys));

          for (let i = 0; i < values.length; i++) {
            const value = values[i];
            if (value) {
              try {
                const log = JSON.parse(value) as AccessLog;

                // 应用过滤条件
                if (filters.action && log.action !== filters.action) {
                  continue;
                }

                if (filters.username && log.username !== filters.username) {
                  continue;
                }

                if (log.timestamp < startTime || log.timestamp > endTime) {
                  continue;
                }

                logs.push(log);
              } catch (parseError) {
                console.warn(`解析访问日志失败:`, parseError);
              }
            }
          }
        }

        // 移动到下一天
        currentDate.setDate(currentDate.getDate() + 1);
      }

      // 按时间戳排序（最新的在前）
      logs.sort((a, b) => b.timestamp - a.timestamp);

      // 应用分页
      return logs.slice(offset, offset + limit);
    } catch (error) {
      console.error(`[${this.config.clientName}] 获取访问日志失败:`, error);
      return [];
    }
  }

  async deleteAccessLogs(username?: string): Promise<number> {
    try {
      let deletedCount = 0;

      // 获取所有可能的索引键
      const indexPattern = 'al:index:*';
      const indexKeys = await this.scanKeys(indexPattern);

      for (const indexKey of indexKeys) {
        // 如果指定了用户名，只处理相关的索引
        if (username && !indexKey.includes(`:${username}`)) {
          continue;
        }

        // 获取索引中的所有日志键
        const logKeys = await this.withRetry(() =>
          this.client.lRange(indexKey, 0, -1),
        );

        for (const logKey of logKeys) {
          try {
            // 获取日志内容以验证用户名
            const logData = await this.withRetry(() => this.client.get(logKey));

            if (logData) {
              const log = JSON.parse(logData) as AccessLog;

              // 如果指定了用户名，只删除该用户的日志
              if (username && log.username !== username) {
                continue;
              }

              // 删除日志记录
              await this.withRetry(() => this.client.del(logKey));

              // 从索引中移除
              await this.withRetry(() => this.client.lRem(indexKey, 0, logKey));

              deletedCount++;
            }
          } catch (err) {
            console.warn(
              `[${this.config.clientName}] 删除日志条目失败:`,
              logKey,
              err,
            );
          }
        }
      }

      return deletedCount;
    } catch (error) {
      console.error(`[${this.config.clientName}] 删除访问日志失败:`, error);
      return 0;
    }
  }
}
