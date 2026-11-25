import { NextResponse } from 'next/server';

import { getCacheTime } from '@/lib/config';
import { db } from '@/lib/db';
import { fetchDoubanData } from '@/lib/douban';
import {
  type DoubanRecentHotResponse,
  buildDoubanCategoryUrl,
  mapDoubanRecentHotItems,
} from '@/lib/douban-shared';
import { withAbortableTimeout } from '@/lib/promise-timeout';
import { DoubanResult } from '@/lib/types';

export const runtime = 'nodejs';

const MEMORY_CACHE_TTL_MS = 60_000;
const DB_CACHE_READ_TIMEOUT_MS = 600;
const memoryCategoriesCache = new Map<
  string,
  { response: DoubanResult; expireAt: number }
>();

function buildCacheKey(params: {
  kind: string;
  category: string;
  type: string;
  pageLimit: number;
  pageStart: number;
}): string {
  return `douban-categories-category=${params.category}&kind=${params.kind}&pageLimit=${params.pageLimit}&pageStart=${params.pageStart}&type=${params.type}`;
}

async function readCachedCategoryResult(
  cacheKey: string,
): Promise<DoubanResult | null> {
  const mem = memoryCategoriesCache.get(cacheKey);
  if (mem && Date.now() < mem.expireAt) {
    return mem.response;
  }
  if (mem) {
    memoryCategoriesCache.delete(cacheKey);
  }

  try {
    const dbCached = await withAbortableTimeout(
      () => db.getCache(cacheKey),
      DB_CACHE_READ_TIMEOUT_MS,
    );
    if (
      dbCached &&
      typeof dbCached === 'object' &&
      (dbCached as DoubanResult).code === 200 &&
      Array.isArray((dbCached as DoubanResult).list)
    ) {
      const result = dbCached as DoubanResult;
      memoryCategoriesCache.set(cacheKey, {
        response: result,
        expireAt: Date.now() + MEMORY_CACHE_TTL_MS,
      });
      return result;
    }
  } catch {
    // 缓存读取失败不阻塞主流程
  }

  return null;
}

// 强制动态渲染，避免在构建时预生成
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  // 获取参数
  const kind = searchParams.get('kind') || 'movie';
  const category = searchParams.get('category');
  const type = searchParams.get('type');
  const pageLimit = parseInt(searchParams.get('limit') || '20');
  const pageStart = parseInt(searchParams.get('start') || '0');

  // 验证参数
  if (!kind || !category || !type) {
    return NextResponse.json(
      { error: '缺少必要参数: kind 或 category 或 type' },
      { status: 400 },
    );
  }

  if (!['tv', 'movie'].includes(kind)) {
    return NextResponse.json(
      { error: 'kind 参数必须是 tv 或 movie' },
      { status: 400 },
    );
  }

  if (pageLimit < 1 || pageLimit > 100) {
    return NextResponse.json(
      { error: 'pageSize 必须在 1-100 之间' },
      { status: 400 },
    );
  }

  if (pageStart < 0) {
    return NextResponse.json(
      { error: 'pageStart 不能小于 0' },
      { status: 400 },
    );
  }

  const cacheKey = buildCacheKey({
    kind,
    category,
    type,
    pageLimit,
    pageStart,
  });

  const cachedResponse = await readCachedCategoryResult(cacheKey);
  if (cachedResponse) {
    const cacheTime = await getCacheTime();
    return NextResponse.json(cachedResponse, {
      headers: {
        'Cache-Control': `public, max-age=${cacheTime}, s-maxage=${cacheTime}`,
        'CDN-Cache-Control': `public, s-maxage=${cacheTime}`,
        'Vercel-CDN-Cache-Control': `public, s-maxage=${cacheTime}`,
        'Netlify-Vary': 'query',
      },
    });
  }

  const target = buildDoubanCategoryUrl({
    kind: kind as 'movie' | 'tv',
    category,
    type,
    pageStart,
    pageLimit,
  });

  try {
    // 调用豆瓣 API
    const doubanData = await fetchDoubanData<DoubanRecentHotResponse>(
      target,
      request.signal,
    );

    // 转换数据格式
    const list = mapDoubanRecentHotItems(doubanData);

    const response: DoubanResult = {
      code: 200,
      message: '获取成功',
      list: list,
    };

    const cacheTime = await getCacheTime();
    if (list.length > 0) {
      memoryCategoriesCache.set(cacheKey, {
        response,
        expireAt: Date.now() + MEMORY_CACHE_TTL_MS,
      });
      void db.setCache(cacheKey, response, cacheTime).catch(() => undefined);
    }

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': `public, max-age=${cacheTime}, s-maxage=${cacheTime}`,
        'CDN-Cache-Control': `public, s-maxage=${cacheTime}`,
        'Vercel-CDN-Cache-Control': `public, s-maxage=${cacheTime}`,
        'Netlify-Vary': 'query',
      },
    });
  } catch (error) {
    console.error(`[豆瓣分类] 请求失败: ${target}`, (error as Error).message);
    return NextResponse.json(
      {
        error: '获取豆瓣数据失败',
        details: (error as Error).message,
        url: target,
        params: { kind, category, type, pageLimit, pageStart },
      },
      { status: 500 },
    );
  }
}
