import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { getConfig, hasSpecialFeaturePermission } from '@/lib/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const authInfo = getAuthInfoFromCookie(request);
  if (!authInfo?.username) {
    return NextResponse.json({ enabled: false }, { status: 401 });
  }

  const config = await getConfig();
  const hasPermission = await hasSpecialFeaturePermission(
    authInfo.username,
    'ai-recommend',
    config
  );
  const aiConfig = config.AIRecommendConfig;

  return NextResponse.json(
    {
      enabled: Boolean(
        hasPermission && aiConfig?.enabled && aiConfig.apiKey && aiConfig.apiUrl
      ),
    },
    {
      headers: {
        'Cache-Control': 'private, max-age=300',
      },
    }
  );
}
