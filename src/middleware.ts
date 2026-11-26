/* eslint-disable no-console */

import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie, verifyAuthInfo } from '@/lib/auth';

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

  const authInfo = getAuthInfoFromCookie(request);
  const verified = await verifyAuthInfo(authInfo, process.env.PASSWORD);
  if (verified) {
    return NextResponse.next();
  }

  // 签名验证失败、缺少字段或会话过期
  return handleAuthFailure(request, pathname);
}

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

// 访客模式与外部设备对接精确放行路径：
// - '/', '/play'：访客可访问页面
// - '/api/tvbox'：TVBox 客户端拉取配置（使用路由内 token / IP 白名单 / 限速校验），
//   注意不可放行 /api/tvbox-config 与 /api/tvbox/* 诊断端点
// - '/api/feedback'：POST 允许访客提交反馈，GET/DELETE/PATCH 由路由内 requireAdmin 严校验
const GUEST_EXACT_PATHS = ['/', '/play', '/api/tvbox', '/api/feedback'];
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

// 配置middleware匹配规则（仅排除登录/注册/静态公共端点，避免前缀误放行 /api/tvbox-* 等）
export const config = {
  matcher: [
    '/((?!_next/static|favicon\\.ico|login$|register$|warning$|api/login$|api/register$|api/logout$|api/cron$|api/server-config$|api/live/merged$|api/parse$|api/bing-wallpaper$|api/image-proxy$|api/proxy/spider\\.jar$).*)',
  ],
};
