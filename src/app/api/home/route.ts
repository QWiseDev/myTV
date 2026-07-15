import { NextResponse } from 'next/server';

import { getServerHomeData } from '@/lib/home-data.server';
import {
  EMPTY_HOME_DATA,
  getHomeDataAvailability,
} from '@/lib/home-data-types';

export const runtime = 'nodejs';
// 聚合数据走进程/DB 缓存；路由本身保持动态，避免构建期打豆瓣
export const dynamic = 'force-dynamic';

const HOME_CACHE_CONTROL =
  'public, max-age=60, s-maxage=300, stale-while-revalidate=600';
const HOME_CDN_CACHE_CONTROL =
  'public, s-maxage=300, stale-while-revalidate=600';
const HOME_NO_STORE_HEADERS = {
  'Cache-Control': 'no-store',
  'CDN-Cache-Control': 'no-store',
};

export async function GET() {
  try {
    const data = await getServerHomeData();
    const headers = getHomeDataAvailability(data).isComplete
      ? {
          'Cache-Control': HOME_CACHE_CONTROL,
          'CDN-Cache-Control': HOME_CDN_CACHE_CONTROL,
        }
      : HOME_NO_STORE_HEADERS;

    return NextResponse.json(data, {
      headers,
    });
  } catch (error) {
    console.error('获取首页聚合数据失败:', error);
    return NextResponse.json(EMPTY_HOME_DATA, {
      status: 200,
      // 失败结果不缓存，尽快重试
      headers: HOME_NO_STORE_HEADERS,
    });
  }
}
