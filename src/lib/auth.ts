import { NextRequest, NextResponse } from 'next/server';

export const AUTH_COOKIE_NAME = 'user_auth';
export const LEGACY_AUTH_COOKIE_NAME = 'auth';
export const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const SESSION_CLOCK_SKEW_MS = 5 * 60 * 1000;

export interface AuthInfo {
  username?: string;
  signature?: string;
  timestamp?: number;
  loginTime?: number;
  role?: 'owner' | 'admin' | 'user';
}

export interface AuthInfoWithUsername extends AuthInfo {
  username: string;
  timestamp?: number;
}

// 两个成员都显式声明属性（optional + undefined），确保 TS 4.9 下 `!auth.authInfo` 能正确收窄
type RequireUserResult =
  | { authInfo: AuthInfoWithUsername; response?: undefined }
  | { authInfo?: undefined; response: NextResponse };

function parseAuthCookiePayload(rawCookieValue: string): AuthInfo | null {
  if (!rawCookieValue) {
    return null;
  }

  // 兼容未编码 JSON，以及历史上双重编码的 cookie
  const candidates: string[] = [];
  if (rawCookieValue.trim().startsWith('{')) {
    candidates.push(rawCookieValue);
  }
  try {
    const once = decodeURIComponent(rawCookieValue);
    candidates.push(once);
    if (once.includes('%')) {
      candidates.push(decodeURIComponent(once));
    }
  } catch {
    // 非法百分号编码时跳过 decode 分支，继续尝试原始串
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as AuthInfo;
      if (parsed && typeof parsed === 'object') {
        return parsed;
      }
    } catch {
      // 继续尝试下一个候选编码格式
    }
  }

  return null;
}

/**
 * 从 cookie 字符串解析认证信息（供 SSR Server Component 等非 NextRequest 场景复用）。
 */
export function getAuthInfoFromCookieHeader(
  cookieHeader: string | null,
): AuthInfo | null {
  if (!cookieHeader) {
    return null;
  }

  const cookies = cookieHeader.split(';');
  let userAuthRaw: string | null = null;
  let legacyAuthRaw: string | null = null;

  for (const cookie of cookies) {
    const trimmed = cookie.trim();
    const firstEqualIndex = trimmed.indexOf('=');
    if (firstEqualIndex <= 0) {
      continue;
    }
    const key = trimmed.substring(0, firstEqualIndex).trim();
    const value = trimmed.substring(firstEqualIndex + 1);
    if (key === AUTH_COOKIE_NAME && value && !userAuthRaw) {
      userAuthRaw = value;
    } else if (key === LEGACY_AUTH_COOKIE_NAME && value && !legacyAuthRaw) {
      legacyAuthRaw = value;
    }
  }

  const raw = userAuthRaw || legacyAuthRaw;
  return raw ? parseAuthCookiePayload(raw) : null;
}

// 从cookie获取认证信息 (服务端使用)
export function getAuthInfoFromCookie(request: NextRequest): AuthInfo | null {
  const authCookie =
    request.cookies.get(AUTH_COOKIE_NAME) ||
    request.cookies.get(LEGACY_AUTH_COOKIE_NAME);

  if (!authCookie) {
    return null;
  }

  return parseAuthCookiePayload(authCookie.value);
}

/**
 * 判断请求是否走 HTTPS，用于动态配置 Cookie Secure 属性。
 */
export function isHttpsRequest(request?: NextRequest): boolean {
  if (!request) {
    return false;
  }
  const forwardedProto = request.headers
    .get('x-forwarded-proto')
    ?.split(',')[0]
    ?.trim()
    ?.toLowerCase();
  if (forwardedProto) {
    return forwardedProto === 'https';
  }
  return request.nextUrl?.protocol === 'https:';
}

export function getAuthCookieOptions(
  request?: NextRequest,
  expires: Date = new Date(Date.now() + SESSION_MAX_AGE_MS),
) {
  return {
    path: '/',
    expires,
    sameSite: 'lax' as const, // 支持 PWA
    httpOnly: false, // 客户端 getAuthInfoFromBrowserCookie 需要读取
    secure: isHttpsRequest(request),
  };
}

// 生成签名（HMAC-SHA256）
export async function generateSignature(
  data: string,
  secret: string,
): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(data);

  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const signature = await crypto.subtle.sign('HMAC', key, messageData);
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// 生成认证 Cookie（载荷包含绑定时间戳的 HMAC-SHA256 签名，不含密码）
export async function generateAuthCookie(
  username?: string,
  role?: 'owner' | 'admin' | 'user',
): Promise<string> {
  const authData: AuthInfo = { role: role || 'user' };

  if (username && process.env.PASSWORD) {
    const now = Date.now();
    authData.username = username;
    authData.timestamp = now;
    authData.loginTime = now;
    authData.signature = await generateSignature(
      `${username}.${now}`,
      process.env.PASSWORD,
    );
  }

  return JSON.stringify(authData);
}

export function isSessionTimestampValid(
  timestamp: unknown,
  now = Date.now(),
): timestamp is number {
  if (typeof timestamp !== 'number' || !Number.isFinite(timestamp)) {
    return false;
  }
  if (timestamp > now + SESSION_CLOCK_SKEW_MS) {
    return false;
  }
  return now - timestamp <= SESSION_MAX_AGE_MS;
}

// 验证签名（HMAC-SHA256，与登录/中间件共用同一密钥口径）
export async function verifySignature(
  data: string,
  signature: string,
  secret: string,
): Promise<boolean> {
  if (
    !secret ||
    !signature ||
    signature.length % 2 !== 0 ||
    !/^[0-9a-f]+$/i.test(signature)
  ) {
    return false;
  }

  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(data);

  try {
    const key = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    );

    const bytes = signature.match(/.{2}/g);
    if (!bytes) {
      return false;
    }
    const signatureBuffer = new Uint8Array(
      bytes.map((byte) => parseInt(byte, 16)),
    );

    return await crypto.subtle.verify(
      'HMAC',
      key,
      signatureBuffer,
      messageData,
    );
  } catch (error) {
    console.error('签名验证失败:', error);
    return false;
  }
}

/**
 * 校验认证 Cookie 载荷：必须包含 username、合法签名与有效未过期时间戳。
 * 优先校验新格式 `${username}.${timestamp}`；仅当无 timestamp 时直接拒绝，
 * 避免客户端剥离或伪造 timestamp 延长过期时间。
 */
export async function verifyAuthInfo(
  authInfo: AuthInfo | null,
  secret: string | undefined,
): Promise<{ username: string; timestamp: number } | null> {
  if (!authInfo?.username || !authInfo.signature || !secret) {
    return null;
  }

  if (!isSessionTimestampValid(authInfo.timestamp)) {
    return null;
  }

  const isValid = await verifySignature(
    `${authInfo.username}.${authInfo.timestamp}`,
    authInfo.signature,
    secret,
  );
  return isValid
    ? { username: authInfo.username, timestamp: authInfo.timestamp }
    : null;
}

/**
 * 在路由内解析并严格验签真实登录用户：无 cookie、缺字段、过期或验签失败一律返回 null。
 */
export async function resolveRequestUser(
  request: NextRequest,
): Promise<{ username: string; timestamp: number } | null> {
  const authInfo = getAuthInfoFromCookie(request);
  return verifyAuthInfo(authInfo, process.env.PASSWORD);
}

/**
 * API 路由的用户鉴权守卫：校验 cookie 存在性、HMAC-SHA256 签名及会话有效期，
 * 失败一律返回 401 响应。与 ensureUserAccessOrResponse 保持相同约定。
 */
export async function requireUser(
  request: NextRequest,
): Promise<RequireUserResult> {
  const authInfo = getAuthInfoFromCookie(request);
  const verified = await verifyAuthInfo(authInfo, process.env.PASSWORD);
  if (!verified || !authInfo) {
    return {
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }
  return {
    authInfo: {
      ...authInfo,
      username: verified.username,
      timestamp: verified.timestamp,
    },
  };
}

// 从cookie获取认证信息 (客户端使用)
export function getAuthInfoFromBrowserCookie(): AuthInfo | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return getAuthInfoFromCookieHeader(document.cookie);
  } catch {
    return null;
  }
}
