import { NextRequest, NextResponse } from 'next/server';

import { requireUser } from '@/lib/auth';
import { ensureUserAccessOrResponse } from '@/lib/user-access';
import {
  getCachedWatchingUpdatesForUser,
  rebuildWatchingUpdatesForUser,
  releaseWatchingUpdatesRefreshSlot,
  tryAcquireWatchingUpdatesRefreshSlot,
} from '@/lib/watching-updates-cache';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const auth = requireUser(request);
    if (!auth.authInfo) return auth.response;
    const authInfo = auth.authInfo;

    const guardResult = await ensureUserAccessOrResponse(authInfo.username);
    if ('response' in guardResult) {
      return guardResult.response;
    }

    const { searchParams } = new URL(request.url);
    const wantsRefresh =
      searchParams.get('force') === '1' || searchParams.get('force') === 'true';

    const username = authInfo.username;
    let updates = await getCachedWatchingUpdatesForUser(username);

    if (!updates) {
      // 缓存缺失（过期或被失效）时始终重建，不受节流限制
      updates = await rebuildWatchingUpdatesForUser(username);
    } else if (
      wantsRefresh &&
      (await tryAcquireWatchingUpdatesRefreshSlot(username))
    ) {
      try {
        updates = await rebuildWatchingUpdatesForUser(username);
      } catch (error) {
        // 释放节流槽位，让下次请求可以重试重建
        await releaseWatchingUpdatesRefreshSlot(username);
        throw error;
      }
    }

    return NextResponse.json(updates, {
      status: 200,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
        Pragma: 'no-cache',
        Expires: '0',
      },
    });
  } catch (error) {
    console.error('获取追更提醒缓存失败:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 },
    );
  }
}
