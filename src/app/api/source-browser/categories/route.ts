import { NextRequest, NextResponse } from 'next/server';

import { resolveRequestUser } from '@/lib/auth';
import {
  checkGuestRateLimit,
  isSourceAllowedForRequest,
} from '@/lib/guest-source';
import {
  fetchSourceCategories,
  SourceUpstreamError,
} from '@/lib/source-browser.server';

export const runtime = 'nodejs';

// 强制动态渲染，避免在构建时预生成
export async function GET(request: NextRequest) {
  const user = await resolveRequestUser(request);
  if (!user) {
    const rateLimited = checkGuestRateLimit(request, 'categories');
    if (rateLimited) return rateLimited;
  }

  const { searchParams } = new URL(request.url);
  const sourceKey = searchParams.get('source');

  if (!sourceKey) {
    return NextResponse.json({ error: '缺少 source 参数' }, { status: 400 });
  }

  try {
    const source = await isSourceAllowedForRequest(
      user?.username ?? null,
      sourceKey,
    );
    if (!source) {
      return NextResponse.json(
        { error: user ? '你没有权限访问该资源源' : '访客仅可访问指定片源' },
        { status: 403 },
      );
    }

    const categories = await fetchSourceCategories(source);

    return NextResponse.json(
      { categories },
      !user
        ? {
            headers: {
              'Cache-Control': 'public, max-age=300, s-maxage=300',
            },
          }
        : undefined,
    );
  } catch (error: unknown) {
    if (error instanceof SourceUpstreamError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    if (error instanceof Error && error.name === 'AbortError') {
      return NextResponse.json({ error: '请求超时' }, { status: 408 });
    }
    return NextResponse.json({ error: '获取分类失败' }, { status: 500 });
  }
}
