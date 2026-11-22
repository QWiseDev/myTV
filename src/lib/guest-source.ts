import { NextRequest, NextResponse } from 'next/server';

import {
  type ApiSite,
  getAdultApiSites,
  getAvailableApiSites,
} from '@/lib/config';

import { consumeRateLimit, getClientIp } from './rate-limit';

/**
 * 访客模式限定源：未登录用户仅允许浏览与播放该源。
 * 默认 key 为 iqiyizyapi.com（爱奇艺），可用环境变量 GUEST_SOURCE_KEY 覆盖。
 */
export const GUEST_SOURCE_KEY =
  process.env.GUEST_SOURCE_KEY || 'iqiyizyapi.com';

/** 查询访客源（须未禁用）；不存在或已禁用时返回 null */
export async function getGuestSource(): Promise<ApiSite | null> {
  const sites = await getAvailableApiSites();
  return sites.find((site) => site.key === GUEST_SOURCE_KEY) || null;
}

/**
 * 判断请求中的 source 是否允许被该用户访问：
 * 登录用户走原有 getAvailableApiSites(username) 过滤，成人源（黄果模块）对登录用户
 * 同样开放；访客仅限访客源。
 */
export async function isSourceAllowedForRequest(
  username: string | null,
  sourceKey: string | undefined,
): Promise<ApiSite | null> {
  if (!sourceKey) return null;

  if (username) {
    const sites = await getAvailableApiSites(username);
    const site = sites.find((s) => s.key === sourceKey);
    if (site) return site;

    // 常规源未命中时，登录用户可访问成人源（黄果模块）
    const adultSites = await getAdultApiSites(username);
    return adultSites.find((s) => s.key === sourceKey) || null;
  }

  const guestSource = await getGuestSource();
  return guestSource && guestSource.key === sourceKey ? guestSource : null;
}

// 访客匿名请求限速：每 IP 每 bucket 每分钟 60 次
const GUEST_RATE_LIMIT = 60;
const GUEST_RATE_WINDOW_MS = 60 * 1000;

/** 访客匿名请求限速检查；超限返回 429 响应，否则返回 null 放行 */
export function checkGuestRateLimit(
  request: NextRequest,
  bucket: string,
): NextResponse | null {
  const result = consumeRateLimit(
    `guest:${bucket}:${getClientIp(request)}`,
    GUEST_RATE_LIMIT,
    GUEST_RATE_WINDOW_MS,
  );
  if (result.allowed) return null;
  return NextResponse.json(
    { error: '请求过于频繁，请稍后再试' },
    {
      status: 429,
      headers: { 'Retry-After': String(result.retryAfterSeconds) },
    },
  );
}
