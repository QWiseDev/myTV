/* eslint-disable no-console,@typescript-eslint/no-explicit-any */

import { NextRequest, NextResponse } from 'next/server';

import { getAdultApiSites, getConfig, refineConfig } from '@/lib/config';
import { fetchDecodedConfigSubscription } from '@/lib/config-subscription';
import { verifyCronAuth } from '@/lib/cron-auth';
import { db } from '@/lib/db';
import { getGuestSource } from '@/lib/guest-source';
import { refreshEnabledLiveChannels } from '@/lib/live';
import { withAbortableTimeout } from '@/lib/promise-timeout';
import {
  type SourceWarmTarget,
  warmSourceBrowserSources,
} from '@/lib/source-browser.server';

export const runtime = 'nodejs';

// 强制动态渲染，避免在构建时预生成
// 添加全局锁避免并发执行
let isRunning = false;

export async function GET(request: NextRequest) {
  const auth = verifyCronAuth(request);
  if (!auth.ok) {
    console.warn(`已拦截未授权的 cron 调用: ${auth.message}`);
    return NextResponse.json(
      { success: false, message: auth.message },
      { status: auth.status },
    );
  }

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

  // 片源库预热与直播频道测速并行，避免被直播频道批量探测阻塞
  await Promise.allSettled([
    warmSourceBrowserCache().catch((err) => {
      console.error('❌ 片源库缓存预热失败:', err);
    }),
    refreshAllLiveChannels().catch((err) => {
      console.error('❌ 直播频道刷新失败:', err);
    }),
  ]);

  // 播放记录/收藏/追更提醒的刷新已改为按用户触发：
  // 用户进首页经 /api/watching-updates?force=1 按需刷新（30 分钟节流），
  // 定时全量拉取已移除，避免为不活跃用户空转打源站。
}

async function warmSourceBrowserCache() {
  const [adultSites, guestSource] = await Promise.all([
    getAdultApiSites(),
    getGuestSource(),
  ]);
  const targets: SourceWarmTarget[] = adultSites.map((source) => ({
    source,
    isAdult: true,
  }));
  if (guestSource) {
    targets.push({ source: guestSource, isAdult: false });
  }
  if (targets.length === 0) return;
  await warmSourceBrowserSources(targets);
}

async function refreshAllLiveChannels() {
  const config = await getConfig();
  await refreshEnabledLiveChannels(config);
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
          userExists = (await withAbortableTimeout(
            async () => db.checkUserExist(user.username),
            5000,
          )) as boolean;
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
          userStats = (await withAbortableTimeout(
            async () => db.getUserPlayStat(user.username),
            5000,
          )) as {
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
