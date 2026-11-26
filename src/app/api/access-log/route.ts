/* eslint-disable no-console */

import { headers } from 'next/headers';
import { after, NextRequest, NextResponse } from 'next/server';

import { AccessLog } from '@/lib/access-log';
import { requireAdmin } from '@/lib/admin-auth';
import { requireUser, resolveRequestUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { consumeRateLimit, getClientIp } from '@/lib/rate-limit';
import { ensureUserAccessOrResponse } from '@/lib/user-access';

export const runtime = 'nodejs';

const ACCESS_LOG_POST_WINDOW_MS = 60 * 1000;
const ACCESS_LOG_POST_LIMIT = 120;

function extractClientIpFromHeaders(headersList: Headers): string {
  const cfConnectingIp = headersList.get('cf-connecting-ip');
  const xVercelForwardedFor = headersList.get('x-vercel-forwarded-for');
  const xOriginalFor = headersList.get('x-original-for');
  const xClientIp = headersList.get('x-client-ip');
  const forwardedFor = headersList.get('x-forwarded-for');
  const realIp = headersList.get('x-real-ip');

  return (
    cfConnectingIp ||
    xVercelForwardedFor ||
    xOriginalFor ||
    xClientIp ||
    forwardedFor?.split(',')[0]?.trim() ||
    realIp ||
    ''
  );
}

// 强制动态渲染，避免在构建时预生成
/**
 * 访问记录接口（POST）
 * 用于记录用户页面/菜单访问行为
 */
export async function POST(request: NextRequest) {
  try {
    const headersList = await headers();
    const remoteAddr = extractClientIpFromHeaders(headersList);
    const rateKey = `access-log:${remoteAddr || getClientIp(request)}`;
    const rate = consumeRateLimit(
      rateKey,
      ACCESS_LOG_POST_LIMIT,
      ACCESS_LOG_POST_WINDOW_MS,
    );
    if (!rate.allowed) {
      return NextResponse.json({ error: '请求过于频繁' }, { status: 429 });
    }

    // 使用签名校验后的用户信息，忽略伪造 Cookie
    const resolvedUser = await resolveRequestUser(request);

    const body = await request.json();

    // 验证基础数据
    if (!body || typeof body.action !== 'string' || !body.action.trim()) {
      return NextResponse.json(
        { error: '缺少有效的操作标识' },
        { status: 400 },
      );
    }

    const rawTimestamp = body.timestamp;
    const now = Date.now();
    const validTimestamp =
      typeof rawTimestamp === 'number' &&
      Number.isFinite(rawTimestamp) &&
      Math.abs(now - rawTimestamp) < 24 * 60 * 60 * 1000
        ? rawTimestamp
        : now;

    // 构建访问日志（限制字段长度，防止恶意大包膨胀存储）
    const accessLog: AccessLog = {
      userId: resolvedUser?.username || undefined,
      username: resolvedUser?.username || undefined,
      action: body.action.trim().slice(0, 100),
      pageUrl: String(
        body.pageUrl || request.headers.get('referer') || '',
      ).slice(0, 500),
      timestamp: validTimestamp,
      ipAddress: remoteAddr, // 使用后端获取的IP地址，忽略前端传来的
      userAgent: String(
        body.userAgent || request.headers.get('user-agent') || '',
      ).slice(0, 300),
      referrer:
        typeof body.referrer === 'string'
          ? body.referrer.slice(0, 500)
          : undefined,
      location:
        typeof body.location === 'string'
          ? body.location.slice(0, 200)
          : undefined,
    };

    // 响应先行，日志落库放到响应后执行（Next 15 after()）
    after(async () => {
      try {
        await db.saveAccessLog(accessLog);
      } catch (dbError) {
        console.error('[AccessLog] 保存到数据库失败:', dbError);
        // 数据库保存失败时，不影响已返回的响应
      }
    });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('[AccessLog] POST 错误:', error);
    return NextResponse.json({ error: '服务器内部错误' }, { status: 500 });
  }
}

/**
 * 访问日志查询和IP获取接口（GET）
 * 支持两种模式：
 * 1. IP地址获取：/api/access-log?ip=true
 * 2. 访问日志查询：/api/access-log（需要认证）
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  // 专门处理IP地址查询端点
  if (searchParams.get('ip') === 'true') {
    try {
      const headersList = await headers();
      const ip = extractClientIpFromHeaders(headersList);

      return NextResponse.json({ ip }, { status: 200 });
    } catch (error) {
      console.error('[AccessLog-IP] 获取IP地址错误:', error);
      return NextResponse.json({ ip: 'unknown', error: true }, { status: 200 });
    }
  }

  // 访问日志查询（主要功能）
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

    // 获取查询参数
    const username = searchParams.get('username');
    const rawLimit = Number.parseInt(searchParams.get('limit') || '50', 10);
    const rawOffset = Number.parseInt(searchParams.get('offset') || '0', 10);
    const limit = Math.min(
      Math.max(Number.isFinite(rawLimit) ? rawLimit : 50, 1),
      200,
    );
    const offset = Math.max(Number.isFinite(rawOffset) ? rawOffset : 0, 0);
    const startTimeParam = searchParams.get('startTime');
    const endTimeParam = searchParams.get('endTime');
    const action = searchParams.get('action');

    const parsedStartTime = startTimeParam
      ? Number.parseInt(startTimeParam, 10)
      : undefined;
    const parsedEndTime = endTimeParam
      ? Number.parseInt(endTimeParam, 10)
      : undefined;

    // 权限检查：只能查询自己的记录，或站长查询其他用户
    let queryUsername = auth.authInfo.username;

    if (username && username !== auth.authInfo.username) {
      const admin = await requireAdmin(request, {
        ownerOnly: true,
        forbiddenMessage: '无权限查询其他用户的访问日志',
      });
      if ('response' in admin) return admin.response;
      queryUsername = username;
    }

    // 构建查询条件
    const filters = {
      username: queryUsername,
      startTime:
        parsedStartTime !== undefined && Number.isFinite(parsedStartTime)
          ? parsedStartTime
          : undefined,
      endTime:
        parsedEndTime !== undefined && Number.isFinite(parsedEndTime)
          ? parsedEndTime
          : undefined,
      action: action ? action.trim().slice(0, 100) : undefined,
    };

    // 从数据库获取访问日志
    const accessLogs = await db.getAccessLogs(filters, limit, offset);

    return NextResponse.json({ accessLogs }, { status: 200 });
  } catch (error) {
    console.error('[AccessLog] 查询访问日志错误:', error);
    return NextResponse.json({ error: '服务器内部错误' }, { status: 500 });
  }
}

/**
 * 删除访问日志接口（DELETE）
 * 支持删除特定用户的访问日志或清空所有日志（仅站长）
 */
export async function DELETE(request: NextRequest) {
  try {
    const admin = await requireAdmin(request, {
      ownerOnly: true,
      forbiddenMessage: '无权限删除访问日志',
    });
    if ('response' in admin) return admin.response;

    const { searchParams } = new URL(request.url);
    const username = searchParams.get('username');
    const confirmDelete = searchParams.get('confirm');

    // 需要确认删除操作
    if (confirmDelete !== 'true') {
      return NextResponse.json(
        { error: '请添加确认参数 ?confirm=true 来执行删除操作' },
        { status: 400 },
      );
    }

    const targetUsername =
      username && username.trim() ? username.trim() : admin.username;

    try {
      const deletedCount = await db.deleteAccessLogs(targetUsername);

      return NextResponse.json(
        {
          success: true,
          message: `成功删除 ${deletedCount} 条访问日志`,
          deletedCount: deletedCount,
        },
        { status: 200 },
      );
    } catch (dbError) {
      console.error('[AccessLog] 删除访问日志失败:', dbError);
      return NextResponse.json({ error: '删除访问日志失败' }, { status: 500 });
    }
  } catch (error) {
    console.error('[AccessLog] DELETE 错误:', error);
    return NextResponse.json({ error: '服务器内部错误' }, { status: 500 });
  }
}
