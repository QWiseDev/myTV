/* eslint-disable no-console */

import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { db } from '@/lib/db';
import { PlayRecord } from '@/lib/types';
import { ensureUserAccessOrResponse } from '@/lib/user-access';

export const runtime = 'nodejs';


// 强制动态渲染，避免在构建时预生成
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export async function GET(request: NextRequest) {
  try {
    // 从 cookie 获取用户信息
    const authInfo = getAuthInfoFromCookie(request);
    if (!authInfo || !authInfo.username) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const guardResult = await ensureUserAccessOrResponse(authInfo.username);
    if ('response' in guardResult) {
      return guardResult.response;
    }

    const records = await db.getAllPlayRecords(authInfo.username);
    return NextResponse.json(records, {
      status: 200,
      headers: {
        // 缓存 30 秒，便于浏览器与 CDN 复用结果，同时区分不同 Cookie 避免串号
        'Cache-Control':
          'public, max-age=30, s-maxage=30, stale-while-revalidate=30',
        Vary: 'Cookie',
      },
    });
  } catch (err) {
    console.error('获取播放记录失败', err);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // 从 cookie 获取用户信息
    const authInfo = getAuthInfoFromCookie(request);
    if (!authInfo || !authInfo.username) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const guardResult = await ensureUserAccessOrResponse(authInfo.username);
    if ('response' in guardResult) {
      return guardResult.response;
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch (parseError) {
      console.error('保存播放记录失败，解析请求体时出错', parseError);
      return NextResponse.json(
        { error: 'Invalid JSON body' },
        { status: 400 }
      );
    }

    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400 }
      );
    }

    const { key, record } = body as {
      key?: string;
      record?: PlayRecord;
    };

    if (!key || !record) {
      return NextResponse.json(
        { error: 'Missing key or record' },
        { status: 400 }
      );
    }

    // 验证播放记录数据
    if (!record.title || !record.source_name || record.index < 1) {
      return NextResponse.json(
        { error: 'Invalid record data' },
        { status: 400 }
      );
    }

    // 从key中解析source和id
    const [source, id] = key.split('+');
    if (!source || !id) {
      return NextResponse.json(
        { error: 'Invalid key format' },
        { status: 400 }
      );
    }

    // 获取现有播放记录以保持原始集数
    const existingRecord = await db.getPlayRecord(
      authInfo.username,
      source,
      id
    );

    // 🔑 关键修复：信任客户端传来的 original_episodes（已经过 checkShouldUpdateOriginalEpisodes 验证）
    // 只有在客户端没有提供时，才使用数据库中的值作为 fallback
    let originalEpisodes: number;
    if (
      record.original_episodes !== undefined &&
      record.original_episodes !== null
    ) {
      // 客户端已经设置了 original_episodes，信任它（可能是更新后的值）
      originalEpisodes = record.original_episodes;
    } else {
      // 客户端没有提供，使用数据库中的值或当前 total_episodes
      originalEpisodes =
        existingRecord?.original_episodes ||
        existingRecord?.total_episodes ||
        record.total_episodes;
    }

    const finalRecord = {
      ...record,
      douban_id: record.douban_id || existingRecord?.douban_id,
      save_time: record.save_time ?? Date.now(),
      original_episodes: originalEpisodes,
    } as PlayRecord;

    await db.savePlayRecord(authInfo.username, source, id, finalRecord);

    // 🎯 保存成功后，清除相关缓存
    // 确保其他接口获取到的是最新数据
    // 统计数据由客户端按需调用 /api/user/my-stats 获取

    return NextResponse.json(
      { success: true },
      {
        status: 200,
        headers: {
          // 禁用缓存，确保更新后立即生效
          'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
          Pragma: 'no-cache',
          Expires: '0',
        },
      }
    );
  } catch (err) {
    console.error('保存播放记录失败', err);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    // 从 cookie 获取用户信息
    const authInfo = getAuthInfoFromCookie(request);
    if (!authInfo || !authInfo.username) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const guardResult = await ensureUserAccessOrResponse(authInfo.username);
    if ('response' in guardResult) {
      return guardResult.response;
    }

    const username = authInfo.username;
    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key');

    if (key) {
      // 如果提供了 key，删除单条播放记录
      const [source, id] = key.split('+');
      if (!source || !id) {
        return NextResponse.json(
          { error: 'Invalid key format' },
          { status: 400 }
        );
      }

      await db.deletePlayRecord(username, source, id);
    } else {
      // 未提供 key，则清空全部播放记录
      await db.clearAllPlayRecords(username);
    }

    // 🎯 删除成功后，清除相关缓存
    // 确保客户端和 CDN 不会返回缓存的旧数据
    return NextResponse.json(
      { success: true },
      {
        status: 200,
        headers: {
          // 禁用缓存，确保删除后立即生效
          'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
          Pragma: 'no-cache',
          Expires: '0',
        },
      }
    );
  } catch (err) {
    console.error('删除播放记录失败', err);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
