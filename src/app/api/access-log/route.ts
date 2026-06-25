/* eslint-disable no-console */

import { headers } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

import { AccessLog } from '@/lib/access-log';
import { getAuthInfoFromCookie } from '@/lib/auth';
import { db } from '@/lib/db';

export const runtime = 'nodejs';


// 强制动态渲染，避免在构建时预生成
export const dynamic = 'force-dynamic';
export const revalidate = 0;
/**
 * 访问记录接口（POST）
 * 用于记录用户页面/菜单访问行为
 */
export async function POST(request: NextRequest) {
  try {
    // 获取真实的客户端IP地址（支持CloudFlare CDN和多种代理情况）
    const headersList = headers();
    const forwardedFor = headersList.get('x-forwarded-for');
    const realIp = headersList.get('x-real-ip');
    const cfConnectingIp = headersList.get('cf-connecting-ip');
    const xVercelForwardedFor = headersList.get('x-vercel-forwarded-for');
    const xOriginalFor = headersList.get('x-original-for');
    const xClientIp = headersList.get('x-client-ip');

    // 优先级：CloudFlare > Vercel > X-Original-For > X-Client-IP > X-Forwarded-For > X-Real-IP
    const remoteAddr = cfConnectingIp ||
                      xVercelForwardedFor ||
                      xOriginalFor ||
                      xClientIp ||
                      forwardedFor?.split(',')[0]?.trim() ||
                      realIp ||
                      request.ip ||
                      '';

    // 从 cookie 获取用户信息
    const authInfo = getAuthInfoFromCookie(request);

    const body = await request.json();

    // 验证基础数据
    if (!body || typeof body.action !== 'string' || !body.action.trim()) {
      return NextResponse.json(
        { error: '缺少有效的操作标识' },
        { status: 400 }
      );
    }

    // 构建访问日志
    const accessLog: AccessLog = {
      userId: authInfo?.username || undefined,
      username: authInfo?.username || undefined,
      action: body.action.trim(),
      pageUrl: body.pageUrl || request.headers.get('referer') || '',
      timestamp: body.timestamp || Date.now(),
      ipAddress: remoteAddr, // 使用后端获取的IP地址，忽略前端传来的
      userAgent: body.userAgent || request.headers.get('user-agent') || '',
      referrer: body.referrer,
      location: body.location || undefined
    };


    // 保存访问日志到数据库
    try {
      await db.saveAccessLog(accessLog);
    } catch (dbError) {
      console.error('[AccessLog] 保存到数据库失败:', dbError);
      // 数据库保存失败时，仍返回成功（异步记录，不暴露给用户）
    }

    return NextResponse.json({ success: true }, { status: 200 });

  } catch (error) {
    console.error('[AccessLog] POST 错误:', error);
    return NextResponse.json(
      { error: '服务器内部错误' },
      { status: 500 }
    );
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
      const headersList = headers();
      const forwardedFor = headersList.get('x-forwarded-for');
      const realIp = headersList.get('x-real-ip');
      const ip = forwardedFor?.split(',')[0]?.trim() || realIp || '';

      return NextResponse.json({ ip }, { status: 200 });

    } catch (error) {
      console.error('[AccessLog-IP] 获取IP地址错误:', error);
      return NextResponse.json({ ip: 'unknown', error: true }, { status: 200 });
    }
  }

  // 访问日志查询（主要功能）
  try {
    const authInfo = getAuthInfoFromCookie(request);
    if (!authInfo?.username) {
      return NextResponse.json({ error: '未认证' }, { status: 401 });
    }

    // 获取查询参数
    const username = searchParams.get('username');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');
    const startTime = searchParams.get('startTime');
    const endTime = searchParams.get('endTime');
    const action = searchParams.get('action');

    // 权限检查：只能查询自己的记录或管理员查询所有
    const myUsername = process.env.USERNAME;
    let queryUsername = authInfo.username;

    // 如果请求查询特定用户
    if (username && username !== authInfo.username) {
      // 只有管理员（站点所有者）可以查询其他用户
      if (authInfo.username !== myUsername) {
        return NextResponse.json(
          { error: '无权限查询其他用户的访问日志' },
          { status: 403 }
        );
      }
      queryUsername = username;
    }

    // 构建查询条件
    const filters = {
      username: queryUsername,
      startTime: startTime ? parseInt(startTime) : undefined,
      endTime: endTime ? parseInt(endTime) : undefined,
      action: action ? action.trim() : undefined,
    };


    // 从数据库获取访问日志
    const accessLogs = await db.getAccessLogs(filters, limit, offset);


    return NextResponse.json({ accessLogs }, { status: 200 });

  } catch (error) {
    console.error('[AccessLog] 查询访问日志错误:', error);
    return NextResponse.json(
      { error: '服务器内部错误' },
      { status: 500 }
    );
  }
}

/**
 * 删除访问日志接口（DELETE）
 * 支持删除特定用户的访问日志或清空所有日志（仅管理员）
 */
export async function DELETE(request: NextRequest) {
  try {
    const authInfo = getAuthInfoFromCookie(request);
    if (!authInfo?.username) {
      return NextResponse.json({ error: '未认证' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const username = searchParams.get('username');
    const confirmDelete = searchParams.get('confirm');

    // 权限检查：只有管理员可以删除日志
    const myUsername = process.env.USERNAME;
    if (authInfo.username !== myUsername) {
      return NextResponse.json(
        { error: '无权限删除访问日志' },
        { status: 403 }
      );
    }

    // 需要确认删除操作
    if (confirmDelete !== 'true') {
      return NextResponse.json(
        { error: '请添加确认参数 ?confirm=true 来执行删除操作' },
        { status: 400 }
      );
    }

    let targetUsername = authInfo.username;
    if (username && username !== authInfo.username) {
      targetUsername = username;
    }


    try {
      const deletedCount = await db.deleteAccessLogs(targetUsername);

      return NextResponse.json(
        {
          success: true,
          message: `成功删除 ${deletedCount} 条访问日志`,
          deletedCount: deletedCount
        },
        { status: 200 }
      );
    } catch (dbError) {
      console.error('[AccessLog] 删除访问日志失败:', dbError);
      return NextResponse.json(
        { error: '删除访问日志失败' },
        { status: 500 }
      );
    }

  } catch (error) {
    console.error('[AccessLog] DELETE 错误:', error);
    return NextResponse.json(
      { error: '服务器内部错误' },
      { status: 500 }
    );
  }
}