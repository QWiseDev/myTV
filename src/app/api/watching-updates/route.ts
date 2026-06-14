import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { ensureUserAccessOrResponse } from '@/lib/user-access';
import {
  getCachedWatchingUpdatesForUser,
  rebuildWatchingUpdatesForUser,
} from '@/lib/watching-updates-cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  try {
    const authInfo = getAuthInfoFromCookie(request);
    if (!authInfo?.username) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const guardResult = await ensureUserAccessOrResponse(authInfo.username);
    if ('response' in guardResult) {
      return guardResult.response;
    }

    const { searchParams } = new URL(request.url);
    const forceRebuild =
      searchParams.get('force') === '1' ||
      searchParams.get('force') === 'true';

    let updates = forceRebuild
      ? null
      : await getCachedWatchingUpdatesForUser(authInfo.username);

    if (!updates) {
      updates = await rebuildWatchingUpdatesForUser(authInfo.username);
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
      { status: 500 }
    );
  }
}
