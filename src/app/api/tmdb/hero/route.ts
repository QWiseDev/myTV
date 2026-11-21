import { NextRequest, NextResponse } from 'next/server';

import { getTMDBHeroInfoByTitle, isTMDBEnabled } from '@/lib/tmdb.client';

const MAX_TITLES = 8;

export const runtime = 'nodejs';

// 强制动态渲染，避免在构建时预生成
/**
 * 首页 Banner 增强信息批量查询：?title=xx&year=xx&title=yy...
 * 返回 { info: { [title]: TMDBHeroInfo | null } }（横图/简介/主演/导演/类型）
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const titles = searchParams.getAll('title').slice(0, MAX_TITLES);
  // 客户端每个 title 都会配一个 year（无年份传空串），保证两者按下标对齐
  const years = searchParams.getAll('year');
  const yearsAligned = years.length === searchParams.getAll('title').length;

  if (titles.length === 0 || titles.some((title) => !title.trim())) {
    return NextResponse.json(
      { error: '缺少必要参数: title（可重复传多个）' },
      { status: 400 },
    );
  }

  try {
    const enabled = await isTMDBEnabled();
    if (!enabled) {
      return NextResponse.json(
        {
          error: 'TMDB功能未启用',
          message: '请在管理后台配置TMDB API Key并启用此功能',
        },
        { status: 503 },
      );
    }

    // 不做路由层批量缓存：瞬时失败一旦入库会毒化数小时。
    // 真实缓存由 getTMDBHeroInfoByTitle 内部按标题管理（成功/真实无横图缓存 24h，
    // 瞬时失败不落缓存，下次请求自动重试）。
    const entries = await Promise.all(
      titles.map(async (title, index) => {
        try {
          // 数量对不上（旧客户端）时放弃年份，避免错位匹配到别的片
          const year = yearsAligned ? years[index]?.trim() : '';
          const info = await getTMDBHeroInfoByTitle(title, year || undefined);
          return [title, info] as const;
        } catch (error) {
          console.error(`[TMDB横图] 搜索失败: ${title}`, error);
          return [title, null] as const;
        }
      }),
    );

    const result = {
      info: Object.fromEntries(entries) as Record<
        string,
        {
          backdrop: string;
          overview: string;
          tagline?: string;
          genres: string[];
          cast: string[];
          director?: string;
        } | null
      >,
    };

    // 浏览器缓存只保留 5 分钟，避免瞬时失败的长尾
    return NextResponse.json(result, {
      headers: {
        'Cache-Control': 'public, max-age=300, s-maxage=300',
      },
    });
  } catch (error) {
    console.error('[TMDB横图API] 批量查询失败:', (error as Error).message);
    return NextResponse.json(
      { error: 'TMDB横图查询失败', details: (error as Error).message },
      { status: 500 },
    );
  }
}
