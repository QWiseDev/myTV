/* eslint-disable no-console, @typescript-eslint/no-explicit-any, @typescript-eslint/no-empty-function */
'use client';

import { cacheManager } from './cache-manager';
import {
  type UserStats,
  fetchFromApi,
  fetchWithAuth,
  STORAGE_TYPE,
} from './core';
import { getAllPlayRecords } from './play-records';
import { getAuthInfoFromBrowserCookie } from '../auth';
import type { PlayRecord } from '../types';

// ---- 常量 ----
const USER_STATS_KEY = 'moontv_user_stats'; // 添加用户统计数据存储键

// ---------------- 用户统计相关 API ----------------

/**
 * 计算注册天数
 * 基于注册时间或首次观看时间计算用户已注册的自然天数
 */
export function calculateRegistrationDays(startDate: number): number {
  if (!startDate || startDate <= 0) return 0;

  const firstDate = new Date(startDate);
  const currentDate = new Date();

  // 获取自然日（忽略时分秒）
  const firstDay = new Date(
    firstDate.getFullYear(),
    firstDate.getMonth(),
    firstDate.getDate(),
  );
  const currentDay = new Date(
    currentDate.getFullYear(),
    currentDate.getMonth(),
    currentDate.getDate(),
  );

  // 计算自然日差值并加1
  const daysDiff = Math.floor(
    (currentDay.getTime() - firstDay.getTime()) / (1000 * 60 * 60 * 24),
  );
  return daysDiff + 1;
}

/**
 * 获取用户统计数据
 * 数据库存储模式下使用混合缓存策略：优先返回缓存数据，后台异步同步最新数据
 */
export async function getUserStats(forceRefresh = false): Promise<UserStats> {
  try {
    // 如果强制刷新，清除缓存
    if (forceRefresh) {
      const authInfo = getAuthInfoFromBrowserCookie();
      if (authInfo?.username) {
        cacheManager.clearUserCache(authInfo.username);
      }
    }

    // 数据库存储模式：使用混合缓存策略
    if (STORAGE_TYPE !== 'localstorage') {
      // 先尝试从缓存获取
      const cached = cacheManager.getCachedUserStats();
      if (cached && !forceRefresh) {
        // 后台异步更新
        fetchFromApi<UserStats>('/api/user/my-stats')
          .then((freshData) => {
            if (JSON.stringify(cached) !== JSON.stringify(freshData)) {
              cacheManager.cacheUserStats(freshData);
              window.dispatchEvent(
                new CustomEvent('userStatsUpdated', {
                  detail: freshData,
                }),
              );
            }
          })
          .catch((err) => {
            console.warn('后台同步用户统计数据失败:', err);
          });

        return cached;
      }

      // 缓存为空或强制刷新，从服务器获取
      try {
        const freshData = await fetchFromApi<UserStats>('/api/user/my-stats');
        cacheManager.cacheUserStats(freshData);
        return freshData;
      } catch (error) {
        console.error('获取用户统计数据失败:', error);

        // 如果服务器请求失败，检查是否有缓存的统计数据
        const cachedStats = cacheManager.getCachedUserStats();
        if (cachedStats) {
          return cachedStats;
        }

        // 基于本地观看记录计算统计数据
        return await calculateStatsFromLocalData();
      }
    }

    // localStorage 模式
    return await calculateStatsFromLocalData();
  } catch (error) {
    console.error('获取用户统计数据失败:', error);
    return await calculateStatsFromLocalData();
  }
}

/**
 * 基于本地观看记录计算统计数据
 */
async function calculateStatsFromLocalData(): Promise<UserStats> {
  try {
    const playRecords = await getAllPlayRecords();
    const records = Object.values(playRecords);

    if (records.length === 0) {
      return {
        username: getAuthInfoFromBrowserCookie()?.username || 'unknown',
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
    }

    const totalWatchTime = records.reduce(
      (sum, record) => sum + record.play_time,
      0,
    );
    const totalMovies = new Set(
      records.map((r) => `${r.title}_${r.source_name}_${r.year}`),
    ).size;
    const firstWatchDate = Math.min(...records.map((r) => r.save_time));
    const lastPlayTime = Math.max(...records.map((r) => r.save_time));
    const totalPlays = records.length;

    // 计算最常观看的来源
    const sourceCounts = records.reduce(
      (acc, record) => {
        acc[record.source_name] = (acc[record.source_name] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );
    const mostWatchedSource =
      Object.entries(sourceCounts).sort(([, a], [, b]) => b - a)[0]?.[0] || '';

    // 获取最近的播放记录（最多10条），确保search_title字段存在
    const recentRecords = records
      .sort((a, b) => b.save_time - a.save_time)
      .slice(0, 10)
      .map((record) => ({
        ...record,
        search_title: record.search_title || record.title, // 确保search_title有值
      }));

    const stats: UserStats = {
      username: getAuthInfoFromBrowserCookie()?.username || 'unknown',
      totalWatchTime,
      totalPlays,
      lastPlayTime,
      recentRecords,
      avgWatchTime: totalPlays > 0 ? totalWatchTime / totalPlays : 0,
      mostWatchedSource,
      totalMovies,
      firstWatchDate,
      lastUpdateTime: Date.now(),
    };

    // 缓存计算结果
    if (STORAGE_TYPE !== 'localstorage') {
      cacheManager.cacheUserStats(stats);
    }

    return stats;
  } catch (error) {
    console.error('计算本地统计数据失败:', error);
    return {
      username: getAuthInfoFromBrowserCookie()?.username || 'unknown',
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
  }
}

/**
 * 更新用户统计数据
 * 智能计算观看时间增量，支持防刷机制
 */
export async function updateUserStats(record: PlayRecord): Promise<void> {
  try {
    // 统一使用相同的movieKey格式，确保影片数量统计准确
    const movieKey = `${record.title}_${record.source_name}_${record.year}`;

    // 使用包含集数信息的键来缓存每一集的播放进度
    const episodeKey = `${record.source_name}+${record.title}-${record.year}+${record.index}`;
    const lastProgressKey = `last_progress_${episodeKey}`;
    const lastUpdateTimeKey = `last_update_time_${episodeKey}`;

    // 获取上次播放进度和更新时间
    const lastProgress = parseInt(localStorage.getItem(lastProgressKey) || '0');
    const lastUpdateTime = parseInt(
      localStorage.getItem(lastUpdateTimeKey) || '0',
    );

    // 计算观看时间增量
    let watchTimeIncrement = 0;
    const currentTime = Date.now();
    const timeSinceLastUpdate = currentTime - lastUpdateTime;

    // 放宽更新条件：只要有实际播放进度变化就更新
    if (
      timeSinceLastUpdate < 10 * 1000 &&
      Math.abs(record.play_time - lastProgress) < 1
    ) {
      return;
    }

    // 改进的观看时间计算逻辑
    if (record.play_time > lastProgress) {
      // 正常播放进度增加
      watchTimeIncrement = record.play_time - lastProgress;

      // 如果进度增加过大（可能是快进），限制增量
      if (watchTimeIncrement > 300) {
        // 超过5分钟认为是快进
        watchTimeIncrement = Math.min(
          watchTimeIncrement,
          Math.floor(timeSinceLastUpdate / 1000) + 60,
        );
      }
    } else if (record.play_time < lastProgress) {
      // 进度回退的情况（重新观看、跳转等）
      if (timeSinceLastUpdate > 1 * 60 * 1000) {
        // 1分钟以上认为是重新开始观看
        watchTimeIncrement = Math.min(record.play_time, 60); // 重新观看最多给60秒增量
      } else {
        // 短时间内的回退，可能是快退操作，不给增量
        watchTimeIncrement = 0;
      }
    } else {
      // 进度相同，可能是暂停后继续，给予少量时间增量
      if (timeSinceLastUpdate > 30 * 1000) {
        // 30秒以上认为有观看时间
        watchTimeIncrement = Math.min(
          Math.floor(timeSinceLastUpdate / 1000),
          60,
        ); // 最多1分钟
      }
    }

    // 只要有观看时间增量就更新统计数据
    if (watchTimeIncrement > 0) {
      // 数据库存储模式：发送到服务器更新
      if (STORAGE_TYPE !== 'localstorage') {
        try {
          const response = await fetchWithAuth('/api/user/my-stats', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              watchTime: watchTimeIncrement,
              movieKey: movieKey,
              timestamp: currentTime,
            }),
          });

          if (response.ok) {
            const responseData = await response.json();

            // 更新localStorage中的上次播放进度和更新时间
            localStorage.setItem(lastProgressKey, record.play_time.toString());
            localStorage.setItem(lastUpdateTimeKey, currentTime.toString());

            // 立即更新缓存中的用户统计数据
            if (responseData.userStats) {
              cacheManager.cacheUserStats(responseData.userStats);

              // 触发用户统计数据更新事件
              window.dispatchEvent(
                new CustomEvent('userStatsUpdated', {
                  detail: responseData.userStats,
                }),
              );
            }
          } else {
            console.error(`更新用户统计数据失败: ${response.status}`);
            // API调用失败时，仍然更新本地进度记录
            localStorage.setItem(lastProgressKey, record.play_time.toString());
            localStorage.setItem(lastUpdateTimeKey, currentTime.toString());
          }
        } catch (error) {
          console.error('统计数据更新请求异常:', error);
          // 即使API请求失败，也要更新本地进度记录
          localStorage.setItem(lastProgressKey, record.play_time.toString());
          localStorage.setItem(lastUpdateTimeKey, currentTime.toString());
        }
      } else {
        // localStorage 模式：本地更新统计数据
        try {
          const currentStats = await getUserStats();
          const updatedStats: UserStats = {
            ...currentStats,
            totalWatchTime: currentStats.totalWatchTime + watchTimeIncrement,
            lastUpdateTime: currentTime,
          };

          // 检查是否有新的影片
          const playRecords = await getAllPlayRecords();
          const uniqueMovies = new Set(
            Object.values(playRecords).map(
              (r) => `${r.title}_${r.source_name}_${r.year}`,
            ),
          );
          updatedStats.totalMovies = uniqueMovies.size;

          // 保存到localStorage
          localStorage.setItem(USER_STATS_KEY, JSON.stringify(updatedStats));

          // 更新进度记录
          localStorage.setItem(lastProgressKey, record.play_time.toString());
          localStorage.setItem(lastUpdateTimeKey, currentTime.toString());

          // 触发更新事件
          window.dispatchEvent(
            new CustomEvent('userStatsUpdated', {
              detail: updatedStats,
            }),
          );
        } catch (error) {
          console.error('本地统计数据更新失败:', error);
        }
      }
    } else {
      // 即使没有增量，也要更新时间戳和进度
      localStorage.setItem(lastProgressKey, record.play_time.toString());
      localStorage.setItem(lastUpdateTimeKey, currentTime.toString());
    }
  } catch (error) {
    console.error('更新用户统计数据失败:', error);
    // 静默失败，不影响用户体验
  }
}

/**
 * 清除用户统计数据
 */
export async function clearUserStats(): Promise<void> {
  try {
    if (STORAGE_TYPE !== 'localstorage') {
      // 从服务器清除
      await fetchWithAuth('/api/user/my-stats', {
        method: 'DELETE',
      });

      // 清除本地缓存
      const authInfo = getAuthInfoFromBrowserCookie();
      if (authInfo?.username) {
        cacheManager.clearUserCache(authInfo.username);
      }
    } else {
      // localStorage 模式
      localStorage.removeItem(USER_STATS_KEY);
    }

    // 触发统计数据清除事件
    window.dispatchEvent(
      new CustomEvent('userStatsUpdated', {
        detail: {
          username: getAuthInfoFromBrowserCookie()?.username || 'unknown',
          totalWatchTime: 0,
          totalPlays: 0,
          lastPlayTime: 0,
          recentRecords: [],
          avgWatchTime: 0,
          mostWatchedSource: '',
          totalMovies: 0,
          firstWatchDate: Date.now(),
          lastUpdateTime: Date.now(),
        },
      }),
    );
  } catch (error) {
    console.error('清除用户统计数据失败:', error);
    throw error;
  }
}
