import { NextRequest, NextResponse } from 'next/server';

import { getCacheTime, getConfig } from '@/lib/config';
import {
  authenticateSearchRequest,
  normalizeSearchQuery,
  resolveSearchSites,
  runAggregatedSearch,
} from '@/lib/search-service';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const auth = await authenticateSearchRequest(request);
  if ('response' in auth) return auth.response;

  const { searchParams } = new URL(request.url);
  const query = normalizeSearchQuery(searchParams.get('q'));
  const group = searchParams.get('group');
  const forSource = searchParams.get('forSource') || '';

  if (!query) {
    const cacheTime = await getCacheTime();
    return NextResponse.json(
      { results: [] },
      {
        headers: {
          'Cache-Control': `private, max-age=${cacheTime}`,
        },
      },
    );
  }

  try {
    const config = await getConfig();
    const { isAdultSearch, apiSites } = await resolveSearchSites({
      username: auth.username,
      config,
      group,
      forSource,
    });

    const { results, earlyReturned } = await runAggregatedSearch(
      apiSites,
      query,
      {
        isAdultSearch,
        disableYellowFilter: config.SiteConfig.DisableYellowFilter,
      },
    );

    if (results.length === 0) {
      return NextResponse.json({ results: [] }, { status: 200 });
    }

    const cacheTime = await getCacheTime();
    // 软截止早退响应采用短 max-age（15s），待后台慢源回填缓存后很快即可拿到完整全集结果
    const effectiveCacheTime = earlyReturned
      ? Math.min(cacheTime, 15)
      : cacheTime;
    const headers: Record<string, string> =
      isAdultSearch || Boolean(forSource)
        ? { 'Cache-Control': 'private, no-store' }
        : {
            'Cache-Control': `private, max-age=${effectiveCacheTime}`,
          };

    return NextResponse.json({ results }, { headers });
  } catch {
    return NextResponse.json({ error: '搜索失败' }, { status: 500 });
  }
}
