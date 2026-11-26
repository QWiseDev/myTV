/* eslint-disable no-console */
import { timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

import {
  AUTH_COOKIE_NAME,
  generateAuthCookie,
  getAuthCookieOptions,
} from '@/lib/auth';
import { getConfig } from '@/lib/config';
import { db } from '@/lib/db';
import {
  consumeRateLimit,
  getClientIp,
  peekRateLimit,
  recordRateLimitEvent,
  resetRateLimit,
} from '@/lib/rate-limit';

export const runtime = 'nodejs';

// —— 登录限速配置 ——
const LOGIN_ATTEMPT_LIMIT = 20; // 单 IP 时间窗内最大登录请求数
const LOGIN_ATTEMPT_WINDOW_MS = 5 * 60 * 1000;
const LOGIN_FAILURE_LIMIT = 8; // 单 IP / 单用户名时间窗内最大失败次数
const LOGIN_FAILURE_WINDOW_MS = 15 * 60 * 1000;

// 弱密码告警：PASSWORD 同时是会话签名密钥，长度不足极易被爆破
if (process.env.PASSWORD && process.env.PASSWORD.length < 8) {
  console.warn(
    '⚠️ 安全警告：环境变量 PASSWORD 长度不足 8 位，存在被暴力破解的风险，请尽快更换为随机强密码',
  );
}

function safePasswordEqual(input: string, expected?: string): boolean {
  if (!expected) {
    return false;
  }
  const a = Buffer.from(input);
  const b = Buffer.from(expected);
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}

function loginAttemptKey(ip: string) {
  return `login:attempt:${ip}`;
}

function loginFailIpKey(ip: string) {
  return `login:fail:ip:${ip}`;
}

function loginFailUserKey(username: string) {
  return `login:fail:user:${username}`;
}

function tooManyAttempts(retryAfterSeconds: number) {
  return NextResponse.json(
    { error: '尝试次数过多，请稍后再试' },
    {
      status: 429,
      headers: { 'Retry-After': String(Math.max(1, retryAfterSeconds)) },
    },
  );
}

function recordLoginFailure(ip: string, username?: string) {
  recordRateLimitEvent(loginFailIpKey(ip), LOGIN_FAILURE_WINDOW_MS);
  if (username) {
    recordRateLimitEvent(loginFailUserKey(username), LOGIN_FAILURE_WINDOW_MS);
  }
}

function clearLoginFailures(ip: string, username?: string) {
  resetRateLimit(
    loginFailIpKey(ip),
    username ? loginFailUserKey(username) : null,
  );
}

export async function POST(req: NextRequest) {
  try {
    // 全局限速：先限制请求频率，再拦截失败次数超标的 IP
    const ip = getClientIp(req);
    const attemptGate = consumeRateLimit(
      loginAttemptKey(ip),
      LOGIN_ATTEMPT_LIMIT,
      LOGIN_ATTEMPT_WINDOW_MS,
    );
    if (!attemptGate.allowed) {
      return tooManyAttempts(attemptGate.retryAfterSeconds);
    }
    const ipFailGate = peekRateLimit(
      loginFailIpKey(ip),
      LOGIN_FAILURE_LIMIT,
      LOGIN_FAILURE_WINDOW_MS,
    );
    if (!ipFailGate.allowed) {
      return tooManyAttempts(ipFailGate.retryAfterSeconds);
    }

    // 校验用户名并验证密码
    const { username, password } = await req.json();

    if (!username || typeof username !== 'string') {
      return NextResponse.json({ error: '用户名不能为空' }, { status: 400 });
    }
    if (!password || typeof password !== 'string') {
      return NextResponse.json({ error: '密码不能为空' }, { status: 400 });
    }

    // 用户名维度的失败锁定
    const userFailGate = peekRateLimit(
      loginFailUserKey(username),
      LOGIN_FAILURE_LIMIT,
      LOGIN_FAILURE_WINDOW_MS,
    );
    if (!userFailGate.allowed) {
      return tooManyAttempts(userFailGate.retryAfterSeconds);
    }

    // 站长账号：直接校验环境变量
    if (
      process.env.USERNAME &&
      username === process.env.USERNAME &&
      safePasswordEqual(password, process.env.PASSWORD)
    ) {
      const response = NextResponse.json({ ok: true });
      const cookieValue = await generateAuthCookie(username, 'owner');
      clearLoginFailures(ip, username);
      response.cookies.set(
        AUTH_COOKIE_NAME,
        cookieValue,
        getAuthCookieOptions(req),
      );
      return response;
    } else if (process.env.USERNAME && username === process.env.USERNAME) {
      recordLoginFailure(ip, username);
      return NextResponse.json({ error: '用户名或密码错误' }, { status: 401 });
    }

    const config = await getConfig();
    const user = config.UserConfig.Users.find((u) => u.username === username);
    if (user && user.banned) {
      return NextResponse.json({ error: '用户被封禁' }, { status: 401 });
    }

    // 校验用户密码
    try {
      const pass = await db.verifyUser(username, password);
      if (!pass) {
        recordLoginFailure(ip, username);
        return NextResponse.json(
          { error: '用户名或密码错误' },
          { status: 401 },
        );
      }

      const response = NextResponse.json({ ok: true });
      const cookieValue = await generateAuthCookie(
        username,
        user?.role || 'user',
      );
      clearLoginFailures(ip, username);
      response.cookies.set(
        AUTH_COOKIE_NAME,
        cookieValue,
        getAuthCookieOptions(req),
      );

      return response;
    } catch (err) {
      console.error('数据库验证失败', err);
      return NextResponse.json({ error: '数据库错误' }, { status: 500 });
    }
  } catch (error) {
    console.error('登录接口异常', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
