import { NextRequest, NextResponse } from 'next/server';

import {
  AUTH_COOKIE_NAME,
  getAuthCookieOptions,
  LEGACY_AUTH_COOKIE_NAME,
} from '@/lib/auth';

export const runtime = 'nodejs';

// 强制动态渲染，避免在构建时预生成
export async function POST(request: NextRequest) {
  const response = NextResponse.json({ ok: true });
  const expiredOptions = getAuthCookieOptions(request, new Date(0));

  // 清除新的认证 cookie (user_auth) 及旧版 cookie (auth)
  response.cookies.set(AUTH_COOKIE_NAME, '', expiredOptions);
  response.cookies.set(LEGACY_AUTH_COOKIE_NAME, '', expiredOptions);

  return response;
}
