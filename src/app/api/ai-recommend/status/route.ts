import { NextRequest, NextResponse } from 'next/server';

import { requireUser } from '@/lib/auth';
import { getConfig, hasSpecialFeaturePermission } from '@/lib/config';
import { ensureUserAccessOrResponse } from '@/lib/user-access';

export const runtime = 'nodejs';
export async function GET(request: NextRequest) {
  const auth = await requireUser(request);
  if (!auth.authInfo) {
    return NextResponse.json({ enabled: false }, { status: 401 });
  }
  const guardResult = await ensureUserAccessOrResponse(
    auth.authInfo.username,
    auth.authInfo.timestamp,
  );
  if ('response' in guardResult) {
    return NextResponse.json({ enabled: false }, { status: 401 });
  }

  const config = await getConfig();
  const hasPermission = await hasSpecialFeaturePermission(
    auth.authInfo.username,
    'ai-recommend',
    config,
  );
  const aiConfig = config.AIRecommendConfig;

  return NextResponse.json(
    {
      enabled: Boolean(
        hasPermission &&
        aiConfig?.enabled &&
        aiConfig.apiKey &&
        aiConfig.apiUrl,
      ),
    },
    {
      headers: {
        'Cache-Control': 'private, max-age=300',
      },
    },
  );
}
