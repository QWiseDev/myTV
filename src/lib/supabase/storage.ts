/* eslint-disable no-console, @typescript-eslint/no-explicit-any, @typescript-eslint/no-non-null-assertion */

import { SupabaseClient } from '@supabase/supabase-js';

import { getSupabaseClient } from './client';
import { AdminConfig } from '../admin.types';
import {
  AccessLog,
  ContentStat,
  EpisodeSkipConfig,
  Favorite,
  IStorage,
  PlayRecord,
  PlayStatsResult,
  UserPlayStat,
} from '../types';

const SEARCH_HISTORY_LIMIT = 20;

function ensureString(value: any): string {
  return String(value);
}

function ensureStringArray(value: any[]): string[] {
  return value.map((item) => String(item));
}

export class SupabaseStorage implements IStorage {
  private client: SupabaseClient;
  private userIdCache: Map<string, string> = new Map();

  constructor() {
    this.client = getSupabaseClient();
  }

  private async getUserIdByUsername(username: string): Promise<string | null> {
    if (this.userIdCache.has(username)) {
      return this.userIdCache.get(username)!;
    }

    const { data, error } = await this.client
      .from('profiles')
      .select('id')
      .eq('username', username)
      .single();

    if (error || !data) {
      console.warn(`[Supabase] 用户 ${username} 未找到 profile`);
      return null;
    }

    this.userIdCache.set(username, data.id);
    return data.id;
  }

  private async getUsernameByUserId(userId: string): Promise<string | null> {
    const { data, error } = await this.client
      .from('profiles')
      .select('username')
      .eq('id', userId)
      .single();

    if (error || !data) {
      return null;
    }

    return data.username;
  }

  async getPlayRecord(
    userName: string,
    key: string
  ): Promise<PlayRecord | null> {
    try {
      const userId = await this.getUserIdByUsername(userName);
      if (!userId) return null;

      const [source, id] = key.split('+', 2);
      if (!source || !id) return null;

      const { data, error } = await this.client
        .from('play_records')
        .select('*')
        .eq('user_id', userId)
        .eq('source', source)
        .eq('source_id', id)
        .single();

      if (error || !data) return null;

      return {
        title: data.title,
        source_name: data.source_name,
        cover: data.cover,
        year: data.year,
        index: data.episode_index,
        total_episodes: data.total_episodes,
        original_episodes: data.original_episodes,
        play_time: data.play_time,
        total_time: data.total_time,
        save_time: new Date(data.save_time).getTime(),
        search_title: data.search_title,
        remarks: data.remarks,
      };
    } catch (err) {
      console.error('[Supabase] getPlayRecord 错误:', err);
      return null;
    }
  }

  async setPlayRecord(
    userName: string,
    key: string,
    record: PlayRecord
  ): Promise<void> {
    try {
      const userId = await this.getUserIdByUsername(userName);
      if (!userId) throw new Error('用户不存在');

      const [source, id] = key.split('+', 2);
      if (!source || !id) throw new Error('无效的 key 格式');

      const { error } = await this.client.from('play_records').upsert(
        {
          user_id: userId,
          source,
          source_id: id,
          title: record.title,
          source_name: record.source_name,
          cover: record.cover,
          year: record.year,
          episode_index: record.index,
          total_episodes: record.total_episodes,
          original_episodes: record.original_episodes,
          play_time: record.play_time,
          total_time: record.total_time,
          save_time: new Date(record.save_time || Date.now()),
          search_title: record.search_title,
          remarks: record.remarks,
        },
        { onConflict: 'user_id, source, source_id' }
      );

      if (error) throw error;
    } catch (err) {
      console.error('[Supabase] setPlayRecord 错误:', err);
      throw err;
    }
  }

  async getAllPlayRecords(
    userName: string
  ): Promise<Record<string, PlayRecord>> {
    try {
      const userId = await this.getUserIdByUsername(userName);
      if (!userId) return {};

      const { data, error } = await this.client
        .from('play_records')
        .select('*')
        .eq('user_id', userId);

      if (error) throw error;
      if (!data || data.length === 0) return {};

      const result: Record<string, PlayRecord> = {};
      for (const item of data) {
        const key = `${item.source}+${item.source_id}`;
        result[key] = {
          title: item.title,
          source_name: item.source_name,
          cover: item.cover,
          year: item.year,
          index: item.episode_index,
          total_episodes: item.total_episodes,
          original_episodes: item.original_episodes,
          play_time: item.play_time,
          total_time: item.total_time,
          save_time: new Date(item.save_time).getTime(),
          search_title: item.search_title,
          remarks: item.remarks,
        };
      }

      return result;
    } catch (err) {
      console.error('[Supabase] getAllPlayRecords 错误:', err);
      return {};
    }
  }

  async deletePlayRecord(userName: string, key: string): Promise<void> {
    try {
      const userId = await this.getUserIdByUsername(userName);
      if (!userId) return;

      const [source, id] = key.split('+', 2);
      if (!source || !id) return;

      const { error } = await this.client
        .from('play_records')
        .delete()
        .eq('user_id', userId)
        .eq('source', source)
        .eq('source_id', id);

      if (error) throw error;
    } catch (err) {
      console.error('[Supabase] deletePlayRecord 错误:', err);
    }
  }

  async getFavorite(
    userName: string,
    key: string
  ): Promise<Favorite | null> {
    try {
      const userId = await this.getUserIdByUsername(userName);
      if (!userId) return null;

      const [source, id] = key.split('+', 2);
      if (!source || !id) return null;

      const { data, error } = await this.client
        .from('favorites')
        .select('*')
        .eq('user_id', userId)
        .eq('source', source)
        .eq('source_id', id)
        .single();

      if (error || !data) return null;

      return {
        source_name: data.source_name,
        total_episodes: data.total_episodes,
        title: data.title,
        year: data.year,
        cover: data.cover,
        save_time: new Date(data.save_time).getTime(),
        search_title: data.search_title,
        origin: data.origin,
      };
    } catch (err) {
      console.error('[Supabase] getFavorite 错误:', err);
      return null;
    }
  }

  async setFavorite(
    userName: string,
    key: string,
    favorite: Favorite
  ): Promise<void> {
    try {
      const userId = await this.getUserIdByUsername(userName);
      if (!userId) throw new Error('用户不存在');

      const [source, id] = key.split('+', 2);
      if (!source || !id) throw new Error('无效的 key 格式');

      const { error } = await this.client.from('favorites').upsert(
        {
          user_id: userId,
          source,
          source_id: id,
          source_name: favorite.source_name,
          total_episodes: favorite.total_episodes,
          title: favorite.title,
          year: favorite.year,
          cover: favorite.cover,
          save_time: new Date(favorite.save_time || Date.now()),
          search_title: favorite.search_title,
          origin: favorite.origin || 'vod',
        },
        { onConflict: 'user_id, source, source_id' }
      );

      if (error) throw error;
    } catch (err) {
      console.error('[Supabase] setFavorite 错误:', err);
      throw err;
    }
  }

  async getAllFavorites(userName: string): Promise<Record<string, Favorite>> {
    try {
      const userId = await this.getUserIdByUsername(userName);
      if (!userId) return {};

      const { data, error } = await this.client
        .from('favorites')
        .select('*')
        .eq('user_id', userId);

      if (error) throw error;
      if (!data || data.length === 0) return {};

      const result: Record<string, Favorite> = {};
      for (const item of data) {
        const key = `${item.source}+${item.source_id}`;
        result[key] = {
          source_name: item.source_name,
          total_episodes: item.total_episodes,
          title: item.title,
          year: item.year,
          cover: item.cover,
          save_time: new Date(item.save_time).getTime(),
          search_title: item.search_title,
          origin: item.origin,
        };
      }

      return result;
    } catch (err) {
      console.error('[Supabase] getAllFavorites 错误:', err);
      return {};
    }
  }

  async deleteFavorite(userName: string, key: string): Promise<void> {
    try {
      const userId = await this.getUserIdByUsername(userName);
      if (!userId) return;

      const [source, id] = key.split('+', 2);
      if (!source || !id) return;

      const { error } = await this.client
        .from('favorites')
        .delete()
        .eq('user_id', userId)
        .eq('source', source)
        .eq('source_id', id);

      if (error) throw error;
    } catch (err) {
      console.error('[Supabase] deleteFavorite 错误:', err);
    }
  }

  async registerUser(userName: string, password: string): Promise<void> {
    try {
      const { error } = await this.client.from('profiles').insert({
        username: userName,
        password_hash: password,
        role: 'user',
      });

      if (error) throw error;
    } catch (err) {
      console.error('[Supabase] registerUser 错误:', err);
      throw err;
    }
  }

  async verifyUser(userName: string, password: string): Promise<boolean> {
    try {
      const { data, error } = await this.client
        .from('profiles')
        .select('password_hash')
        .eq('username', userName)
        .eq('banned', false)
        .single();

      if (error || !data) return false;

      return ensureString(data.password_hash) === password;
    } catch (err) {
      console.error('[Supabase] verifyUser 错误:', err);
      return false;
    }
  }

  async checkUserExist(userName: string): Promise<boolean> {
    try {
      const { data, error } = await this.client
        .from('profiles')
        .select('id')
        .eq('username', userName)
        .single();

      return !error && !!data;
    } catch (err) {
      return false;
    }
  }

  async changePassword(userName: string, newPassword: string): Promise<void> {
    try {
      const { error } = await this.client
        .from('profiles')
        .update({ password_hash: newPassword, updated_at: new Date() })
        .eq('username', userName);

      if (error) throw error;
    } catch (err) {
      console.error('[Supabase] changePassword 错误:', err);
      throw err;
    }
  }

  async deleteUser(userName: string): Promise<void> {
    try {
      const userId = await this.getUserIdByUsername(userName);
      if (!userId) return;

      const { error } = await this.client
        .from('profiles')
        .delete()
        .eq('id', userId);

      if (error) throw error;

      this.userIdCache.delete(userName);
    } catch (err) {
      console.error('[Supabase] deleteUser 错误:', err);
    }
  }

  async getSearchHistory(userName: string): Promise<string[]> {
    try {
      const userId = await this.getUserIdByUsername(userName);
      if (!userId) return [];

      const { data, error } = await this.client
        .from('search_history')
        .select('keyword')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(SEARCH_HISTORY_LIMIT);

      if (error) throw error;

      return ensureStringArray(data.map((item) => item.keyword));
    } catch (err) {
      console.error('[Supabase] getSearchHistory 错误:', err);
      return [];
    }
  }

  async addSearchHistory(userName: string, keyword: string): Promise<void> {
    try {
      const userId = await this.getUserIdByUsername(userName);
      if (!userId) return;

      const keywordStr = ensureString(keyword);

      await this.client.rpc('add_search_history', {
        p_user_id: userId,
        p_keyword: keywordStr,
        p_limit: SEARCH_HISTORY_LIMIT,
      });
    } catch (err) {
      console.error('[Supabase] addSearchHistory 错误:', err);
    }
  }

  async deleteSearchHistory(userName: string, keyword?: string): Promise<void> {
    try {
      const userId = await this.getUserIdByUsername(userName);
      if (!userId) return;

      if (keyword) {
        const { error } = await this.client
          .from('search_history')
          .delete()
          .eq('user_id', userId)
          .eq('keyword', ensureString(keyword));

        if (error) throw error;
      } else {
        const { error } = await this.client
          .from('search_history')
          .delete()
          .eq('user_id', userId);

        if (error) throw error;
      }
    } catch (err) {
      console.error('[Supabase] deleteSearchHistory 错误:', err);
    }
  }

  async getAllUsers(): Promise<string[]> {
    try {
      const { data, error } = await this.client
        .from('profiles')
        .select('username');

      if (error) throw error;

      return data.map((item) => item.username);
    } catch (err) {
      console.error('[Supabase] getAllUsers 错误:', err);
      return [];
    }
  }

  async getAdminConfig(): Promise<AdminConfig | null> {
    try {
      const { data, error } = await this.client
        .from('admin_config')
        .select('config')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error || !data) return null;

      if (typeof data.config === 'string') {
        try {
          return JSON.parse(data.config);
        } catch {
          return null;
        }
      }

      return data.config as AdminConfig;
    } catch (err) {
      console.error('[Supabase] getAdminConfig 错误:', err);
      return null;
    }
  }

  async setAdminConfig(config: AdminConfig): Promise<void> {
    try {
      // 先查询是否已有配置记录
      const { data: existing } = await this.client
        .from('admin_config')
        .select('id')
        .order('created_at', { ascending: true })
        .limit(1)
        .single();

      if (existing) {
        // 更新现有记录
        const { error } = await this.client
          .from('admin_config')
          .update({
            config: JSON.stringify(config),
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id);

        if (error) throw error;
      } else {
        // 插入新记录
        const { error } = await this.client.from('admin_config').insert({
          config: JSON.stringify(config),
        });

        if (error) throw error;
      }
    } catch (err) {
      console.error('[Supabase] setAdminConfig 错误:', err);
      throw err;
    }
  }

  async getSkipConfig(
    userName: string,
    source: string,
    id: string
  ): Promise<EpisodeSkipConfig | null> {
    try {
      const userId = await this.getUserIdByUsername(userName);
      if (!userId) return null;

      const { data, error } = await this.client
        .from('episode_skip_configs')
        .select('*')
        .eq('user_id', userId)
        .eq('source', source)
        .eq('source_id', id)
        .single();

      if (error || !data) return null;

      return {
        source: data.source,
        id: data.source_id,
        title: data.title,
        segments: data.segments,
        updated_time: new Date(data.updated_time).getTime(),
      };
    } catch (err) {
      console.error('[Supabase] getSkipConfig 错误:', err);
      return null;
    }
  }

  async setSkipConfig(
    userName: string,
    source: string,
    id: string,
    config: EpisodeSkipConfig
  ): Promise<void> {
    try {
      const userId = await this.getUserIdByUsername(userName);
      if (!userId) throw new Error('用户不存在');

      const { error } = await this.client
        .from('episode_skip_configs')
        .upsert(
          {
            user_id: userId,
            source,
            source_id: id,
            title: config.title,
            segments: config.segments,
            updated_time: new Date(config.updated_time || Date.now()),
          },
          { onConflict: 'user_id, source, source_id' }
        );

      if (error) throw error;
    } catch (err) {
      console.error('[Supabase] setSkipConfig 错误:', err);
      throw err;
    }
  }

  async deleteSkipConfig(
    userName: string,
    source: string,
    id: string
  ): Promise<void> {
    try {
      const userId = await this.getUserIdByUsername(userName);
      if (!userId) return;

      const { error } = await this.client
        .from('episode_skip_configs')
        .delete()
        .eq('user_id', userId)
        .eq('source', source)
        .eq('source_id', id);

      if (error) throw error;
    } catch (err) {
      console.error('[Supabase] deleteSkipConfig 错误:', err);
    }
  }

  async getAllSkipConfigs(
    userName: string
  ): Promise<Record<string, EpisodeSkipConfig>> {
    try {
      const userId = await this.getUserIdByUsername(userName);
      if (!userId) return {};

      const { data, error } = await this.client
        .from('episode_skip_configs')
        .select('*')
        .eq('user_id', userId);

      if (error) throw error;
      if (!data || data.length === 0) return {};

      const result: Record<string, EpisodeSkipConfig> = {};
      for (const item of data) {
        const key = `${item.source}+${item.source_id}`;
        result[key] = {
          source: item.source,
          id: item.source_id,
          title: item.title,
          segments: item.segments,
          updated_time: new Date(item.updated_time).getTime(),
        };
      }

      return result;
    } catch (err) {
      console.error('[Supabase] getAllSkipConfigs 错误:', err);
      return {};
    }
  }

  async getEpisodeSkipConfig(
    userName: string,
    source: string,
    id: string
  ): Promise<EpisodeSkipConfig | null> {
    try {
      const userId = await this.getUserIdByUsername(userName);
      if (!userId) return null;

      const { data, error } = await this.client
        .from('episode_skip_configs')
        .select('*')
        .eq('user_id', userId)
        .eq('source', source)
        .eq('source_id', id)
        .single();

      if (error || !data) return null;

      return {
        source: data.source,
        id: data.source_id,
        title: data.title,
        segments: data.segments,
        updated_time: new Date(data.updated_time).getTime(),
      };
    } catch (err) {
      console.error('[Supabase] getEpisodeSkipConfig 错误:', err);
      return null;
    }
  }

  async saveEpisodeSkipConfig(
    userName: string,
    source: string,
    id: string,
    config: EpisodeSkipConfig
  ): Promise<void> {
    try {
      const userId = await this.getUserIdByUsername(userName);
      if (!userId) throw new Error('用户不存在');

      const { error } = await this.client
        .from('episode_skip_configs')
        .upsert(
          {
            user_id: userId,
            source,
            source_id: id,
            title: config.title,
            segments: config.segments,
            updated_time: new Date(config.updated_time || Date.now()),
          },
          { onConflict: 'user_id, source, source_id' }
        );

      if (error) throw error;
    } catch (err) {
      console.error('[Supabase] saveEpisodeSkipConfig 错误:', err);
      throw err;
    }
  }

  async deleteEpisodeSkipConfig(
    userName: string,
    source: string,
    id: string
  ): Promise<void> {
    try {
      const userId = await this.getUserIdByUsername(userName);
      if (!userId) return;

      const { error } = await this.client
        .from('episode_skip_configs')
        .delete()
        .eq('user_id', userId)
        .eq('source', source)
        .eq('source_id', id);

      if (error) throw error;
    } catch (err) {
      console.error('[Supabase] deleteEpisodeSkipConfig 错误:', err);
    }
  }

  async getAllEpisodeSkipConfigs(
    userName: string
  ): Promise<Record<string, EpisodeSkipConfig>> {
    try {
      const userId = await this.getUserIdByUsername(userName);
      if (!userId) return {};

      const { data, error } = await this.client
        .from('episode_skip_configs')
        .select('*')
        .eq('user_id', userId);

      if (error) throw error;
      if (!data || data.length === 0) return {};

      const result: Record<string, EpisodeSkipConfig> = {};
      for (const item of data) {
        const key = `${item.source}+${item.source_id}`;
        result[key] = {
          source: item.source,
          id: item.source_id,
          title: item.title,
          segments: item.segments,
          updated_time: new Date(item.updated_time).getTime(),
        };
      }

      return result;
    } catch (err) {
      console.error('[Supabase] getAllEpisodeSkipConfigs 错误:', err);
      return {};
    }
  }

  async clearAllData(): Promise<void> {
    const tables = [
      'access_logs',
      'user_statistics',
      'search_history',
      'episode_skip_configs',
      'favorites',
      'play_records',
      'admin_config',
    ];

    for (const table of tables) {
      try {
        const { error } = await this.client.from(table).delete().neq('id', '');
        if (error) console.warn(`[Supabase] 清空 ${table} 失败:`, error);
      } catch (err) {
        console.warn(`[Supabase] 清空 ${table} 错误:`, err);
      }
    }
  }

  async getCache(key: string): Promise<any | null> {
    try {
      const { data, error } = await this.client
        .from('cache_store')
        .select('value, expires_at')
        .eq('key', key)
        .single();

      if (error || !data) return null;

      if (data.expires_at && new Date(data.expires_at) < new Date()) {
        await this.deleteCache(key);
        return null;
      }

      if (typeof data.value === 'string') {
        try {
          return JSON.parse(data.value);
        } catch {
          return data.value;
        }
      }

      return data.value;
    } catch (err) {
      console.error('[Supabase] getCache 错误:', err);
      return null;
    }
  }

  async setCache(
    key: string,
    data: any,
    expireSeconds?: number
  ): Promise<void> {
    try {
      const value = JSON.stringify(data);
      const expiresAt = expireSeconds
        ? new Date(Date.now() + expireSeconds * 1000).toISOString()
        : null;

      const { error } = await this.client.from('cache_store').upsert(
        {
          key,
          value,
          expires_at: expiresAt,
          created_at: new Date().toISOString(),
        },
        { onConflict: 'key' }
      );

      if (error) throw error;
    } catch (err) {
      console.error('[Supabase] setCache 错误:', err);
    }
  }

  async deleteCache(key: string): Promise<void> {
    try {
      const { error } = await this.client
        .from('cache_store')
        .delete()
        .eq('key', key);

      if (error) throw error;
    } catch (err) {
      console.error('[Supabase] deleteCache 错误:', err);
    }
  }

  async keys(pattern: string): Promise<string[]> {
    try {
      const { data, error } = await this.client
        .from('cache_store')
        .select('key')
        .like('key', pattern.replace('*', '%'));

      if (error) throw error;

      return data.map((item) => item.key);
    } catch (err) {
      console.error('[Supabase] keys 错误:', err);
      return [];
    }
  }

  async clearExpiredCache(prefix?: string): Promise<void> {
    try {
      let query = this.client
        .from('cache_store')
        .delete()
        .lt('expires_at', new Date().toISOString());

      if (prefix) {
        query = query.like('key', `${prefix}%`);
      }

      const { error } = await query;
      if (error) throw error;
    } catch (err) {
      console.error('[Supabase] clearExpiredCache 错误:', err);
    }
  }

  async getPlayStats(): Promise<PlayStatsResult> {
    try {
      const { data: users, error: usersError } = await this.client
        .from('profiles')
        .select('id, username, created_at');

      if (usersError) throw usersError;

      const { data: stats, error: statsError } = await this.client
        .from('user_statistics')
        .select('*');

      if (statsError) throw statsError;

      const { data: records, error: recordsError } = await this.client
        .from('play_records')
        .select('source_name, play_time, save_time');

      if (recordsError) throw recordsError;

      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
      const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

      let totalWatchTime = 0;
      let totalPlays = 0;
      let todayNewUsers = 0;
      const sourceStats: Record<string, { count: number; watchTime: number }> = {};
      const dailyStats: Record<string, { plays: number; watchTime: number }> = {};
      const registrationTrend: Record<string, number> = {};
      const userMap = new Map<string, typeof users[0]>();
      for (const user of users || []) {
        userMap.set(user.id, user);
        if (new Date(user.created_at) >= today) {
          todayNewUsers++;
        }
      }

      const userStatsResult: Array<{
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

      for (const stat of stats || []) {
        totalWatchTime += stat.total_watch_time || 0;
        totalPlays += stat.total_plays || 0;

        const username = await this.getUsernameByUserId(stat.user_id);
        if (username) {
          const profileUser = userMap.get(stat.user_id);
          const createdAt = profileUser?.created_at
            ? new Date(profileUser.created_at).getTime()
            : Date.now();
          userStatsResult.push({
            username,
            totalWatchTime: stat.total_watch_time || 0,
            totalPlays: stat.total_plays || 0,
            lastPlayTime: stat.last_play_time?.getTime() || 0,
            recentRecords: [],
            avgWatchTime:
              stat.total_plays > 0
                ? (stat.total_watch_time || 0) / stat.total_plays
                : 0,
            mostWatchedSource: '',
            registrationDays: Math.floor(
              (Date.now() - createdAt) / (24 * 60 * 60 * 1000)
            ),
            lastLoginTime: stat.last_login_time?.getTime() || 0,
            loginCount: stat.login_count || 0,
            createdAt,
          });
        }
      }

      for (const record of records || []) {
        totalPlays++;
        totalWatchTime += record.play_time || 0;

        const sourceName = record.source_name || '未知来源';
        if (!sourceStats[sourceName]) {
          sourceStats[sourceName] = { count: 0, watchTime: 0 };
        }
        sourceStats[sourceName].count++;
        sourceStats[sourceName].watchTime += record.play_time || 0;

        if (record.save_time) {
          const dateKey = new Date(record.save_time)
            .toISOString()
            .split('T')[0];
          if (!dailyStats[dateKey]) {
            dailyStats[dateKey] = { plays: 0, watchTime: 0 };
          }
          dailyStats[dateKey].plays++;
          dailyStats[dateKey].watchTime += record.play_time || 0;
        }
      }

      const topSources = Object.entries(sourceStats)
        .map(([source, stats]) => ({
          source,
          count: stats.count,
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      const dailyStatsArray = Object.entries(dailyStats)
        .map(([date, stats]) => ({
          date,
          plays: stats.plays,
          watchTime: stats.watchTime,
        }))
        .sort((a, b) => a.date.localeCompare(b.date));

      const registrationTrendArray = Object.entries(registrationTrend)
        .map(([date, newUsers]) => ({
          date,
          newUsers,
        }))
        .sort((a, b) => a.date.localeCompare(b.date));

      const dailyActiveUsers = userStatsResult.filter(
        (u) => (u.lastLoginTime || 0) >= today.getTime()
      ).length;
      const weeklyActiveUsers = userStatsResult.filter(
        (u) => (u.lastLoginTime || 0) >= weekAgo.getTime()
      ).length;
      const monthlyActiveUsers = userStatsResult.filter(
        (u) => (u.lastLoginTime || 0) >= monthAgo.getTime()
      ).length;

      return {
        totalUsers: users?.length || 0,
        totalWatchTime,
        totalPlays,
        avgWatchTimePerUser:
          users?.length > 0 ? totalWatchTime / users.length : 0,
        avgPlaysPerUser: users?.length > 0 ? totalPlays / users.length : 0,
        userStats: userStatsResult,
        topSources,
        dailyStats: dailyStatsArray,
        registrationStats: {
          todayNewUsers,
          totalRegisteredUsers: users?.length || 0,
          registrationTrend: registrationTrendArray,
        },
        activeUsers: {
          daily: dailyActiveUsers,
          weekly: weeklyActiveUsers,
          monthly: monthlyActiveUsers,
        },
      };
    } catch (err) {
      console.error('[Supabase] getPlayStats 错误:', err);
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
  }

  async getUserPlayStat(userName: string): Promise<UserPlayStat> {
    try {
      const userId = await this.getUserIdByUsername(userName);
      if (!userId) {
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

      const { data: statsData } = await this.client
        .from('user_statistics')
        .select('*')
        .eq('user_id', userId)
        .single();

      const records = await this.getAllPlayRecords(userName);
      const playRecords = Object.values(records);

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

      let mostWatchedSource = '';
      let maxCount = 0;
      for (const [source, count] of Object.entries(sourceCount)) {
        if (count > maxCount) {
          maxCount = count;
          mostWatchedSource = source;
        }
      }

      const recentRecords = playRecords
        .sort((a, b) => (b.save_time || 0) - (a.save_time || 0))
        .slice(0, 10);

      return {
        username: userName,
        totalWatchTime,
        totalPlays: playRecords.length,
        lastPlayTime,
        recentRecords,
        avgWatchTime:
          playRecords.length > 0 ? totalWatchTime / playRecords.length : 0,
        mostWatchedSource,
        totalMovies: statsData?.total_movies || 0,
        firstWatchDate: statsData?.first_watch_date?.getTime() || Date.now(),
        lastUpdateTime: Date.now(),
        loginCount: statsData?.login_count || 0,
        firstLoginTime: statsData?.first_login_time?.getTime() || 0,
        lastLoginTime: statsData?.last_login_time?.getTime() || 0,
        lastLoginDate: statsData?.last_login_time?.getTime() || 0,
      };
    } catch (err) {
      console.error('[Supabase] getUserPlayStat 错误:', err);
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
  }

  async getContentStats(_limit?: number): Promise<ContentStat[]> {
    return [];
  }

  async updatePlayStatistics(
    _userName: string,
    _source: string,
    _id: string,
    _watchTime: number
  ): Promise<void> {
    // Placeholder for future implementation
  }

  async updateUserLoginStats(
    userName: string,
    loginTime: number,
    _isFirstLogin?: boolean
  ): Promise<void> {
    try {
      const userId = await this.getUserIdByUsername(userName);
      if (!userId) return;

      await this.client.rpc('update_user_login_stats', {
        p_user_id: userId,
        p_login_time: new Date(loginTime),
      });
    } catch (err) {
      console.error('[Supabase] updateUserLoginStats 错误:', err);
    }
  }

  async saveAccessLog(accessLog: AccessLog): Promise<void> {
    try {
      let userId: string | null = null;
      if (accessLog.username) {
        userId = await this.getUserIdByUsername(accessLog.username);
      }

      const { error } = await this.client.from('access_logs').insert({
        user_id: userId,
        username: accessLog.username,
        action: accessLog.action,
        page_url: accessLog.pageUrl,
        ip_address: accessLog.ipAddress,
        user_agent: accessLog.userAgent,
        referrer: accessLog.referrer,
        location: accessLog.location,
        created_at: new Date(accessLog.timestamp),
      });

      if (error) throw error;
    } catch (err) {
      console.error('[Supabase] saveAccessLog 错误:', err);
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
    offset = 0
  ): Promise<AccessLog[]> {
    try {
      let query = this.client
        .from('access_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (filters.username) {
        const userId = await this.getUserIdByUsername(filters.username);
        if (userId) {
          query = query.eq('user_id', userId);
        }
      }

      if (filters.startTime) {
        query = query.gte('created_at', new Date(filters.startTime));
      }

      if (filters.endTime) {
        query = query.lte('created_at', new Date(filters.endTime));
      }

      if (filters.action) {
        query = query.eq('action', filters.action);
      }

      const { data, error } = await query;
      if (error) throw error;

      return data.map((item) => ({
        userId: item.user_id,
        username: item.username,
        action: item.action,
        pageUrl: item.page_url,
        timestamp: new Date(item.created_at).getTime(),
        ipAddress: item.ip_address,
        userAgent: item.user_agent,
        referrer: item.referrer,
        location: item.location,
      }));
    } catch (err) {
      console.error('[Supabase] getAccessLogs 错误:', err);
      return [];
    }
  }

  async deleteAccessLogs(username?: string): Promise<number> {
    try {
      let query = this.client.from('access_logs').delete();

      if (username) {
        const userId = await this.getUserIdByUsername(username);
        if (userId) {
          query = query.eq('user_id', userId);
        } else {
          return 0;
        }
      }

      const { count, error } = await query;
      if (error) throw error;

      return count || 0;
    } catch (err) {
      console.error('[Supabase] deleteAccessLogs 错误:', err);
      return 0;
    }
  }
}
