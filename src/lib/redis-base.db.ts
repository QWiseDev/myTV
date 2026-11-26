/* eslint-disable no-console, @typescript-eslint/no-explicit-any, @typescript-eslint/no-non-null-assertion */

import { createClient, RedisClientType } from 'redis';

import { AdminConfig } from './admin.types';
import { toDateKey } from './date-utils';
import { hashPassword, isPasswordHash, verifyPassword } from './password';
import { aggregatePlayStats, PlayStatsUserInput } from './play-stats-shared';
import { parseStorageKey } from './storage-key';
import {
  decodeHashObject,
  EMPTY_PLAY_STATS,
  emptyUserPlayStat,
  encodeHashObject,
  ensureString,
  ensureStringArray,
  getSlotRankScore,
  LoginStats,
  normalizeLoginStats,
  parseLogKeyUsername,
  parseRankMembers,
  SEARCH_HISTORY_LIMIT,
  SLOT_RANK_TYPES,
  slotRankKey,
  SlotUserData,
  slotUserKey,
  slotUsersKey,
} from './storage-shared';
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

  /**
   * 批量执行一组相互独立的命令（node-redis multi 即 pipeline，服务端原子执行）。
   * 整条 pipeline 作为一个重试单元：连接类错误时整条重试是安全的（MULTI/EXEC 原子）。
   * 返回值按入队顺序排列。
   */
  protected async withPipeline<T = unknown>(
    queue: (multi: ReturnType<RedisClientType['multi']>) => void,
  ): Promise<T[]> {
    const multi = this.client.multi();
    queue(multi);
    return (await this.withRetry(() => multi.exec())) as T[];
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
    this.invalidateUserStatsCache(userName);
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
    this.invalidateUserStatsCache(userName);
  }

  async clearAllPlayRecords(userName: string): Promise<void> {
    await this.withRetry(() => this.client.del(this.prHashKey(userName)));
    this.invalidateUserStatsCache(userName);
  }

  // ---------- 收藏 ----------
  private favHashKey(user: string) {
    return `u:${user}:favh`;
  }

  async clearAllFavorites(userName: string): Promise<void> {
    await this.withRetry(() => this.client.del(this.favHashKey(userName)));
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

  // 用户名索引 SET：getAllUsers 的 O(1) 读取路径（见 getAllUsers 的惰性回填说明）
  private usersSetKey() {
    return 'users';
  }

  async registerUser(userName: string, password: string): Promise<void> {
    const storedPassword = isPasswordHash(password)
      ? password
      : await hashPassword(password);
    await this.withPipeline((multi) => {
      multi
        .set(this.userPwdKey(userName), storedPassword)
        .sAdd(this.usersSetKey(), userName);
    });
  }

  async verifyUser(userName: string, password: string): Promise<boolean> {
    const stored = await this.withRetry(() =>
      this.client.get(this.userPwdKey(userName)),
    );
    if (stored === null) return false;
    const { valid, needsRehash } = await verifyPassword(
      password,
      ensureString(stored),
    );
    if (valid && needsRehash) {
      this.changePassword(userName, password).catch(() => undefined);
    }
    return valid;
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
    const storedPassword = isPasswordHash(newPassword)
      ? newPassword
      : await hashPassword(newPassword);
    // 顺带补进用户索引以防索引漂移
    await this.withPipeline((multi) => {
      multi
        .set(this.userPwdKey(userName), storedPassword)
        .sAdd(this.usersSetKey(), userName);
    });
  }

  async getUserPasswordHash(userName: string): Promise<string | null> {
    const stored = await this.withRetry(() =>
      this.client.get(this.userPwdKey(userName)),
    );
    return stored === null ? null : ensureString(stored);
  }

  async setUserPasswordHash(
    userName: string,
    passwordOrHash: string,
  ): Promise<void> {
    const storedValue = isPasswordHash(passwordOrHash)
      ? passwordOrHash
      : await hashPassword(passwordOrHash);
    await this.withPipeline((multi) => {
      multi
        .set(this.userPwdKey(userName), storedValue)
        .sAdd(this.usersSetKey(), userName);
    });
  }

  // 删除用户及其所有数据
  async deleteUser(userName: string): Promise<void> {
    // episodeskip 为一剧一 key，需要 SCAN 后一并删除；其余均为整键删除
    const episodeSkipKeys = await this.scanKeys(`u:${userName}:episodeskip:*`);

    await this.withPipeline((multi) => {
      multi
        .del(
          this.userPwdKey(userName),
          this.shKey(userName),
          this.prHashKey(userName),
          this.favHashKey(userName),
          this.skipHashKey(userName),
          this.loginStatsKey(userName),
          // 老虎机数据（此前 deleteUser 不会清理，排行榜与用户集合会残留）
          slotUserKey(userName),
        )
        .sRem(slotUsersKey(), userName)
        .sRem(this.usersSetKey(), userName);
      for (const rankType of SLOT_RANK_TYPES) {
        multi.zRem(slotRankKey(rankType), userName);
      }
      for (const key of episodeSkipKeys) {
        multi.del(key);
      }
    });
    this.invalidateUserStatsCache(userName);
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
    // 去重 → 插入到最前 → 限制最大长度，合并为一次 pipeline 往返
    await this.withPipeline((multi) => {
      multi
        .lRem(key, 0, ensureString(keyword))
        .lPush(key, ensureString(keyword))
        .lTrim(key, 0, SEARCH_HISTORY_LIMIT - 1);
    });
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
    // 优先走用户索引 SET（SMEMBERS 1 RTT）。
    // 索引为空时惰性回填一次（兼容存量部署）：SCAN u:*:pwd 重建并持久化。
    const members = (await this.withRetry(() =>
      this.client.sMembers(this.usersSetKey()),
    )) as string[];
    if (members.length > 0) {
      return members.map(ensureString);
    }

    const keys = await this.scanKeys('u:*:pwd');
    const users = keys
      .map((k) => {
        const match = k.match(/^u:(.+?):pwd$/);
        return match ? ensureString(match[1]) : undefined;
      })
      .filter((u): u is string => typeof u === 'string');

    if (users.length > 0) {
      await this.withRetry(() => this.client.sAdd(this.usersSetKey(), users));
    }
    return users;
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
      // SCAN 汇总全部用户相关键（u:* / user_login_stats:* / slot:*），
      // 再补上用户索引与管理员配置，分批 DEL（语义与原逐用户 deleteUser 等价）
      const doomedKeys = [
        ...(await this.scanKeys('u:*')),
        ...(await this.scanKeys('user_login_stats:*')),
        ...(await this.scanKeys('slot:*')),
        this.usersSetKey(),
        this.adminConfigKey(),
      ];

      const BATCH_SIZE = 500;
      for (let i = 0; i < doomedKeys.length; i += BATCH_SIZE) {
        await this.withRetry(() =>
          this.client.del(doomedKeys.slice(i, i + BATCH_SIZE)),
        );
      }
      this.userStatsCache.clear();
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

  async getSlotUserData(userName: string): Promise<SlotUserData | null> {
    const hashData = await this.withRetry(() =>
      this.client.hGetAll(slotUserKey(userName)),
    );

    return Object.keys(hashData).length > 0 ? decodeHashObject(hashData) : null;
  }

  async setSlotUserData(
    userName: string,
    data: SlotUserData,
    expireSeconds = 86400 * 30,
  ): Promise<void> {
    // HSET + EXPIRE + SADD + 3×ZADD 合并为一次 pipeline 往返
    await this.withPipeline((multi) => {
      multi
        .hSet(slotUserKey(userName), encodeHashObject(data))
        .expire(slotUserKey(userName), expireSeconds)
        .sAdd(slotUsersKey(), userName);
      for (const rankType of SLOT_RANK_TYPES) {
        multi.zAdd(slotRankKey(rankType), {
          score: getSlotRankScore(data, rankType),
          value: userName,
        });
      }
    });
  }

  // 分批 pipeline 拉取成员数据（每批一次往返）
  private async getSlotUsersBatched(
    userNames: string[],
  ): Promise<Array<SlotUserData & { username: string }>> {
    const BATCH_SIZE = 64;
    const result: Array<SlotUserData & { username: string }> = [];
    for (let i = 0; i < userNames.length; i += BATCH_SIZE) {
      const batch = userNames.slice(i, i + BATCH_SIZE);
      const hashDatas = await this.withPipeline<Record<string, string>>(
        (multi) => {
          for (const userName of batch) {
            multi.hGetAll(slotUserKey(userName));
          }
        },
      );

      batch.forEach((userName, index) => {
        const hashData = hashDatas[index];
        if (hashData && Object.keys(hashData).length > 0) {
          result.push({ username: userName, ...decodeHashObject(hashData) });
        }
      });
    }
    return result;
  }

  async listSlotUsers(): Promise<Array<SlotUserData & { username: string }>> {
    const users = (await this.withRetry(() =>
      this.client.sendCommand(['SMEMBERS', slotUsersKey()]),
    )) as string[];

    return this.getSlotUsersBatched(users);
  }

  async getSlotLeaderboard(
    type = 'coins',
    limit = 10,
  ): Promise<Array<SlotUserData & { username: string }>> {
    const rankType = SLOT_RANK_TYPES.includes(type) ? type : 'coins';

    const raw = await this.withRetry(() =>
      this.client.sendCommand([
        'ZREVRANGE',
        slotRankKey(rankType),
        '0',
        String(Math.max(0, limit - 1)),
        'WITHSCORES',
      ]),
    );

    return this.getSlotUsersBatched(parseRankMembers(raw));
  }

  // EXPIRE NX 支持探测（redis ≥7.0 / kvrocks 视版本可能不支持），false 时走两步回退逻辑
  private expireNxUsable: boolean | null = null;

  async incrementRateLimit(
    key: string,
    expireSeconds: number,
  ): Promise<number> {
    // INCR + EXPIRE NX 合并为一次 pipeline 往返：NX 仅在 key 无 TTL 时设置，
    // 与旧逻辑"仅首次 INCR 设 TTL"的固定窗口语义一致（顺带给历史无 TTL key 补设，防泄漏）
    if (this.expireNxUsable !== false) {
      try {
        const [count] = await this.withPipeline<number>((multi) => {
          multi.incr(key);
          multi.expire(key, expireSeconds, 'NX');
        });
        this.expireNxUsable = true;
        return Number(count);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        // 仅在确认服务端不支持 NX（老版本返回 syntax error）时回退；
        // 其他错误（含连接类）照常抛出，交由调用方/withRetry 处理
        if (!/syntax error|unknown command/i.test(message)) {
          throw error;
        }
        this.expireNxUsable = false;
        console.warn(
          `[${this.config.clientName}] EXPIRE NX 不可用，incrementRateLimit 回退两步逻辑:`,
          message,
        );
      }
    }

    const count = Number(
      await this.withRetry(() => this.client.sendCommand(['INCR', key])),
    );

    if (count === 1) {
      await this.withRetry(() => this.client.expire(key, expireSeconds));
    }

    return count;
  }

  // ---------- 播放统计相关 ----------
  private loginStatsKey(userName: string) {
    return `user_login_stats:${userName}`;
  }

  // 用户统计的进程内短缓存（60s），写路径（setPlayRecord/deletePlayRecord/clearAllPlayRecords）主动失效
  private userStatsCache = new Map<
    string,
    { data: UserPlayStat; timestamp: number }
  >();
  private static readonly USER_STATS_CACHE_TTL = 60 * 1000;

  private readUserStatsCache(userName: string): UserPlayStat | null {
    const entry = this.userStatsCache.get(userName);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > BaseRedisStorage.USER_STATS_CACHE_TTL) {
      this.userStatsCache.delete(userName);
      return null;
    }
    return entry.data;
  }

  private writeUserStatsCache(userName: string, stat: UserPlayStat): void {
    this.userStatsCache.set(userName, {
      data: stat,
      timestamp: Date.now(),
    });
  }

  private invalidateUserStatsCache(userName: string): void {
    this.userStatsCache.delete(userName);
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
      const USER_STATS_BATCH_SIZE = 8;
      const inputs: PlayStatsUserInput[] = [];

      for (let i = 0; i < allUsers.length; i += USER_STATS_BATCH_SIZE) {
        const batch = allUsers.slice(i, i + USER_STATS_BATCH_SIZE);
        const rows = await Promise.all(
          batch.map(async (username) => {
            const { stat, records } =
              await this.getUserPlayStatWithRecords(username);
            return {
              username,
              records,
              loginStats: stat,
            };
          }),
        );
        inputs.push(...rows);
      }

      const result = aggregatePlayStats(inputs);

      // 缓存结果30分钟
      await this.setCache('play_stats_summary', result, 1800);

      return result;
    } catch (error) {
      console.error('获取播放统计失败:', error);
      return EMPTY_PLAY_STATS;
    }
  }

  // 获取用户播放统计
  async getUserPlayStat(userName: string): Promise<UserPlayStat> {
    const cached = this.readUserStatsCache(userName);
    if (cached) {
      return cached;
    }
    return (await this.getUserPlayStatWithRecords(userName)).stat;
  }

  // 用户统计 + 全量播放记录组合读取：一次 pipeline 拿齐，供 admin 统计页免双读
  async getUserPlayStatWithRecords(
    userName: string,
  ): Promise<{ stat: UserPlayStat; records: PlayRecord[] }> {
    try {
      // 一次 pipeline 同时拉取播放记录 Hash 与登入统计 Hash（2 RTT → 1 RTT）
      const [hashRecords, loginStatsStored] = await this.withPipeline<
        Record<string, string>
      >((multi) => {
        multi.hGetAll(this.prHashKey(userName));
        multi.hGetAll(this.loginStatsKey(userName));
      });

      const playRecords: Record<string, PlayRecord> = {};
      Object.entries(hashRecords ?? {}).forEach(([key, raw]) => {
        const record = this.parseJsonValue<PlayRecord>(raw);
        if (record) {
          playRecords[key] = record;
        }
      });
      const records = Object.values(playRecords);
      const loginStats = normalizeLoginStats(loginStatsStored ?? {});

      const stat = this.buildUserPlayStat(userName, records, loginStats);
      this.writeUserStatsCache(userName, stat);
      return { stat, records };
    } catch (error) {
      console.error(`获取用户 ${userName} 统计失败:`, error);
      return { stat: emptyUserPlayStat(userName), records: [] };
    }
  }

  // 纯内存统计计算，供 getUserPlayStatWithRecords 复用
  private buildUserPlayStat(
    userName: string,
    records: PlayRecord[],
    loginStats: LoginStats,
  ): UserPlayStat {
    const totalWatchTime = records.reduce(
      (sum, record) => sum + (record.play_time || 0),
      0,
    );
    const totalPlays = records.length;
    const lastPlayTime = records.length
      ? Math.max(...records.map((r) => r.save_time || 0))
      : 0;

    // 计算观看影片总数（去重）
    const totalMovies = new Set(
      records.map((r) => `${r.title}_${r.source_name}_${r.year}`),
    ).size;

    // 计算首次观看时间
    const firstWatchDate = records.length
      ? Math.min(...records.map((r) => r.save_time || Date.now()))
      : Date.now();

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

    return {
      username: userName,
      totalWatchTime,
      totalPlays,
      lastPlayTime,
      recentRecords,
      avgWatchTime,
      mostWatchedSource,
      totalMovies,
      firstWatchDate,
      lastUpdateTime: Date.now(),
      loginCount: loginStats.loginCount,
      firstLoginTime: loginStats.firstLoginTime,
      lastLoginTime: loginStats.lastLoginTime,
      lastLoginDate: loginStats.lastLoginDate,
    };
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

      // 分批并行收集所有播放记录（串行逐用户 RTT 在隧道环境下代价高）
      const PLAY_RECORDS_BATCH_SIZE = 8;
      const recordsByUsername: Array<[string, Record<string, PlayRecord>]> = [];
      for (let i = 0; i < allUsers.length; i += PLAY_RECORDS_BATCH_SIZE) {
        const batch = allUsers.slice(i, i + PLAY_RECORDS_BATCH_SIZE);
        const batchRecords = await Promise.all(
          batch.map(
            async (username): Promise<[string, Record<string, PlayRecord>]> => [
              username,
              await this.getAllPlayRecords(username),
            ],
          ),
        );
        recordsByUsername.push(...batchRecords);
      }

      for (const [username, playRecords] of recordsByUsername) {
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
      const currentStats = normalizeLoginStats(
        await this.withRetry(() => this.client.hGetAll(loginStatsKey)),
      );
      const firstLoginTime =
        isFirstLogin || !currentStats.firstLoginTime
          ? loginTime
          : currentStats.firstLoginTime;

      // HINCRBY 与 HSET 相互独立，合并为一次 pipeline 往返
      await this.withPipeline((multi) => {
        multi.hIncrBy(loginStatsKey, 'loginCount', 1).hSet(loginStatsKey, {
          firstLoginTime: String(firstLoginTime),
          lastLoginTime: String(loginTime),
          lastLoginDate: String(loginTime),
        });
      });
      this.invalidateUserStatsCache(userName);
    } catch (error) {
      console.error(`更新用户 ${userName} 登入统计失败:`, error);
      throw error;
    }
  }

  // ---------- 访问日志相关 ----------
  private accessLogKey(timestamp: number, username?: string) {
    const date = toDateKey(timestamp); // YYYY-MM-DD
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
      const date = toDateKey(timestamp);
      const indexKey = this.accessLogIndexKey(date, accessLog.username);
      const ttl = 30 * 24 * 60 * 60;

      // 写日志 + 推索引 + 双 TTL 合并为一次 pipeline 往返
      await this.withPipeline((multi) => {
        multi
          .set(logKey, JSON.stringify(accessLog), { EX: ttl })
          .lPush(indexKey, logKey)
          .expire(indexKey, ttl)
          .expire(logKey, ttl);
      });
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
      const MAX_ACCESS_LOG_DAYS = 90;
      const now = Date.now();
      const rawEnd =
        filters.endTime !== undefined && Number.isFinite(filters.endTime)
          ? filters.endTime
          : now;
      const endTime = Math.min(rawEnd, now + 86400_000);
      const minAllowedStart =
        endTime - MAX_ACCESS_LOG_DAYS * 24 * 60 * 60 * 1000;
      const rawStart =
        filters.startTime !== undefined && Number.isFinite(filters.startTime)
          ? filters.startTime
          : endTime - 7 * 24 * 60 * 60 * 1000;
      const startTime = Math.max(rawStart, minAllowedStart);

      if (startTime > endTime) {
        return [];
      }

      const safeLimit = Math.min(
        Math.max(Number.isFinite(limit) ? Math.floor(limit) : 50, 1),
        500,
      );
      const safeOffset = Math.max(
        Number.isFinite(offset) ? Math.floor(offset) : 0,
        0,
      );

      // 生成日期范围（限制最多遍历 90 天，防止异常时间戳触发死循环）
      const startDate = toDateKey(startTime);
      const endDate = toDateKey(endTime);
      const dates: string[] = [];
      const currentDate = new Date(startDate);
      if (Number.isNaN(currentDate.getTime())) {
        return [];
      }
      while (
        toDateKey(currentDate) <= endDate &&
        dates.length < MAX_ACCESS_LOG_DAYS
      ) {
        dates.push(toDateKey(currentDate));
        currentDate.setDate(currentDate.getDate() + 1);
      }

      if (dates.length === 0) {
        return [];
      }

      // 一次 pipeline 拉取全部日期的索引（原逐天 2×N RTT → 1 RTT）
      const indexLists = await this.withPipeline<string[]>((multi) => {
        for (const date of dates) {
          multi.lRange(this.accessLogIndexKey(date, filters.username), 0, -1);
        }
      });

      const logKeys = indexLists.flat();
      if (logKeys.length === 0) {
        return [];
      }

      // 批量获取日志内容
      const values = await this.withRetry(() => this.client.mGet(logKeys));

      const logs: AccessLog[] = [];
      for (const value of values) {
        if (!value) {
          continue;
        }

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

      // 按时间戳排序（最新的在前）
      logs.sort((a, b) => b.timestamp - a.timestamp);

      // 应用分页
      return logs.slice(safeOffset, safeOffset + safeLimit);
    } catch (error) {
      console.error(`[${this.config.clientName}] 获取访问日志失败:`, error);
      return [];
    }
  }

  async deleteAccessLogs(username?: string): Promise<number> {
    try {
      // 获取所有可能的索引键；指定用户名时只处理相关索引
      const indexKeys = (await this.scanKeys('al:index:*')).filter(
        (indexKey) => !username || indexKey.includes(`:${username}`),
      );
      if (indexKeys.length === 0) {
        return 0;
      }

      // 一次 pipeline 拉取全部索引内容；日志键自带用户名（al:{date}:{username}:{ts}），
      // 无需逐条 GET 校验
      const indexLists = await this.withPipeline<string[]>((multi) => {
        for (const indexKey of indexKeys) {
          multi.lRange(indexKey, 0, -1);
        }
      });

      const doomedLogs = new Set<string>();
      const lremPairs: Array<[indexKey: string, logKey: string]> = [];
      let deletedCount = 0;

      indexLists.forEach((logKeys, index) => {
        const indexKey = indexKeys[index];
        for (const logKey of logKeys) {
          if (username && parseLogKeyUsername(logKey) !== username) {
            continue;
          }
          if (doomedLogs.has(logKey)) {
            continue;
          }
          doomedLogs.add(logKey);
          lremPairs.push([indexKey, logKey]);
          deletedCount += 1;
        }
      });

      if (doomedLogs.size === 0) {
        return 0;
      }

      // 批量删除日志键（原生多键 DEL，一次往返一批）
      const BATCH_SIZE = 500;
      const doomed = Array.from(doomedLogs);
      for (let i = 0; i < doomed.length; i += BATCH_SIZE) {
        await this.withRetry(() =>
          this.client.del(doomed.slice(i, i + BATCH_SIZE)),
        );
      }

      // 批量从索引移除（LREM 每次移除一个成员，pipeline 合批）
      for (let i = 0; i < lremPairs.length; i += BATCH_SIZE) {
        const batch = lremPairs.slice(i, i + BATCH_SIZE);
        await this.withPipeline((multi) => {
          for (const [indexKey, logKey] of batch) {
            multi.lRem(indexKey, 0, logKey);
          }
        });
      }

      return deletedCount;
    } catch (error) {
      console.error(`[${this.config.clientName}] 删除访问日志失败:`, error);
      return 0;
    }
  }
}
