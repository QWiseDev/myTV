import { NextRequest, NextResponse } from 'next/server';

import { requireUser } from '@/lib/auth';
import { getAvailableApiSites, getCacheTime, getConfig } from '@/lib/config';
import { searchFromApi } from '@/lib/downstream';
import { ensureUserAccessOrResponse } from '@/lib/user-access';
import { yellowWords } from '@/lib/yellow';

export const runtime = 'nodejs';

// 强制动态渲染，避免在构建时预生成
// OrionTV 兼容接口
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

  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');
  const resourceId = searchParams.get('resourceId');

  if (!query || !resourceId) {
    const cacheTime = await getCacheTime();
    return NextResponse.json(
      { result: null, error: '缺少必要参数: q 或 resourceId' },
      {
        headers: {
          'Cache-Control': `private, max-age=${cacheTime}`,
        },
      },
    );
  }

  const config = await getConfig();
  const apiSites = await getAvailableApiSites(authInfo.username);

  try {
    // 根据 resourceId 查找对应的 API 站点
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

    const results = await searchFromApi(targetSite, query);
    let result = results.filter((r) => r.title === query);
    if (!config.SiteConfig.DisableYellowFilter) {
      result = result.filter((result) => {
        const typeName = result.type_name || '';
        return !yellowWords.some((word: string) => typeName.includes(word));
      });
    }
    const cacheTime = await getCacheTime();

    if (result.length === 0) {
      return NextResponse.json(
        {
          error: '未找到结果',
          result: null,
        },
        { status: 404 },
      );
    } else {
      return NextResponse.json(
        { results: result },
        {
          headers: {
            'Cache-Control': `private, max-age=${cacheTime}`,
          },
        },
      );
    }
  } catch (error) {
    return NextResponse.json(
      {
        error: '搜索失败',
        result: null,
      },
      { status: 500 },
    );
  }
}
