/* eslint-disable no-console */

import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie, verifySignature } from '@/lib/auth';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 跳过不需要认证的路径
  if (shouldSkipAuth(pathname)) {
    return NextResponse.next();
  }

  if (!process.env.PASSWORD) {
    // 如果没有设置密码，重定向到警告页面
    const warningUrl = new URL('/warning', request.url);
    return NextResponse.redirect(warningUrl);
  }

  // 从cookie获取认证信息

  const authInfo = getAuthInfoFromCookie(request);

  if (!authInfo) {
    return handleAuthFailure(request, pathname);
  }

  // 检查是否有用户名（密码不存储在cookie中）
  if (!authInfo.username || !authInfo.signature) {
    return handleAuthFailure(request, pathname);
  }

  // 验证签名（如果存在）
  if (authInfo.signature) {
    const isValidSignature = await verifySignature(
      authInfo.username,
      authInfo.signature,
      process.env.PASSWORD || '',
    );

    // 签名验证通过即可
    if (isValidSignature) {
      return NextResponse.next();
    }
  }

  // 签名验证失败或不存在签名
  return handleAuthFailure(request, pathname);
}

// 验证签名已移至 src/lib/auth.ts（访客感知路由复用同一实现）

// 处理认证失败的情况
function handleAuthFailure(
  request: NextRequest,
  pathname: string,
): NextResponse {
  // API 路由与图片优化器返回 401 状态码（图片请求重定向到登录页没有意义）
  if (
    pathname.startsWith('/api') ||
    pathname.startsWith(IMAGE_OPTIMIZER_PATH)
  ) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  // 否则重定向到登录页面
  const loginUrl = new URL('/login', request.url);
  // 保留完整的URL，包括查询参数
  const fullUrl = `${pathname}${request.nextUrl.search}`;
  loginUrl.searchParams.set('redirect', fullUrl);
  return NextResponse.redirect(loginUrl);
}

// 图片优化器会让源站抓取并转码任意外链，必须鉴权，避免被当作开放代理耗尽源站并发
const IMAGE_OPTIMIZER_PATH = '/_next/image';

// 访客模式放行：未登录可访问的页面与播放所需 API。
// 页面精确匹配；API 命中后由路由内部做「访客感知」限源（仅访客源）与限速。
const GUEST_EXACT_PATHS = ['/', '/play'];
const GUEST_PREFIX_PATHS = [
  '/api/detail',
  '/api/source-browser/',
  '/api/douban/details',
  '/api/douban/comments',
  '/api/danmaku',
  '/api/danmu-external',
  '/api/ad-filter',
];

// 判断是否需要跳过认证的路径
function shouldSkipAuth(pathname: string): boolean {
  if (pathname.startsWith(IMAGE_OPTIMIZER_PATH)) {
    return false;
  }

  if (
    GUEST_EXACT_PATHS.includes(pathname) ||
    GUEST_PREFIX_PATHS.some((path) => pathname.startsWith(path))
  ) {
    return true;
  }

  const skipPaths = [
    '/_next',
    '/favicon.ico',
    '/robots.txt',
    '/manifest.json',
    '/sw.js', // Service Worker：放行以便浏览器能完成 SW 更新检查
    '/workbox-', // SW 运行时 importScripts 依赖
    '/icons/',
    '/logo.svg',
    '/screenshot.png',
    '/api/image-proxy',
    '/slot-symbols/', // 老虎机符号图片
    '/sounds/', // 音频文件
  ];

  return skipPaths.some((path) => pathname.startsWith(path));
}

// 配置middleware匹配规则
export const config = {
  matcher: [
    '/((?!_next/static|favicon.ico|login|register|warning|api/login|api/register|api/logout|api/cron|api/server-config|api/tvbox|api/live/merged|api/parse|api/bing-wallpaper|api/image-proxy|api/proxy/spider.jar|api/feedback).*)',
  ],
};
