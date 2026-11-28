import { NextRequest, NextResponse } from 'next/server';

import { getAvailableApiSites, getCacheTime, getConfig } from '@/lib/config';
import {
  authenticateSearchRequest,
  executeSingleSiteSearch,
  filterSearchResults,
  normalizeSearchQuery,
} from '@/lib/search-service';

export const runtime = 'nodejs';

// OrionTV 兼容接口
export async function GET(request: NextRequest) {
  const auth = await authenticateSearchRequest(request);
  if ('response' in auth) return auth.response;

  const { searchParams } = new URL(request.url);
  const query = normalizeSearchQuery(searchParams.get('q'));
  const resourceId = (searchParams.get('resourceId') || '').trim();

  if (!query || !resourceId) {
    return NextResponse.json(
      { result: null, error: '缺少必要参数: q 或 resourceId' },
      {
        status: 400,
        headers: {
          'Cache-Control': 'private, no-store',
        },
      },
    );
  }

  try {
    const [config, apiSites] = await Promise.all([
      getConfig(),
      getAvailableApiSites(auth.username),
    ]);

    const targetSite = apiSites.find((site) => site.key === resourceId);
    if (!targetSite) {
      return NextResponse.json(
        {
          error: `未找到指定的视频源: ${resourceId}`,
          result: null,
        },
        { status: 404 },
      );
    }

    const { results } = await executeSingleSiteSearch(targetSite, query);
    const exactMatches = filterSearchResults(
      results.filter((r) => r.title === query),
      { disableYellowFilter: config.SiteConfig.DisableYellowFilter },
    );

    if (exactMatches.length === 0) {
      return NextResponse.json(
        {
          error: '未找到结果',
          result: null,
        },
        { status: 404 },
      );
    }

    const cacheTime = await getCacheTime();
    return NextResponse.json(
      { results: exactMatches },
      {
        headers: {
          'Cache-Control': `private, max-age=${cacheTime}`,
        },
      },
    );
  } catch {
    return NextResponse.json(
      {
        error: '搜索失败',
        result: null,
      },
      { status: 500 },
    );
  }
}
