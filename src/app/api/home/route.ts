import { NextResponse } from 'next/server';

import { getServerHomeData } from '@/lib/home-data.server';

export const runtime = 'nodejs';
// 聚合数据走进程/DB 缓存；路由本身保持动态，避免构建期打豆瓣
export const dynamic = 'force-dynamic';

const HOME_CACHE_CONTROL =
  'public, max-age=60, s-maxage=300, stale-while-revalidate=600';

export async function GET() {
  try {
    const data = await getServerHomeData();

    return NextResponse.json(data, {
      headers: {
        'Cache-Control': HOME_CACHE_CONTROL,
        'CDN-Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      },
    });
  } catch (error) {
    console.error('获取首页聚合数据失败:', error);
    return NextResponse.json(
      {
        hotMovies: [],
        hotTvShows: [],
        hotVarietyShows: [],
        bangumiCalendarData: [],
      },
      {
        status: 200,
        headers: {
          // 失败结果不缓存，尽快重试
          'Cache-Control': 'no-store',
        },
      },
    );
  }
}
