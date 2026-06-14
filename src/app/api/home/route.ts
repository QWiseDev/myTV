import { NextResponse } from 'next/server';

import { getServerHomeData } from '@/lib/home-data.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const data = await getServerHomeData();

    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'private, max-age=120, stale-while-revalidate=300',
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
      { status: 200 }
    );
  }
}
