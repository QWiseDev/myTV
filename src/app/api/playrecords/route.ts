/* eslint-disable no-console */

import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  savePlayRecordMutation,
  serializePlayRecordMutation,
} from '@/lib/play-record-mutations';
import { normalizePlayRecordsPageSize } from '@/lib/play-records-pagination';
import { parseStorageKey } from '@/lib/storage-key';
import { PlayRecord } from '@/lib/types';
import { ensureUserAccessOrResponse } from '@/lib/user-access';
import { invalidateWatchingUpdatesForUser } from '@/lib/watching-updates-cache';

export const runtime = 'nodejs';

// 强制动态渲染，避免在构建时预生成
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const PLAY_RECORDS_NO_CACHE_HEADERS = {
  'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
  Pragma: 'no-cache',
  Expires: '0',
};

async function invalidateWatchingUpdates(username: string): Promise<void> {
  try {
    await invalidateWatchingUpdatesForUser(username);
  } catch (error) {
    console.warn('失效追更缓存失败:', error);
  }
}

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

    const { searchParams } = new URL(request.url);
    const cursor = searchParams.get('cursor');
    const pageSizeParam = searchParams.get('pageSize');
    if (cursor !== null || pageSizeParam !== null) {
      const page = await db.getPlayRecordsPage(authInfo.username, {
        cursor,
        includeKeys: searchParams.getAll('includeKey'),
        pageSize: normalizePlayRecordsPageSize(pageSizeParam),
      });

      return NextResponse.json(page, {
        status: 200,
        headers: PLAY_RECORDS_NO_CACHE_HEADERS,
      });
    }

    // ?limit=N 兼容旧调用：返回最近 N 条记录的 map，不返回分页元数据。
    const limitParam = searchParams.get('limit');
    const limit = limitParam ? parseInt(limitParam, 10) : 0;

    if (limit > 0) {
      const page = await db.getPlayRecordsPage(authInfo.username, {
        pageSize: limit,
      });

      return NextResponse.json(page.records, {
        status: 200,
        headers: PLAY_RECORDS_NO_CACHE_HEADERS,
      });
    }

    const records = await db.getAllPlayRecords(authInfo.username);

    return NextResponse.json(records, {
      status: 200,
      headers: PLAY_RECORDS_NO_CACHE_HEADERS,
    });
  } catch (err) {
    console.error('获取播放记录失败', err);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 },
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
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400 },
      );
    }

    const { key, record } = body as {
      key?: string;
      record?: PlayRecord;
    };

    if (!key || !record) {
      return NextResponse.json(
        { error: 'Missing key or record' },
        { status: 400 },
      );
    }

    // 验证播放记录数据
    if (!record.title || !record.source_name || record.index < 1) {
      return NextResponse.json(
        { error: 'Invalid record data' },
        { status: 400 },
      );
    }

    // 从key中解析source和id
    const parsedKey = parseStorageKey(key);
    if (!parsedKey) {
      return NextResponse.json(
        { error: 'Invalid key format' },
        { status: 400 },
      );
    }
    const { source, id } = parsedKey;

    const username = authInfo.username;

    const result = await savePlayRecordMutation(username, source, id, record);

    return NextResponse.json(
      { success: true, ...(result.ignored ? { ignored: true } : {}) },
      {
        status: 200,
        headers: PLAY_RECORDS_NO_CACHE_HEADERS,
      },
    );
  } catch (err) {
    console.error('保存播放记录失败', err);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 },
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

    return await serializePlayRecordMutation(username, async () => {
      if (key) {
        // 如果提供了 key，删除单条播放记录
        const parsedKey = parseStorageKey(key);
        if (!parsedKey) {
          return NextResponse.json(
            { error: 'Invalid key format' },
            { status: 400 },
          );
        }

        await db.deletePlayRecord(username, parsedKey.source, parsedKey.id);
      } else {
        // 未提供 key，则清空全部播放记录
        await db.clearAllPlayRecords(username);
      }
      await invalidateWatchingUpdates(username);

      return NextResponse.json(
        { success: true },
        {
          status: 200,
          headers: PLAY_RECORDS_NO_CACHE_HEADERS,
        },
      );
    });
  } catch (err) {
    console.error('删除播放记录失败', err);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 },
    );
  }
}
