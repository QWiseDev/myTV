/* eslint-disable no-console */
import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { getConfig, setCachedConfig } from '@/lib/config';
import { db } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET: 管理员获取所有留言
export async function GET(req: NextRequest) {
  try {
    // 验证管理员权限
    const authInfo = getAuthInfoFromCookie(req);
    if (!authInfo || !authInfo.username) {
      return NextResponse.json({ error: '需要管理员权限' }, { status: 401 });
    }

    const username = authInfo.username;
    const config = await getConfig();

    // 检查是否是站长或管理员
    const isOwner = username === process.env.USERNAME;
    const userEntry = config.UserConfig.Users.find(
      (u) => u.username === username
    );
    const isAdmin = userEntry?.role === 'admin';

    if (!isOwner && !isAdmin) {
      return NextResponse.json({ error: '需要管理员权限' }, { status: 403 });
    }

    const feedbacks = config.Feedbacks || [];

    return NextResponse.json({ feedbacks });
  } catch (error) {
    console.error('获取留言失败', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}

// POST: 任何人都可以提交留言
export async function POST(req: NextRequest) {
  try {
    const { username, content } = await req.json();

    if (!content || typeof content !== 'string' || content.trim() === '') {
      return NextResponse.json({ error: '留言内容不能为空' }, { status: 400 });
    }

    if (content.length > 500) {
      return NextResponse.json(
        { error: '留言内容过长（最多500字）' },
        { status: 400 }
      );
    }

    const config = await getConfig();
    const feedbacks = config.Feedbacks || [];

    // 生成唯一ID
    const newFeedback = {
      id: `fb_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      username: username || undefined,
      content: content.trim(),
      createdAt: Date.now(),
      read: false,
    };

    feedbacks.push(newFeedback);
    config.Feedbacks = feedbacks;

    await db.saveAdminConfig(config);
    setCachedConfig(config);

    return NextResponse.json({ ok: true, message: '留言提交成功' });
  } catch (error) {
    console.error('提交留言失败', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}

// DELETE: 管理员删除留言
export async function DELETE(req: NextRequest) {
  try {
    // 验证管理员权限
    const authInfo = getAuthInfoFromCookie(req);
    if (!authInfo || !authInfo.username) {
      return NextResponse.json({ error: '需要管理员权限' }, { status: 401 });
    }

    const username = authInfo.username;
    const config = await getConfig();

    // 检查是否是站长或管理员
    const isOwner = username === process.env.USERNAME;
    const userEntry = config.UserConfig.Users.find(
      (u) => u.username === username
    );
    const isAdmin = userEntry?.role === 'admin';

    if (!isOwner && !isAdmin) {
      return NextResponse.json({ error: '需要管理员权限' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const feedbackId = searchParams.get('id');

    if (!feedbackId) {
      return NextResponse.json({ error: '缺少留言ID' }, { status: 400 });
    }

    const feedbacks = config.Feedbacks || [];
    const index = feedbacks.findIndex((f) => f.id === feedbackId);

    if (index === -1) {
      return NextResponse.json({ error: '留言不存在' }, { status: 404 });
    }

    feedbacks.splice(index, 1);
    config.Feedbacks = feedbacks;

    await db.saveAdminConfig(config);
    setCachedConfig(config);

    return NextResponse.json({ ok: true, message: '留言删除成功' });
  } catch (error) {
    console.error('删除留言失败', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}

// PATCH: 管理员标记留言为已读
export async function PATCH(req: NextRequest) {
  try {
    // 验证管理员权限
    const authInfo = getAuthInfoFromCookie(req);
    if (!authInfo || !authInfo.username) {
      return NextResponse.json({ error: '需要管理员权限' }, { status: 401 });
    }

    const username = authInfo.username;
    const config = await getConfig();

    // 检查是否是站长或管理员
    const isOwner = username === process.env.USERNAME;
    const userEntry = config.UserConfig.Users.find(
      (u) => u.username === username
    );
    const isAdmin = userEntry?.role === 'admin';

    if (!isOwner && !isAdmin) {
      return NextResponse.json({ error: '需要管理员权限' }, { status: 403 });
    }

    const { id, read } = await req.json();

    if (!id) {
      return NextResponse.json({ error: '缺少留言ID' }, { status: 400 });
    }

    const feedbacks = config.Feedbacks || [];
    const feedback = feedbacks.find((f) => f.id === id);

    if (!feedback) {
      return NextResponse.json({ error: '留言不存在' }, { status: 404 });
    }

    feedback.read = read !== false;
    config.Feedbacks = feedbacks;

    await db.saveAdminConfig(config);
    setCachedConfig(config);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('更新留言状态失败', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
