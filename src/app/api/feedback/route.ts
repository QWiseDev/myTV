/* eslint-disable no-console */
import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

import { requireAdmin } from '@/lib/admin-auth';
import { resolveRequestUser } from '@/lib/auth';
import { clearConfigCache, getConfig } from '@/lib/config';
import { db } from '@/lib/db';
import { consumeRateLimit, getClientIp } from '@/lib/rate-limit';

export const runtime = 'nodejs';

const FEEDBACK_WINDOW_MS = 10 * 60 * 1000;
const FEEDBACK_MAX_REQUESTS = 10;

// GET: 管理员获取所有留言
export async function GET(req: NextRequest) {
  try {
    const admin = await requireAdmin(req);
    if ('response' in admin) return admin.response;

    const feedbacks = admin.config.Feedbacks || [];

    return NextResponse.json({ feedbacks });
  } catch (error) {
    console.error('获取留言失败', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}

// POST: 任何人都可以提交留言（带限流与已登录用户防伪造）
export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const rate = consumeRateLimit(
      `feedback:${ip}`,
      FEEDBACK_MAX_REQUESTS,
      FEEDBACK_WINDOW_MS,
    );
    if (!rate.allowed) {
      return NextResponse.json(
        { error: '提交过于频繁，请稍后再试' },
        { status: 429 },
      );
    }

    const { username, content } = await req.json();

    if (!content || typeof content !== 'string' || content.trim() === '') {
      return NextResponse.json({ error: '留言内容不能为空' }, { status: 400 });
    }

    if (content.length > 500) {
      return NextResponse.json(
        { error: '留言内容过长（最多500字）' },
        { status: 400 },
      );
    }

    const verifiedUser = await resolveRequestUser(req);
    const rawGuestName =
      typeof username === 'string' ? username.trim().slice(0, 40) : '';
    const authorName = verifiedUser
      ? verifiedUser.username
      : rawGuestName
        ? `[访客] ${rawGuestName}`
        : undefined;

    const config = await getConfig();
    const feedbacks = [...(config.Feedbacks || [])];

    // 生成唯一ID
    const newFeedback = {
      id: `fb_${Date.now()}_${randomUUID().slice(0, 8)}`,
      username: authorName,
      content: content.trim(),
      createdAt: Date.now(),
      read: false,
    };

    feedbacks.push(newFeedback);
    config.Feedbacks = feedbacks;

    await db.saveAdminConfig(config);
    clearConfigCache();

    return NextResponse.json({ ok: true, message: '留言提交成功' });
  } catch (error) {
    console.error('提交留言失败', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}

// DELETE: 管理员删除留言
export async function DELETE(req: NextRequest) {
  try {
    const admin = await requireAdmin(req);
    if ('response' in admin) return admin.response;
    const config = admin.config;

    const { searchParams } = new URL(req.url);
    const feedbackId = searchParams.get('id');

    if (!feedbackId) {
      return NextResponse.json({ error: '缺少留言ID' }, { status: 400 });
    }

    const feedbacks = [...(config.Feedbacks || [])];
    const index = feedbacks.findIndex((f) => f.id === feedbackId);

    if (index === -1) {
      return NextResponse.json({ error: '留言不存在' }, { status: 404 });
    }

    feedbacks.splice(index, 1);
    config.Feedbacks = feedbacks;

    await db.saveAdminConfig(config);
    clearConfigCache();

    return NextResponse.json({ ok: true, message: '留言删除成功' });
  } catch (error) {
    console.error('删除留言失败', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}

// PATCH: 管理员标记留言为已读
export async function PATCH(req: NextRequest) {
  try {
    const admin = await requireAdmin(req);
    if ('response' in admin) return admin.response;
    const config = admin.config;

    const { id, read } = await req.json();

    if (!id) {
      return NextResponse.json({ error: '缺少留言ID' }, { status: 400 });
    }

    const feedbacks = [...(config.Feedbacks || [])];
    const feedback = feedbacks.find((f) => f.id === id);

    if (!feedback) {
      return NextResponse.json({ error: '留言不存在' }, { status: 404 });
    }

    feedback.read = read !== false;
    config.Feedbacks = feedbacks;

    await db.saveAdminConfig(config);
    clearConfigCache();

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('更新留言状态失败', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
