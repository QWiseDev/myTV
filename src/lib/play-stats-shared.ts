import { toDateKey } from './date-utils';
import { PlayRecord, PlayStatsResult } from './types';

export interface PlayStatsUserInput {
  username: string;
  records: PlayRecord[];
  createdAt?: number;
  loginStats?: {
    loginCount?: number;
    firstLoginTime?: number;
    lastLoginTime?: number;
    lastLoginDate?: number;
    firstWatchDate?: number;
  } | null;
}

const DEFAULT_PROJECT_START_DATE = new Date('2025-09-14').getTime();
const DAY_MS = 24 * 60 * 60 * 1000;

function computeNaturalRegistrationDays(
  createdAt: number,
  now: number,
): number {
  const firstDate = new Date(createdAt);
  const currentDate = new Date(now);
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
  return Math.max(
    1,
    Math.floor((currentDay.getTime() - firstDay.getTime()) / DAY_MS) + 1,
  );
}

/**
 * 统一计算全站播放与用户活跃度统计，供 Redis / Upstash / 管理端路由复用。
 */
export function aggregatePlayStats(
  users: PlayStatsUserInput[],
  now = Date.now(),
): PlayStatsResult {
  const todayStartDate = new Date(now);
  const todayStart = new Date(
    todayStartDate.getFullYear(),
    todayStartDate.getMonth(),
    todayStartDate.getDate(),
  ).getTime();
  const sevenDaysAgo = now - 7 * DAY_MS;

  const userStats: PlayStatsResult['userStats'] = [];
  let totalWatchTime = 0;
  let totalPlays = 0;
  const sourceCount: Record<string, number> = {};
  const dailyData: Record<string, { watchTime: number; plays: number }> = {};
  const registrationData: Record<string, number> = {};
  let todayNewUsers = 0;

  for (const user of users) {
    const records = Array.isArray(user.records) ? user.records : [];
    let earliestRecordTime = Infinity;
    let userLastPlayTime = 0;
    let userWatchTime = 0;
    const userSourceCount: Record<string, number> = {};

    for (const record of records) {
      const watchTime = record.play_time || 0;
      const saveTime = record.save_time || 0;
      userWatchTime += watchTime;

      if (saveTime > userLastPlayTime) {
        userLastPlayTime = saveTime;
      }
      if (saveTime > 0 && saveTime < earliestRecordTime) {
        earliestRecordTime = saveTime;
      }

      const sourceName = record.source_name || '未知来源';
      userSourceCount[sourceName] = (userSourceCount[sourceName] || 0) + 1;
      sourceCount[sourceName] = (sourceCount[sourceName] || 0) + 1;

      if (saveTime >= sevenDaysAgo) {
        const dateKey = toDateKey(saveTime);
        if (!dailyData[dateKey]) {
          dailyData[dateKey] = { watchTime: 0, plays: 0 };
        }
        dailyData[dateKey].watchTime += watchTime;
        dailyData[dateKey].plays += 1;
      }
    }

    const fallbackCreated =
      Number.isFinite(earliestRecordTime) &&
      earliestRecordTime < DEFAULT_PROJECT_START_DATE
        ? earliestRecordTime
        : user.loginStats?.firstWatchDate || DEFAULT_PROJECT_START_DATE;

    const userCreatedAt = user.createdAt || fallbackCreated;
    const registrationDays = computeNaturalRegistrationDays(userCreatedAt, now);

    if (userCreatedAt >= todayStart) {
      todayNewUsers++;
    }
    if (userCreatedAt >= sevenDaysAgo) {
      const regDate = toDateKey(userCreatedAt);
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

    const recentRecords = [...records]
      .sort((a, b) => (b.save_time || 0) - (a.save_time || 0))
      .slice(0, 10);

    const lastLoginTime =
      user.loginStats?.lastLoginTime ||
      user.loginStats?.lastLoginDate ||
      user.loginStats?.firstLoginTime ||
      (records.length > 0 ? userLastPlayTime : 0) ||
      userCreatedAt;

    const loginCount = user.loginStats?.loginCount || 0;

    userStats.push({
      username: user.username,
      totalWatchTime: userWatchTime,
      totalPlays: records.length,
      lastPlayTime: userLastPlayTime,
      recentRecords,
      avgWatchTime: records.length > 0 ? userWatchTime / records.length : 0,
      mostWatchedSource,
      registrationDays,
      lastLoginTime,
      loginCount,
      createdAt: userCreatedAt,
    });

    totalWatchTime += userWatchTime;
    totalPlays += records.length;
  }

  userStats.sort((a, b) => b.totalWatchTime - a.totalWatchTime);

  const topSources = Object.entries(sourceCount)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([source, count]) => ({ source, count }));

  const dailyStats: PlayStatsResult['dailyStats'] = [];
  for (let i = 6; i >= 0; i--) {
    const dateKey = toDateKey(now - i * DAY_MS);
    const data = dailyData[dateKey] || { watchTime: 0, plays: 0 };
    dailyStats.push({
      date: dateKey,
      watchTime: data.watchTime,
      plays: data.plays,
    });
  }

  const registrationTrend: PlayStatsResult['registrationStats']['registrationTrend'] =
    [];
  for (let i = 6; i >= 0; i--) {
    const dateKey = toDateKey(now - i * DAY_MS);
    registrationTrend.push({
      date: dateKey,
      newUsers: registrationData[dateKey] || 0,
    });
  }

  const oneDayAgo = now - DAY_MS;
  const thirtyDaysAgo = now - 30 * DAY_MS;

  const activeUsers = {
    daily: userStats.filter((user) => user.lastLoginTime >= oneDayAgo).length,
    weekly: userStats.filter((user) => user.lastLoginTime >= sevenDaysAgo)
      .length,
    monthly: userStats.filter((user) => user.lastLoginTime >= thirtyDaysAgo)
      .length,
  };

  return {
    totalUsers: users.length,
    totalWatchTime,
    totalPlays,
    avgWatchTimePerUser: users.length > 0 ? totalWatchTime / users.length : 0,
    avgPlaysPerUser: users.length > 0 ? totalPlays / users.length : 0,
    userStats,
    topSources,
    dailyStats,
    registrationStats: {
      todayNewUsers,
      totalRegisteredUsers: users.length,
      registrationTrend,
    },
    activeUsers,
  };
}
