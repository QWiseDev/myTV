import { NextRequest, NextResponse } from 'next/server';

import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { ensureUserAccessOrResponse } from '@/lib/user-access';

export const runtime = 'nodejs';

const ALLOWED_CACHE_PREFIXES = [
  'bangumi-',
  'douban-',
  'tmdb-',
  'danmu-',
  'danmaku-',
] as const;

const MAX_CACHE_TTL_SECONDS = 7 * 24 * 60 * 60;

function isAllowedCacheKeyOrPrefix(value: string): boolean {
  if (!value || value.length > 256 || /[\r\n\s*?[\]]/.test(value)) {
    return false;
  }
  return ALLOWED_CACHE_PREFIXES.some((prefix) => value.startsWith(prefix));
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (!auth.authInfo) return auth.response;
    const guardResult = await ensureUserAccessOrResponse(
      auth.authInfo.username,
      auth.authInfo.timestamp,
    );
    if ('response' in guardResult) {
      return guardResult.response;
    }

    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key');

    if (!key) {
      return NextResponse.json({ error: 'Key is required' }, { status: 400 });
    }
    if (!isAllowedCacheKeyOrPrefix(key)) {
      return NextResponse.json({ error: 'Invalid cache key' }, { status: 400 });
    }

    // 现在可以安全地调用 db.getCache，Upstash 的 getCache 已经修复
    const data = await db.getCache(key);
    return NextResponse.json({ data });
  } catch (error) {
    console.error(
      `❌ API缓存错误 (key: ${request.nextUrl.searchParams.get('key')}):`,
      error,
    );
    console.error('错误详情:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      name: error instanceof Error ? error.name : undefined,
    });
    return NextResponse.json({ data: null }, { status: 200 }); // 确保返回 200 而不是 500
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (!auth.authInfo) return auth.response;
    const guardResult = await ensureUserAccessOrResponse(
      auth.authInfo.username,
      auth.authInfo.timestamp,
    );
    if ('response' in guardResult) {
      return guardResult.response;
    }

    const body = await request.json();
    const { key, data, expireSeconds } = body;

    if (!key || typeof key !== 'string') {
      return NextResponse.json({ error: 'Key is required' }, { status: 400 });
    }
    if (!isAllowedCacheKeyOrPrefix(key)) {
      return NextResponse.json({ error: 'Invalid cache key' }, { status: 400 });
    }

    const normalizedTtl =
      typeof expireSeconds === 'number' &&
      Number.isFinite(expireSeconds) &&
      expireSeconds > 0
        ? Math.min(Math.floor(expireSeconds), MAX_CACHE_TTL_SECONDS)
        : undefined;

    await db.setCache(key, data, normalizedTtl);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Set cache error:', error);
    return NextResponse.json({ error: 'Failed to set cache' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (!auth.authInfo) return auth.response;
    const guardResult = await ensureUserAccessOrResponse(
      auth.authInfo.username,
      auth.authInfo.timestamp,
    );
    if ('response' in guardResult) {
      return guardResult.response;
    }

    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key');
    const prefix = searchParams.get('prefix');

    if (prefix) {
      if (!isAllowedCacheKeyOrPrefix(prefix)) {
        return NextResponse.json(
          { error: 'Invalid cache prefix' },
          { status: 400 },
        );
      }
      await db.clearExpiredCache(prefix);
    } else if (key) {
      if (!isAllowedCacheKeyOrPrefix(key)) {
        return NextResponse.json(
          { error: 'Invalid cache key' },
          { status: 400 },
        );
      }
      await db.deleteCache(key);
    } else {
      return NextResponse.json(
        { error: 'Key or prefix is required' },
        { status: 400 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete cache error:', error);
    return NextResponse.json(
      { error: 'Failed to delete cache' },
      { status: 500 },
    );
  }
}
