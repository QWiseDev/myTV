/* eslint-disable no-console */

import { db } from '@/lib/db';
import { PlayRecord, UserPlayStat } from '@/lib/types';

/**
 * 更新用户播放统计的核心服务函数
 * 被多个 API 端点共享使用
 *
 * 核心逻辑：
 * 1. 从存储后端获取最新的用户统计数据（已基于实时播放记录计算）
 * 2. 返回当前用户统计用于 API 响应一致性
 *
 * 注意：目前各存储后端(getUserPlayStat)已经能基于实时播放记录计算统计，
 * 无需持久化单独的统计数据，此方法主要用于API响应结构统一和处理错误情况
 *
 * @param username - 用户名
 * @returns 最新用户统计信息或null（如果发生错误或存储不支持）
 */
export async function updateUserPlayStatsService(username: string): Promise<UserPlayStat | null> {
  try {
    // 检查存储是否支持统计功能
    if (!db.isStatsSupported()) {
      console.log('存储类型不支持统计功能，跳过更新');
      return null;
    }

    // 获取当前用户统计数据（从播放记录实时计算）
    const currentStats = await db.getUserPlayStat(username);

    if (!currentStats) {
      console.warn(`无法获取用户 ${username} 的统计信息`);
      return null;
    }

    console.log(`[StatsService] 更新前用户统计:`, {
      username: currentStats.username,
      totalWatchTime: currentStats.totalWatchTime,
      totalMovies: currentStats.totalMovies,
      totalPlays: currentStats.totalPlays,
      hasLoginStats: !!(currentStats.loginCount && currentStats.lastLoginTime),
    });

    // 为了保持一致性，我们返回基于播放记录实时计算的统计数据
    // 这样可以确保数据的一致性，无需手动持久化更新
    // currentStats 已经是从 getUserPlayStat 获取的最新完整统计数据

    console.log(`[StatsService] 统计更新完成，基于播放记录实时计算`);

    return currentStats;
  } catch (error) {
    console.error('更新用户播放统计失败:', error);
    return null;
  }
}

/**
 * 从播放记录计算用户统计数据的辅助函数
 */
export function calculateStatsFromPlayRecord(
  record: PlayRecord,
  existingStats?: UserPlayStat
): Partial<UserPlayStat> {
  const baseStats = existingStats || {
    username: '',
    totalWatchTime: 0,
    totalPlays: 0,
    lastPlayTime: 0,
    recentRecords: [],
    avgWatchTime: 0,
    mostWatchedSource: '',
    totalMovies: 0,
    firstWatchDate: Date.now(),
    lastUpdateTime: Date.now(),
  };

  return {
    totalWatchTime: baseStats.totalWatchTime + record.play_time,
    totalPlays: baseStats.totalPlays + 1,
    lastPlayTime: Math.max(baseStats.lastPlayTime, record.save_time),
    lastUpdateTime: Date.now(),
  };
}