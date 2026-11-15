import { NextRequest, NextResponse } from 'next/server';

import { getCacheTime } from '@/lib/config';
import { db } from '@/lib/db';
import { getTMDBHeroInfoByTitle, isTMDBEnabled } from '@/lib/tmdb.client';

const HERO_BACKDROP_CACHE_TIME = 6 * 60 * 60; // 6小时
const MAX_TITLES = 8;

export const runtime = 'nodejs';

// 强制动态渲染，避免在构建时预生成
export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * 首页 Banner 增强信息批量查询：?title=xx&year=xx&title=yy...
 * 返回 { info: { [title]: TMDBHeroInfo | null } }（横图/简介/主演/导演/类型）
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const titles = searchParams.getAll('title').slice(0, MAX_TITLES);
  const years = searchParams.getAll('year');

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

    const cacheKey = `tmdb-hero_info-v2-${JSON.stringify(titles)}`;

    try {
      const cachedResult = await db.getCache(cacheKey);
      if (cachedResult) {
        return NextResponse.json(cachedResult);
      }
    } catch (cacheError) {
      console.warn('TMDB横图缓存检查失败:', cacheError);
    }

    const entries = await Promise.all(
      titles.map(async (title, index) => {
        try {
          const info = await getTMDBHeroInfoByTitle(title, years[index]);
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
        | {
            backdrop: string;
            overview: string;
            tagline?: string;
            genres: string[];
            cast: string[];
            director?: string;
          }
        | null
      >,
    };

    try {
      await db.setCache(cacheKey, result, HERO_BACKDROP_CACHE_TIME);
    } catch (cacheError) {
      console.warn('TMDB横图缓存保存失败:', cacheError);
    }

    const cacheTime = await getCacheTime();
    return NextResponse.json(result, {
      headers: {
        'Cache-Control': `public, max-age=${cacheTime}, s-maxage=${cacheTime}`,
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
