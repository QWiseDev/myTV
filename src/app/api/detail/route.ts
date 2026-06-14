import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { getAvailableApiSites } from '@/lib/config';
import { getDetailFromApi } from '@/lib/downstream';

// 🔧 新增：基于参数的内存缓存
const detailCache = new Map<string, { data: any; timestamp: number }>();
const DETAIL_CACHE_DURATION = 10 * 60 * 1000; // 10分钟缓存

export const runtime = 'nodejs';


// 强制动态渲染，避免在构建时预生成
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export async function GET(request: NextRequest) {
  const authInfo = getAuthInfoFromCookie(request);
  if (!authInfo || !authInfo.username) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  const sourceCode = searchParams.get('source');

  if (!id || !sourceCode) {
    return NextResponse.json({ error: '缺少必要参数' }, { status: 400 });
  }

  if (!/^[\w-]+$/.test(id)) {
    return NextResponse.json({ error: '无效的视频ID格式' }, { status: 400 });
  }

  try {
    const apiSites = await getAvailableApiSites(authInfo.username);
    const apiSite = apiSites.find((site) => site.key === sourceCode);

    if (!apiSite) {
      return NextResponse.json({ error: '无效的API来源' }, { status: 400 });
    }

    // 🎯 生成缓存键
    const cacheKey = `${sourceCode}:${id}`;
    const now = Date.now();

    // 🔧 检查缓存
    const cached = detailCache.get(cacheKey);
    if (cached && now - cached.timestamp < DETAIL_CACHE_DURATION) {
      const remainingTime = DETAIL_CACHE_DURATION - (now - cached.timestamp);
      console.log(
        `📦 缓存命中: ${apiSite.name} - ${id}，剩余时间: ${Math.floor(remainingTime / 1000)}秒`
      );
      // 🎯 返回缓存数据，并设置浏览器和CDN缓存头
      return NextResponse.json(cached.data, {
        headers: {
          'Cache-Control': `public, max-age=${Math.floor(remainingTime / 1000)}, s-maxage=${Math.floor(remainingTime / 1000)}`,
          'ETag': `"${cacheKey}-${cached.timestamp}"`,
        },
      });
    }

    // 🎯 缓存未命中或已过期，获取新数据
    const result = await getDetailFromApi(apiSite, id);

    // 💾 更新缓存
    detailCache.set(cacheKey, {
      data: result,
      timestamp: now
    });
    console.log(
      `✅ 视频详情已缓存: ${apiSite.name} - ${id}，有效期${DETAIL_CACHE_DURATION / 1000 / 60}分钟`
    );

    // 定期清理过期缓存（避免内存泄漏）
    if (detailCache.size > 1000) {
      for (const [key, value] of Array.from(detailCache.entries())) {
        if (now - value.timestamp > DETAIL_CACHE_DURATION) {
          detailCache.delete(key);
        }
      }
      console.log(`🧹 清理过期缓存，当前缓存数量: ${detailCache.size}`);
    }

    // 🎯 返回新数据，并设置浏览器和CDN缓存头
    return NextResponse.json(result, {
      headers: {
        'Cache-Control': `public, max-age=${DETAIL_CACHE_DURATION / 1000}, s-maxage=${DETAIL_CACHE_DURATION / 1000}`,
        'ETag': `"${cacheKey}-${now}"`,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
