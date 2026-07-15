/* eslint-disable no-console */

import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { db } from '@/lib/db';
import { normalizePlayRecordsPageSize } from '@/lib/play-records-pagination';
import { parseStorageKey } from '@/lib/storage-key';
import { PlayRecord } from '@/lib/types';
import { ensureUserAccessOrResponse } from '@/lib/user-access';

export const runtime = 'nodejs';

// 强制动态渲染，避免在构建时预生成
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const PLAY_RECORDS_NO_CACHE_HEADERS = {
  'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
  Pragma: 'no-cache',
  Expires: '0',
};

const playRecordMutationQueues = new Map<string, Promise<void>>();

async function serializePlayRecordMutation<T>(
  username: string,
  operation: () => Promise<T>,
): Promise<T> {
  const previous = playRecordMutationQueues.get(username) || Promise.resolve();
  const waitForPrevious = previous.catch(() => undefined);
  let release: () => void = () => undefined;
  const current = new Promise<void>((resolve) => {
    release = () => resolve();
  });
  const tail = waitForPrevious.then(() => current);
  playRecordMutationQueues.set(username, tail);

  await waitForPrevious;
  try {
    return await operation();
  } finally {
    release();
    if (playRecordMutationQueues.get(username) === tail) {
      playRecordMutationQueues.delete(username);
    }
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

    return await serializePlayRecordMutation(username, async () => {
      // 同一用户、同一记录在当前进程内串行 read-compare-write，避免并发 POST 交错覆盖。
      const incomingSaveTime =
        typeof record.save_time === 'number' &&
        Number.isFinite(record.save_time)
          ? record.save_time
          : Date.now();

      const existingRecord = await db.getPlayRecord(
        username,
        source,
        id,
      );

      if (
        existingRecord &&
        typeof existingRecord.save_time === 'number' &&
        existingRecord.save_time > incomingSaveTime
      ) {
        return NextResponse.json(
          { success: true, ignored: true },
          {
            status: 200,
            headers: PLAY_RECORDS_NO_CACHE_HEADERS,
          },
        );
      }

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
        save_time: incomingSaveTime,
        original_episodes: originalEpisodes,
      } as PlayRecord;

      await db.savePlayRecord(username, source, id, finalRecord);

      return NextResponse.json(
        { success: true },
        {
          status: 200,
          headers: PLAY_RECORDS_NO_CACHE_HEADERS,
        },
      );
    });
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
