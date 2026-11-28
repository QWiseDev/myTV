import { NextRequest, NextResponse } from 'next/server';

import { getAvailableApiSites } from '@/lib/config';
import { authenticateSearchRequest } from '@/lib/search-service';

export const runtime = 'nodejs';

// OrionTV 兼容接口
export async function GET(request: NextRequest) {
  const auth = await authenticateSearchRequest(request);
  if ('response' in auth) return auth.response;

  try {
    const apiSites = await getAvailableApiSites(auth.username);
    return NextResponse.json(apiSites, {
      headers: {
        'Cache-Control': 'private, no-store',
      },
    });
  } catch {
    return NextResponse.json({ error: '获取资源失败' }, { status: 500 });
  }
}
