/* eslint-disable no-console */

import { NextRequest, NextResponse } from 'next/server';

import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { EpisodeSkipConfig } from '@/lib/types';
import { ensureUserAccessOrResponse } from '@/lib/user-access';

export const runtime = 'nodejs';

// 强制动态渲染，避免在构建时预生成
export async function GET(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (!auth.authInfo) return auth.response;
    const authInfo = auth.authInfo;

    const guardResult = await ensureUserAccessOrResponse(
      authInfo.username,
      authInfo.timestamp,
    );
    if ('response' in guardResult) {
      return guardResult.response;
    }

    const { searchParams } = new URL(request.url);
    const source = searchParams.get('source');
    const id = searchParams.get('id');

    if (source && id) {
      // 获取单个配置
      const config = await db.getEpisodeSkipConfig(
        authInfo.username,
        source,
        id,
      );
      return NextResponse.json(config);
    } else {
      // 获取所有配置
      const configs = await db.getAllEpisodeSkipConfigs(authInfo.username);
      return NextResponse.json(configs);
    }
  } catch (error) {
    console.error('获取剧集跳过配置失败:', error);
    return NextResponse.json(
      { error: '获取剧集跳过配置失败' },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (!auth.authInfo) return auth.response;
    const authInfo = auth.authInfo;

    const guardResult = await ensureUserAccessOrResponse(
      authInfo.username,
      authInfo.timestamp,
    );
    if ('response' in guardResult) {
      return guardResult.response;
    }

    const body = await request.json();
    const { source, id, config } = body;

    if (!source || !id || !config) {
      return NextResponse.json({ error: '缺少必要参数' }, { status: 400 });
    }

    // 验证配置格式
    const episodeSkipConfig: EpisodeSkipConfig = {
      source: String(config.source),
      id: String(config.id),
      title: String(config.title),
      segments: Array.isArray(config.segments) ? config.segments : [],
      updated_time: Number(config.updated_time) || Date.now(),
    };

    await db.saveEpisodeSkipConfig(
      authInfo.username,
      source,
      id,
      episodeSkipConfig,
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('保存剧集跳过配置失败:', error);
    return NextResponse.json(
      { error: '保存剧集跳过配置失败' },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (!auth.authInfo) return auth.response;
    const authInfo = auth.authInfo;

    const guardResult = await ensureUserAccessOrResponse(
      authInfo.username,
      authInfo.timestamp,
    );
    if ('response' in guardResult) {
      return guardResult.response;
    }

    const { searchParams } = new URL(request.url);
    const source = searchParams.get('source');
    const id = searchParams.get('id');

    if (!source || !id) {
      return NextResponse.json({ error: '缺少必要参数' }, { status: 400 });
    }

    await db.deleteEpisodeSkipConfig(authInfo.username, source, id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('删除剧集跳过配置失败:', error);
    return NextResponse.json(
      { error: '删除剧集跳过配置失败' },
      { status: 500 },
    );
  }
}
