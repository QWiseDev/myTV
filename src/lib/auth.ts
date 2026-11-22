import { NextRequest, NextResponse } from 'next/server';

// 从cookie获取认证信息 (服务端使用)
export function getAuthInfoFromCookie(request: NextRequest): {
  username?: string;
  signature?: string;
  timestamp?: number;
  loginTime?: number;
} | null {
  // 尝试新的 cookie 名称 user_auth，如果没有则尝试旧的 auth
  const authCookie =
    request.cookies.get('user_auth') || request.cookies.get('auth');

  if (!authCookie) {
    return null;
  }

  try {
    const decoded = decodeURIComponent(authCookie.value);
    const authData = JSON.parse(decoded);
    return authData;
  } catch (error) {
    return null;
  }
}

export interface AuthInfoWithUsername {
  username: string;
  signature?: string;
  timestamp?: number;
  loginTime?: number;
}

// 两个成员都显式声明属性（optional + undefined），确保 TS 4.9 下 `!auth.authInfo` 能正确收窄
type RequireUserResult =
  | { authInfo: AuthInfoWithUsername; response?: undefined }
  | { authInfo?: undefined; response: NextResponse };

/**
 * API 路由的用户鉴权守卫：无登录 cookie 或缺少 username 时返回 401 响应。
 * 与 ensureUserAccessOrResponse 保持相同约定 —— 用 `'response' in result` 判定失败。
 */
export function requireUser(request: NextRequest): RequireUserResult {
  const authInfo = getAuthInfoFromCookie(request);
  if (!authInfo || !authInfo.username) {
    return {
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }
  return { authInfo: authInfo as AuthInfoWithUsername };
}

// 验证签名（HMAC-SHA256，与登录/中间件共用同一密钥口径）
export async function verifySignature(
  data: string,
  signature: string,
  secret: string,
): Promise<boolean> {
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

    const signatureBuffer = new Uint8Array(
      signature.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) || [],
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
 * 在路由内解析真实登录用户：无 cookie、缺少 username/signature 或验签失败
 * 一律返回 null（视为访客）。用于中间件豁免路由的「访客感知」鉴权，
 * 防止伪造 cookie username 绕过用户级源过滤。
 */
export async function resolveRequestUser(
  request: NextRequest,
): Promise<{ username: string } | null> {
  const authInfo = getAuthInfoFromCookie(request);
  if (!authInfo?.username || !authInfo.signature || !process.env.PASSWORD) {
    return null;
  }

  const isValid = await verifySignature(
    authInfo.username,
    authInfo.signature,
    process.env.PASSWORD,
  );
  return isValid ? { username: authInfo.username } : null;
}

// 从cookie获取认证信息 (客户端使用)
export function getAuthInfoFromBrowserCookie(): {
  username?: string;
  signature?: string;
  timestamp?: number;
  loginTime?: number;
  role?: 'owner' | 'admin' | 'user';
} | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    // 解析 document.cookie
    const cookies = document.cookie.split(';').reduce(
      (acc, cookie) => {
        const trimmed = cookie.trim();
        const firstEqualIndex = trimmed.indexOf('=');

        if (firstEqualIndex > 0) {
          const key = trimmed.substring(0, firstEqualIndex);
          const value = trimmed.substring(firstEqualIndex + 1);
          if (key && value) {
            acc[key] = value;
          }
        }

        return acc;
      },
      {} as Record<string, string>,
    );

    // 尝试新的 cookie 名称 user_auth，如果没有则尝试旧的 auth
    const authCookie = cookies['user_auth'] || cookies['auth'];
    if (!authCookie) {
      return null;
    }

    // 处理可能的双重编码
    let decoded = decodeURIComponent(authCookie);

    // 如果解码后仍然包含 %，说明是双重编码，需要再次解码
    if (decoded.includes('%')) {
      decoded = decodeURIComponent(decoded);
    }

    const authData = JSON.parse(decoded);
    return authData;
  } catch (error) {
    return null;
  }
}
