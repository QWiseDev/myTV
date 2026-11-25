import { NextRequest, NextResponse } from 'next/server';

import { resolveRequestUser } from '@/lib/auth';
import { getDetailFromApi } from '@/lib/downstream';
import {
  checkGuestRateLimit,
  resolveAllowedSourceForRequest,
} from '@/lib/guest-source';

// 🔧 新增：基于参数的内存缓存
const detailCache = new Map<string, { data: unknown; timestamp: number }>();
const DETAIL_CACHE_DURATION = 10 * 60 * 1000; // 10分钟缓存

export const runtime = 'nodejs';

function withAdultFlag(data: unknown, isAdult: boolean): unknown {
  if (!isAdult || !data || typeof data !== 'object') {
    return data;
  }
  return { ...(data as Record<string, unknown>), adult: true };
}

// 强制动态渲染，避免在构建时预生成
export async function GET(request: NextRequest) {
  const user = await resolveRequestUser(request);
  if (!user) {
    const rateLimited = checkGuestRateLimit(request, 'detail');
    if (rateLimited) return rateLimited;
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
    const resolvedSource = await resolveAllowedSourceForRequest(
      user?.username ?? null,
      sourceCode,
    );

    if (!resolvedSource) {
      // 访客仅允许访客源，其余来源按 403 拒绝；登录用户保持原 400 语义
      return NextResponse.json(
        { error: user ? '无效的API来源' : '访客仅可访问指定片源' },
        { status: user ? 400 : 403 },
      );
    }

    const { site: apiSite, isAdult } = resolvedSource;

    // 🎯 生成缓存键
    const cacheKey = `${sourceCode}:${id}`;
    const now = Date.now();

    // 🔧 检查缓存
    const cached = detailCache.get(cacheKey);
    if (cached && now - cached.timestamp < DETAIL_CACHE_DURATION) {
      const remainingTime = DETAIL_CACHE_DURATION - (now - cached.timestamp);
      // 🎯 返回缓存数据，并设置浏览器和CDN缓存头
      return NextResponse.json(withAdultFlag(cached.data, isAdult), {
        headers: {
          'Cache-Control': isAdult
            ? 'private, no-store'
            : `public, max-age=${Math.floor(remainingTime / 1000)}, s-maxage=${Math.floor(remainingTime / 1000)}`,
          ETag: `"${cacheKey}-${cached.timestamp}${isAdult ? '-adult' : ''}"`,
        },
      });
    }

    // 🎯 缓存未命中或已过期，获取新数据
    const result = await getDetailFromApi(apiSite, id);

    // 💾 更新缓存
    detailCache.set(cacheKey, {
      data: result,
      timestamp: now,
    });

    // 定期清理过期缓存（避免内存泄漏）
    if (detailCache.size > 1000) {
      for (const [key, value] of Array.from(detailCache.entries())) {
        if (now - value.timestamp > DETAIL_CACHE_DURATION) {
          detailCache.delete(key);
        }
      }
    }

    // 🎯 返回新数据，并设置浏览器和CDN缓存头
    return NextResponse.json(withAdultFlag(result, isAdult), {
      headers: {
        'Cache-Control': isAdult
          ? 'private, no-store'
          : `public, max-age=${DETAIL_CACHE_DURATION / 1000}, s-maxage=${DETAIL_CACHE_DURATION / 1000}`,
        ETag: `"${cacheKey}-${now}${isAdult ? '-adult' : ''}"`,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }
}
