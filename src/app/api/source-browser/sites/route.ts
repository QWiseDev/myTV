import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { getAvailableApiSites } from '@/lib/config';

export const runtime = 'nodejs';


// 强制动态渲染，避免在构建时预生成
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export async function GET(request: NextRequest) {
  try {
    const authInfo = getAuthInfoFromCookie(request);
    if (!authInfo || !authInfo.username) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const availableSites = await getAvailableApiSites(authInfo.username);
    const sources = availableSites
      .filter((s) => Boolean(s.api?.trim()))
      .map((s) => ({ key: s.key, name: s.name, api: s.api }));

    return NextResponse.json({ sources });
  } catch (error) {
    return NextResponse.json({ error: '获取源列表失败' }, { status: 500 });
  }
}
