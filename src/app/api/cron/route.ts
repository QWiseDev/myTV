/* eslint-disable no-console,@typescript-eslint/no-explicit-any */

import { NextRequest, NextResponse } from 'next/server';

import { getConfig, refineConfig } from '@/lib/config';
import { fetchDecodedConfigSubscription } from '@/lib/config-subscription';
import { db } from '@/lib/db';
import { fetchVideoDetail } from '@/lib/fetchVideoDetail';
import { refreshEnabledLiveChannels } from '@/lib/live';
import { parseStorageKey } from '@/lib/storage-key';
import { Favorite, PlayRecord, SearchResult } from '@/lib/types';
import {
  buildWatchingUpdatesFromRecordsWithDetails,
  saveWatchingUpdatesForUser,
  VideoDetailResolver,
} from '@/lib/watching-updates-cache';

export const runtime = 'nodejs';

// 强制动态渲染，避免在构建时预生成
export const dynamic = 'force-dynamic';
export const revalidate = 0;

// 添加全局锁避免并发执行
let isRunning = false;

export async function GET(_request: NextRequest) {
  if (isRunning) {
    return NextResponse.json({
      success: false,
      message: 'Cron job already running',
      timestamp: new Date().toISOString(),
    });
  }

  try {
    isRunning = true;

    await cronJob();

    return NextResponse.json({
      success: true,
      message: 'Cron job executed successfully',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Cron job failed:', error);

    return NextResponse.json(
      {
        success: false,
        message: 'Cron job failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    );
  } finally {
    isRunning = false;
  }
}

async function cronJob() {
  // 优先执行用户清理任务，避免被其他任务阻塞
  try {
    await cleanupInactiveUsers();
  } catch (err) {
    console.error('❌ 用户清理任务失败:', err);
  }

  try {
    await refreshConfig();
  } catch (err) {
    console.error('❌ 配置刷新失败:', err);
  }

  try {
    await refreshAllLiveChannels();
  } catch (err) {
    console.error('❌ 直播频道刷新失败:', err);
  }

  try {
    await refreshRecordsFavoritesAndWatchingUpdates();
  } catch (err) {
    console.error('❌ 播放记录、收藏和追更提醒缓存刷新失败:', err);
  }
}

async function refreshAllLiveChannels() {
  const config = await getConfig();
  const _result = await refreshEnabledLiveChannels(config);
  await db.saveAdminConfig(config);
}

async function refreshConfig() {
  let config = await getConfig();
  if (
    config &&
    config.ConfigSubscribtion &&
    config.ConfigSubscribtion.URL &&
    config.ConfigSubscribtion.AutoUpdate
  ) {
    try {
      const decodedContent = await fetchDecodedConfigSubscription(
        config.ConfigSubscribtion.URL,
      );

      try {
        JSON.parse(decodedContent);
      } catch (e) {
        throw new Error('配置文件格式错误，请检查 JSON 语法');
      }
      config.ConfigFile = decodedContent;
      config.ConfigSubscribtion.LastCheck = new Date().toISOString();
      config = refineConfig(config);
      await db.saveAdminConfig(config);
    } catch (e) {
      console.error('刷新配置失败:', e);
    }
  }
}

function createSharedDetailResolver(): VideoDetailResolver {
  const detailCache = new Map<string, Promise<SearchResult | null>>();

  return async (
    source: string,
    id: string,
    fallbackTitle: string,
  ): Promise<SearchResult | null> => {
    const key = `${source}+${id}`;
    let promise = detailCache.get(key);
    if (!promise) {
      promise = fetchVideoDetail({
        source,
        id,
        fallbackTitle: fallbackTitle.trim(),
      })
        .then((detail) => {
          const successPromise = Promise.resolve(detail);
          detailCache.set(key, successPromise);
          return detail;
        })
        .catch((err) => {
          console.error(`获取视频详情失败 (${source}+${id}):`, err);
          return null;
        });
    }
    return promise;
  };
}

function applyDetailToPlayRecord(
  record: PlayRecord,
  detail: SearchResult,
): PlayRecord {
  const episodeCount = detail.episodes?.length || 0;
  if (episodeCount <= 0 || episodeCount === record.total_episodes) {
    return record;
  }

  return {
    title: detail.title || record.title,
    source_name: record.source_name,
    cover: detail.poster || record.cover,
    index: record.index,
    total_episodes: episodeCount,
    play_time: record.play_time,
    year: detail.year || record.year,
    douban_id: detail.douban_id || record.douban_id,
    total_time: record.total_time,
    save_time: record.save_time,
    search_title: record.search_title,
    original_episodes: record.original_episodes,
    remarks: record.remarks,
  };
}

function applyDetailToFavorite(fav: Favorite, detail: SearchResult): Favorite {
  const episodeCount = detail.episodes?.length || 0;
  if (episodeCount <= 0 || episodeCount === fav.total_episodes) {
    return fav;
  }

  return {
    title: detail.title || fav.title,
    source_name: fav.source_name,
    cover: detail.poster || fav.cover,
    year: detail.year || fav.year,
    total_episodes: episodeCount,
    save_time: fav.save_time,
    search_title: fav.search_title,
    origin: fav.origin,
  };
}

async function refreshRecordsFavoritesAndWatchingUpdates() {
  try {
    const users = await db.getAllUsers();

    if (process.env.USERNAME && !users.includes(process.env.USERNAME)) {
      users.push(process.env.USERNAME);
    }

    const getDetail = createSharedDetailResolver();

    const skippedUsers: string[] = [];
    const failedUsers: string[] = [];

    for (const user of users) {
      // 检查用户是否真的存在
      const userExists = await db.checkUserExist(user);
      if (!userExists) {
        skippedUsers.push(user);
        continue;
      }

      let latestPlayRecords: Record<string, PlayRecord> | null = null;

      // 播放记录
      try {
        const playRecords = await db.getAllPlayRecords(user);
        latestPlayRecords = { ...playRecords };
        const _totalRecords = Object.keys(playRecords).length;

        for (const [key, record] of Object.entries(playRecords)) {
          try {
            const parsedKey = parseStorageKey(key);
            if (!parsedKey) {
              console.warn(`跳过无效的播放记录键: ${key}`);
              continue;
            }
            const { source, id } = parsedKey;

            const detail = await getDetail(source, id, record.title);
            if (!detail) {
              console.warn(`跳过无法获取详情的播放记录: ${key}`);
              continue;
            }

            const nextRecord = applyDetailToPlayRecord(record, detail);
            latestPlayRecords[key] = nextRecord;

            if (nextRecord !== record) {
              await db.savePlayRecord(user, source, id, nextRecord);
            }
          } catch (err) {
            console.error(`处理播放记录失败 (${key}):`, err);
            // 继续处理下一个记录
          }
        }
      } catch (err) {
        console.error(`获取用户播放记录失败 (${user}):`, err);
      }

      if (latestPlayRecords) {
        try {
          const updates = await buildWatchingUpdatesFromRecordsWithDetails(
            latestPlayRecords,
            Date.now(),
            getDetail,
          );
          await saveWatchingUpdatesForUser(user, updates);
        } catch (error) {
          failedUsers.push(user);
          console.error(`刷新追更提醒缓存失败 (${user}):`, error);
        }
      } else {
        failedUsers.push(user);
      }

      // 收藏
      try {
        let favorites = await db.getAllFavorites(user);
        favorites = Object.fromEntries(
          Object.entries(favorites).filter(([_, fav]) => fav.origin !== 'live'),
        );
        const _totalFavorites = Object.keys(favorites).length;

        for (const [key, fav] of Object.entries(favorites)) {
          try {
            const parsedKey = parseStorageKey(key);
            if (!parsedKey) {
              console.warn(`跳过无效的收藏键: ${key}`);
              continue;
            }
            const { source, id } = parsedKey;

            const favDetail = await getDetail(source, id, fav.title);
            if (!favDetail) {
              console.warn(`跳过无法获取详情的收藏: ${key}`);
              continue;
            }

            const nextFavorite = applyDetailToFavorite(fav, favDetail);

            if (nextFavorite !== fav) {
              await db.saveFavorite(user, source, id, nextFavorite);
            }
          } catch (err) {
            console.error(`处理收藏失败 (${key}):`, err);
            // 继续处理下一个收藏
          }
        }
      } catch (err) {
        console.error(`获取用户收藏失败 (${user}):`, err);
      }
    }
  } catch (err) {
    console.error('刷新播放记录/收藏/追更提醒缓存任务启动失败', err);
  }
}

async function cleanupInactiveUsers() {
  try {
    const config = await getConfig();

    // 清理策略：基于登入时间而不是播放记录
    // 删除条件：注册时间 >= X天 且 (从未登入 或 最后登入时间 >= X天)

    // 预热 Redis 连接，避免冷启动
    try {
      await db.getAllUsers();
    } catch (warmupErr) {
      console.warn('⚠️ 数据库连接预热失败:', warmupErr);
    }

    // 检查是否启用自动清理功能
    const autoCleanupEnabled =
      config.UserConfig?.AutoCleanupInactiveUsers ?? false;
    const inactiveUserDays = config.UserConfig?.InactiveUserDays ?? 7;

    if (!autoCleanupEnabled) {
      return;
    }

    const allUsers = config.UserConfig.Users;

    const envUsername = process.env.USERNAME;

    const cutoffTime = Date.now() - inactiveUserDays * 24 * 60 * 60 * 1000;

    let deletedCount = 0;

    for (const user of allUsers) {
      try {
        // 跳过管理员和owner用户
        if (user.role === 'admin' || user.role === 'owner') {
          continue;
        }

        // 跳过环境变量中的用户
        if (user.username === envUsername) {
          continue;
        }

        const userCreatedAt = user.createdAt || Date.now(); // 如果没有创建时间，使用当前时间（不会被删除）

        // 先基于时间进行预筛选，避免不必要的数据库调用
        const isOldEnough = userCreatedAt < cutoffTime;

        if (!isOldEnough) {
          continue;
        }

        // 只对时间符合的用户进行数据库检查
        let userExists = true;
        try {
          userExists = (await Promise.race([
            db.checkUserExist(user.username),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error('checkUserExist超时')), 5000),
            ),
          ])) as boolean;
        } catch (err) {
          console.error(`  ❌ 检查用户存在状态失败: ${err}, 跳过该用户`);
          continue;
        }

        if (!userExists) {
          continue;
        }

        // 获取用户统计信息（5秒超时）
        let userStats;
        try {
          userStats = (await Promise.race([
            db.getUserPlayStat(user.username),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error('getUserPlayStat超时')), 5000),
            ),
          ])) as {
            lastLoginTime?: number;
            firstLoginTime?: number;
            loginCount?: number;
            [key: string]: any;
          };
        } catch (err) {
          console.error(`  ❌ 获取用户统计失败: ${err}, 跳过该用户`);
          continue;
        }

        // 检查是否满足删除条件：基于登入时间而不是播放记录
        const lastLoginTime =
          userStats.lastLoginTime ||
          userStats.lastLoginDate ||
          userStats.firstLoginTime ||
          0;
        const hasNeverLoggedIn =
          lastLoginTime === 0 || (userStats.loginCount || 0) === 0;
        const loginTooOld = lastLoginTime > 0 && lastLoginTime < cutoffTime;

        // 删除条件：注册时间够久 且 (从未登入 或 最后登入时间超过阈值)
        const shouldDelete = isOldEnough && (hasNeverLoggedIn || loginTooOld);

        if (shouldDelete) {
          const _deleteReason = hasNeverLoggedIn
            ? '从未登入'
            : `最后登入时间过久: ${new Date(lastLoginTime).toISOString()}`;

          // 从数据库删除用户数据
          await db.deleteUser(user.username);

          // 从配置中移除用户
          const userIndex = config.UserConfig.Users.findIndex(
            (u) => u.username === user.username,
          );
          if (userIndex !== -1) {
            config.UserConfig.Users.splice(userIndex, 1);
          }

          deletedCount++;
        } else {
          let _reason;
          if (!isOldEnough) {
            _reason = `注册时间不足${inactiveUserDays}天`;
          } else if (!hasNeverLoggedIn && !loginTooOld) {
            _reason = `最近有登入活动 (最后登入: ${
              lastLoginTime > 0 ? new Date(lastLoginTime).toISOString() : '未知'
            })`;
          } else {
            _reason = '其他原因';
          }
        }
      } catch (err) {
        console.error(`❌ 处理用户 ${user.username} 时出错:`, err);
      }
    }

    // 如果有删除操作，保存更新后的配置
    if (deletedCount > 0) {
      await db.saveAdminConfig(config);
    }
  } catch (err) {
    console.error('🚫 清理非活跃用户任务失败:', err);
  }
}
