/* eslint-disable no-console */

import { NextRequest, NextResponse } from 'next/server';

import { requireUser } from '@/lib/auth';
import { getAvailableApiSites } from '@/lib/config';
import { ensureUserAccessOrResponse } from '@/lib/user-access';

export const runtime = 'nodejs';

// 强制动态渲染，避免在构建时预生成
// OrionTV 兼容接口
export async function GET(request: NextRequest) {
  // 添加用户认证检查
  const auth = await requireUser(request);
  if (!auth.authInfo) return auth.response;
  const authInfo = auth.authInfo;

  const guardResult = await ensureUserAccessOrResponse(
    authInfo.username,
    authInfo.timestamp,
  );
  if ('response' in guardResult) {
    return guardResult.response;
  }

  try {
    const apiSites = await getAvailableApiSites(authInfo.username);

    return NextResponse.json(apiSites, {
      headers: {
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    return NextResponse.json({ error: '获取资源失败' }, { status: 500 });
  }
}
