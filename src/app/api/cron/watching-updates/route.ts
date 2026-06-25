import { NextRequest, NextResponse } from 'next/server';

import { db } from '@/lib/db';
import { rebuildWatchingUpdatesForUser } from '@/lib/watching-updates-cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

let isRunning = false;

export async function GET(_request: NextRequest) {

  if (isRunning) {
    return NextResponse.json({
      success: false,
      message: 'Watching updates cron already running',
      timestamp: new Date().toISOString(),
    });
  }

  try {
    isRunning = true;

    const users = await db.getAllUsers();
    if (process.env.USERNAME && !users.includes(process.env.USERNAME)) {
      users.push(process.env.USERNAME);
    }

    let successCount = 0;
    let failedCount = 0;
    const skippedUsers: string[] = [];
    const failedUsers: string[] = [];

    for (const user of users) {
      try {
        const userExists = await db.checkUserExist(user);
        if (!userExists) {
          skippedUsers.push(user);
          continue;
        }

        await rebuildWatchingUpdatesForUser(user);
        successCount += 1;
      } catch (error) {
        failedCount += 1;
        failedUsers.push(user);
        console.error(`刷新追更提醒缓存失败 (${user}):`, error);
      }
    }

    return NextResponse.json({
      success: failedCount === 0,
      message: 'Watching updates cron executed',
      timestamp: new Date().toISOString(),
      stats: {
        totalUsers: users.length,
        successCount,
        failedCount,
        skippedCount: skippedUsers.length,
      },
      skippedUsers,
      failedUsers,
    });
  } catch (error) {
    console.error('Watching updates cron failed:', error);

    return NextResponse.json(
      {
        success: false,
        message: 'Watching updates cron failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  } finally {
    isRunning = false;
  }
}

