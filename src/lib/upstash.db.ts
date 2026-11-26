/* eslint-disable no-console, @typescript-eslint/no-explicit-any, @typescript-eslint/no-non-null-assertion */

import { Redis } from '@upstash/redis';

import { AdminConfig } from './admin.types';
import { hashPassword, isPasswordHash, verifyPassword } from './password';
import { aggregatePlayStats, PlayStatsUserInput } from './play-stats-shared';
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

// 添加Upstash Redis操作重试包装器
async function withRetry<T>(
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
        err.code === 'EPIPE' ||
        err.name === 'UpstashError';

      if (isConnectionError && !isLastAttempt) {
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
  private userStatsCache: Map<
    string,
    { data: UserPlayStat; timestamp: number }
  > = new Map();
  private userStatsCacheTTL = 60000; // 60秒缓存

  constructor() {
    this.client = getUpstashRedisClient();
  }

  private async scanKeys(pattern: string): Promise<string[]> {
    const keys: string[] = [];
    let cursor = '0';

    do {
      const [nextCursor, batch] = await withRetry(() =>
        this.client.scan(cursor, { match: pattern, count: 100 }),
      );
      cursor = String(nextCursor);
      keys.push(...batch);
    } while (cursor !== '0');

    return keys;
  }

  /**
   * 批量执行一组相互独立的命令（Upstash pipeline 合并为一次 HTTP 往返）。
   * 任一命令失败时整条 pipeline 抛错（默认 keepErrors=false），由 withRetry 统一重试。
   * 返回值按入队顺序排列。
   */
  protected async withPipeline<T = unknown>(
    queue: (pipeline: ReturnType<Redis['pipeline']>) => void,
  ): Promise<T[]> {
    const pipeline = this.client.pipeline();
    queue(pipeline);
    return (await withRetry(() => pipeline.exec())) as T[];
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

  // ---------- 播放记录 ----------
  private prHashKey(user: string) {
    return `u:${user}:prh`; // 新结构：u:username:prh（Hash）
  }

  async getPlayRecord(
    userName: string,
    key: string,
  ): Promise<PlayRecord | null> {
    const hashKey = this.prHashKey(userName);

    return await withRetry(() => this.client.hget<PlayRecord>(hashKey, key));
  }

  async setPlayRecord(
    userName: string,
    key: string,
    record: PlayRecord,
  ): Promise<void> {
    const hashKey = this.prHashKey(userName);

    await withRetry(() => this.client.hset(hashKey, { [key]: record }));
    this.userStatsCache.delete(userName);
  }

  async getAllPlayRecords(
    userName: string,
  ): Promise<Record<string, PlayRecord>> {
    const records = await withRetry(() =>
      this.client.hgetall<Record<string, PlayRecord>>(this.prHashKey(userName)),
    );

    return records ?? {};
  }

  async deletePlayRecord(userName: string, key: string): Promise<void> {
    await withRetry(() => this.client.hdel(this.prHashKey(userName), key));
    this.userStatsCache.delete(userName);
  }

  async clearAllPlayRecords(userName: string): Promise<void> {
    await withRetry(() => this.client.del(this.prHashKey(userName)));
    this.userStatsCache.delete(userName);
  }

  // ---------- 收藏 ----------
  private favHashKey(user: string) {
    return `u:${user}:favh`;
  }

  async clearAllFavorites(userName: string): Promise<void> {
    await withRetry(() => this.client.del(this.favHashKey(userName)));
  }

  async getFavorite(userName: string, key: string): Promise<Favorite | null> {
    return await withRetry(() =>
      this.client.hget<Favorite>(this.favHashKey(userName), key),
    );
  }

  async setFavorite(
    userName: string,
    key: string,
    favorite: Favorite,
  ): Promise<void> {
    await withRetry(() =>
      this.client.hset(this.favHashKey(userName), { [key]: favorite }),
    );
  }

  async getAllFavorites(userName: string): Promise<Record<string, Favorite>> {
    return (
      (await withRetry(() =>
        this.client.hgetall<Record<string, Favorite>>(
          this.favHashKey(userName),
        ),
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
    const storedPassword = isPasswordHash(password)
      ? password
      : await hashPassword(password);
    await this.withPipeline((pipeline) => {
      pipeline
        .set(this.userPwdKey(userName), storedPassword)
        .sadd(this.usersSetKey(), userName);
    });
  }

  async verifyUser(userName: string, password: string): Promise<boolean> {
    const stored = await withRetry(() =>
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
    const exists = await withRetry(() =>
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
    await this.withPipeline((pipeline) => {
      pipeline
        .set(this.userPwdKey(userName), storedPassword)
        .sadd(this.usersSetKey(), userName);
    });
  }

  async getUserPasswordHash(userName: string): Promise<string | null> {
    const stored = await withRetry(() =>
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
    await this.withPipeline((pipeline) => {
      pipeline
        .set(this.userPwdKey(userName), storedValue)
        .sadd(this.usersSetKey(), userName);
    });
  }

  // 用户名索引 SET：getAllUsers 的 O(1) 读取路径（见 getAllUsers 的惰性回填说明）
  private usersSetKey() {
    return 'users';
  }

  // 删除用户及其所有数据
  async deleteUser(userName: string): Promise<void> {
    // episodeskip 为一剧一 key，需要 SCAN 后一并删除；其余均为整键删除
    const episodeSkipKeys = await this.scanKeys(`u:${userName}:episodeskip:*`);

    await this.withPipeline((pipeline) => {
      pipeline
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
        .srem(slotUsersKey(), userName)
        .srem(this.usersSetKey(), userName);
      for (const rankType of SLOT_RANK_TYPES) {
        pipeline.zrem(slotRankKey(rankType), userName);
      }
      for (const key of episodeSkipKeys) {
        pipeline.del(key);
      }
    });
    this.userStatsCache.delete(userName);
  }

  // ---------- 搜索历史 ----------
  private shKey(user: string) {
    return `u:${user}:sh`; // u:username:sh
  }

  async getSearchHistory(userName: string): Promise<string[]> {
    const result = await withRetry(() =>
      this.client.lrange(this.shKey(userName), 0, -1),
    );
    // 确保返回的都是字符串类型
    return ensureStringArray(result as any[]);
  }

  async addSearchHistory(userName: string, keyword: string): Promise<void> {
    const key = this.shKey(userName);
    // 去重 → 插入到最前 → 限制最大长度，合并为一次 pipeline 往返
    await this.withPipeline((pipeline) => {
      pipeline
        .lrem(key, 0, ensureString(keyword))
        .lpush(key, ensureString(keyword))
        .ltrim(key, 0, SEARCH_HISTORY_LIMIT - 1);
    });
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
    // 优先走用户索引 SET（SMEMBERS 1 次往返）。
    // 索引为空时惰性回填一次（兼容存量部署）：SCAN u:*:pwd 重建并持久化。
    const members = await withRetry(() =>
      this.client.smembers<string[]>(this.usersSetKey()),
    );
    if (members && members.length > 0) {
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
      await withRetry(() => this.client.sadd(this.usersSetKey(), users));
    }
    return users;
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
    return await withRetry(() =>
      this.client.hget<EpisodeSkipConfig>(this.skipHashKey(userName), field),
    );
  }

  async setSkipConfig(
    userName: string,
    source: string,
    id: string,
    config: EpisodeSkipConfig,
  ): Promise<void> {
    const field = `${source}+${id}`;

    await withRetry(() =>
      this.client.hset(this.skipHashKey(userName), { [field]: config }),
    );
  }

  async deleteSkipConfig(
    userName: string,
    source: string,
    id: string,
  ): Promise<void> {
    const field = `${source}+${id}`;

    await withRetry(() => this.client.hdel(this.skipHashKey(userName), field));
  }

  async getAllSkipConfigs(
    userName: string,
  ): Promise<{ [key: string]: EpisodeSkipConfig }> {
    const configs = await withRetry(() =>
      this.client.hgetall<Record<string, EpisodeSkipConfig>>(
        this.skipHashKey(userName),
      ),
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
    id: string,
  ): Promise<EpisodeSkipConfig | null> {
    const val = await withRetry(() =>
      this.client.get(this.episodeSkipConfigKey(userName, source, id)),
    );
    return val ? (val as EpisodeSkipConfig) : null;
  }

  async saveEpisodeSkipConfig(
    userName: string,
    source: string,
    id: string,
    config: EpisodeSkipConfig,
  ): Promise<void> {
    await withRetry(() =>
      this.client.set(this.episodeSkipConfigKey(userName, source, id), config),
    );
  }

  async deleteEpisodeSkipConfig(
    userName: string,
    source: string,
    id: string,
  ): Promise<void> {
    await withRetry(() =>
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
        await withRetry(() =>
          this.client.del(...doomedKeys.slice(i, i + BATCH_SIZE)),
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
    expireSeconds?: number,
  ): Promise<void> {
    const cacheKey = this.cacheKey(key);
    const value = JSON.stringify(data);

    if (expireSeconds !== undefined) {
      if (expireSeconds <= 0) {
        throw new Error(
          `Upstash Invalid TTL: ${expireSeconds} seconds. TTL must be positive.`,
        );
      }
      const ttl = Math.floor(expireSeconds);
      await withRetry(() => this.client.setex(cacheKey, ttl, value));
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
    }
  }

  // ---------- Redis 业务结构化能力 ----------

  async getSlotUserData(userName: string): Promise<SlotUserData | null> {
    const hashData = await withRetry(() =>
      this.client.hgetall<Record<string, unknown>>(slotUserKey(userName)),
    );

    return hashData && Object.keys(hashData).length > 0
      ? decodeHashObject(hashData)
      : null;
  }

  async setSlotUserData(
    userName: string,
    data: SlotUserData,
    expireSeconds = 86400 * 30,
  ): Promise<void> {
    // HSET + EXPIRE + SADD + 3×ZADD 合并为一次 pipeline 往返
    await this.withPipeline((pipeline) => {
      pipeline
        .hset(slotUserKey(userName), encodeHashObject(data))
        .expire(slotUserKey(userName), expireSeconds)
        .sadd(slotUsersKey(), userName);
      for (const rankType of SLOT_RANK_TYPES) {
        pipeline.zadd(slotRankKey(rankType), {
          score: getSlotRankScore(data, rankType),
          member: userName,
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
      const hashDatas = await this.withPipeline<Record<string, unknown>>(
        (pipeline) => {
          for (const userName of batch) {
            pipeline.hgetall<Record<string, unknown>>(slotUserKey(userName));
          }
        },
      );

      batch.forEach((userName, index) => {
        const hashData = hashDatas?.[index];
        if (hashData && Object.keys(hashData).length > 0) {
          result.push({ username: userName, ...decodeHashObject(hashData) });
        }
      });
    }
    return result;
  }

  async listSlotUsers(): Promise<Array<SlotUserData & { username: string }>> {
    const users = await withRetry(() =>
      this.client.smembers<string[]>(slotUsersKey()),
    );

    return this.getSlotUsersBatched(users ?? []);
  }

  async getSlotLeaderboard(
    type = 'coins',
    limit = 10,
  ): Promise<Array<SlotUserData & { username: string }>> {
    const rankType = SLOT_RANK_TYPES.includes(type) ? type : 'coins';

    const raw = await withRetry(() =>
      this.client.zrange(slotRankKey(rankType), 0, Math.max(0, limit - 1), {
        rev: true,
        withScores: true,
      }),
    );

    return this.getSlotUsersBatched(parseRankMembers(raw));
  }

  async incrementRateLimit(
    key: string,
    expireSeconds: number,
  ): Promise<number> {
    // INCR + EXPIRE NX 合并为一次 pipeline 往返（Upstash 兼容 Redis 7 的 EXPIRE NX）：
    // NX 仅在 key 无 TTL 时设置，与旧逻辑"仅首次 INCR 设 TTL"的固定窗口语义一致
    const [count] = await this.withPipeline<number>((pipeline) => {
      pipeline.incr(key);
      pipeline.expire(key, expireSeconds, 'NX');
    });
    return Number(count);
  }

  // ---------- 播放统计相关 ----------
  async getPlayStats(): Promise<PlayStatsResult> {
    try {
      const cached = await this.getCache('play_stats_summary');
      if (cached) {
        return cached as PlayStatsResult;
      }

      const allUsers = await this.getAllUsers();
      const PLAY_RECORDS_BATCH_SIZE = 8;
      const inputs: PlayStatsUserInput[] = [];

      for (let i = 0; i < allUsers.length; i += PLAY_RECORDS_BATCH_SIZE) {
        const batch = allUsers.slice(i, i + PLAY_RECORDS_BATCH_SIZE);
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

  async getUserPlayStat(userName: string): Promise<UserPlayStat> {
    // 检查缓存
    const now = Date.now();
    const cached = this.userStatsCache.get(userName);
    if (cached && now - cached.timestamp < this.userStatsCacheTTL) {
      return cached.data;
    }
    return (await this.getUserPlayStatWithRecords(userName)).stat;
  }

  // 用户统计 + 全量播放记录组合读取：一次 pipeline 拿齐，供 admin 统计页免双读
  async getUserPlayStatWithRecords(
    userName: string,
  ): Promise<{ stat: UserPlayStat; records: PlayRecord[] }> {
    try {
      // 一次 pipeline 同时拉取播放记录与登入统计（2 次往返 → 1 次）
      const [records, loginStatsStored] = await this.withPipeline<
        Record<string, PlayRecord>
      >((pipeline) => {
        pipeline.hgetall<Record<string, PlayRecord>>(this.prHashKey(userName));
        pipeline.hgetall<Partial<LoginStats>>(this.loginStatsKey(userName));
      });
      const playRecords = Object.values(records ?? {});
      const loginStats = normalizeLoginStats(loginStatsStored ?? {});

      const stat = this.buildUserPlayStat(userName, playRecords, loginStats);

      // 存入缓存
      this.userStatsCache.set(userName, {
        data: stat,
        timestamp: Date.now(),
      });

      return { stat, records: playRecords };
    } catch (error) {
      console.error(`获取用户 ${userName} 统计失败:`, error);
      // 失败时不写入内存缓存，避免短时间内把临时网络故障固定为空结果
      return { stat: emptyUserPlayStat(userName), records: [] };
    }
  }

  // 纯内存统计计算，供 getUserPlayStatWithRecords 复用
  private buildUserPlayStat(
    userName: string,
    playRecords: PlayRecord[],
    loginStats: LoginStats,
  ): UserPlayStat {
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
      playRecords.map((r) => `${r.title}_${r.source_name}_${r.year}`),
    ).size;

    // 计算首次观看时间
    const firstWatchDate = playRecords.length
      ? Math.min(...playRecords.map((r) => r.save_time || Date.now()))
      : Date.now();

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

    return {
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

      // 分批并行收集所有用户播放记录（串行逐用户 RTT 在隧道环境下代价高）
      const CONTENT_RECORDS_BATCH_SIZE = 8;
      const recordsByUsername: Array<{
        username: string;
        records: Record<string, PlayRecord>;
      }> = [];
      for (let i = 0; i < allUsers.length; i += CONTENT_RECORDS_BATCH_SIZE) {
        const batch = allUsers.slice(i, i + CONTENT_RECORDS_BATCH_SIZE);
        const rows = await Promise.all(
          batch.map(async (username) => ({
            username,
            records: await this.getAllPlayRecords(username),
          })),
        );
        recordsByUsername.push(...rows);
      }

      for (const { username, records } of recordsByUsername) {
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
    _watchTime: number,
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
    isFirstLogin?: boolean,
  ): Promise<void> {
    try {
      const loginStatsKey = this.loginStatsKey(userName);
      const currentStats = normalizeLoginStats(
        await withRetry(() =>
          this.client.hgetall<Partial<LoginStats>>(loginStatsKey),
        ),
      );
      const firstLoginTime =
        isFirstLogin || !currentStats.firstLoginTime
          ? loginTime
          : currentStats.firstLoginTime;

      // HINCRBY 与 HSET 相互独立，合并为一次 pipeline 往返
      await this.withPipeline((pipeline) => {
        pipeline.hincrby(loginStatsKey, 'loginCount', 1).hset(loginStatsKey, {
          firstLoginTime,
          lastLoginTime: loginTime,
          lastLoginDate: loginTime,
        });
      });
    } catch (error) {
      console.error(`更新用户 ${userName} 登入统计失败:`, error);
      throw error;
    }
  }

  // ---------- 访问日志相关 ----------
  // 已禁用：访问日志会产生大量 Redis 调用，导致 Upstash 费用过高
  async saveAccessLog(_accessLog: AccessLog): Promise<void> {
    // no-op（已禁用，见上方说明）
  }

  async getAccessLogs(
    _filters: {
      username?: string;
      startTime?: number;
      endTime?: number;
      action?: string;
    },
    _limit = 50,
    _offset = 0,
  ): Promise<AccessLog[]> {
    return [];
  }

  async deleteAccessLogs(_username?: string): Promise<number> {
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
        'UPSTASH_URL and UPSTASH_TOKEN env variables must be set',
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

    (global as any)[globalKey] = client;
  }

  return client;
}
