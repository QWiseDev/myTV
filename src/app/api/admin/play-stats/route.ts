import { NextRequest, NextResponse } from 'next/server';

import { requireAdmin } from '@/lib/admin-auth';
import { db } from '@/lib/db';
import {
  aggregatePlayStats,
  PlayStatsUserInput,
} from '@/lib/play-stats-shared';
import { PlayRecord, UserPlayStat } from '@/lib/types';

// 导出类型供页面组件使用
export type { PlayStatsResult } from '@/lib/types';

export const runtime = 'nodejs';

// 强制动态渲染，避免在构建时预生成
export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if ('response' in admin) return admin.response;

  try {
    const config = admin.config;
    const allUsers = config.UserConfig.Users;
    const PROJECT_START_DATE = new Date('2025-09-14').getTime();

    // 分批并行收集每个用户的统计数据与全量播放记录（组合读取，每用户 1 次 RTT）
    const USER_DATA_BATCH_SIZE = 8;
    const userDatas: PlayStatsUserInput[] = [];

    for (let i = 0; i < allUsers.length; i += USER_DATA_BATCH_SIZE) {
      const batch = allUsers.slice(i, i + USER_DATA_BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map(async (user) => {
          let userPlayStat: UserPlayStat | null = null;
          let records: PlayRecord[] = [];
          try {
            const combined = await db.getUserPlayStatWithRecords(user.username);
            userPlayStat = combined.stat;
            records = combined.records;
          } catch {
            // 读取失败时按空统计兜底
          }
          return {
            username: user.username,
            createdAt: user.createdAt || PROJECT_START_DATE,
            records,
            loginStats: userPlayStat,
          };
        }),
      );
      userDatas.push(...batchResults);
    }

    const result = aggregatePlayStats(userDatas);

    return NextResponse.json(result, {
      headers: {
        'Cache-Control': 'no-store', // 不缓存，确保数据实时性
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: '获取播放统计失败',
        details: (error as Error).message,
      },
      { status: 500 },
    );
  }
}
