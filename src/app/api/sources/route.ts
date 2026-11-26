import { NextRequest, NextResponse } from 'next/server';

import { requireUser } from '@/lib/auth';
import { getAvailableApiSites } from '@/lib/config';
import { ensureUserAccessOrResponse } from '@/lib/user-access';

export const runtime = 'nodejs';

// 强制动态渲染，避免在构建时预生成
export async function GET(request: NextRequest) {
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

    // 只返回必要的字段，避免敏感信息泄露
    const sources = apiSites.map((site) => ({
      key: site.key,
      name: site.name,
    }));

    return NextResponse.json(sources, {
      headers: {
        'Cache-Control': 'private, max-age=300', // 5分钟私有缓存
      },
    });
  } catch (error) {
    console.error('获取数据源列表失败:', error);
    return NextResponse.json({ error: '获取数据源列表失败' }, { status: 500 });
  }
}
