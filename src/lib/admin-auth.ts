import { NextRequest, NextResponse } from 'next/server';

import { AdminConfig } from '@/lib/admin.types';
import { requireUser, resolveRequestUser } from '@/lib/auth';
import { getConfig } from '@/lib/config';

export type AdminRole = 'owner' | 'admin';

function isUserTokenRevoked(
  user: AdminConfig['UserConfig']['Users'][number],
  authTimestamp?: number,
): boolean {
  return (
    typeof authTimestamp === 'number' &&
    typeof user.tokenInvalidBefore === 'number' &&
    authTimestamp < user.tokenInvalidBefore
  );
}

async function resolveRoleFromConfig(
  config: AdminConfig,
  username: string,
  authTimestamp?: number,
): Promise<AdminRole | null> {
  if (username === process.env.USERNAME) {
    return 'owner';
  }

  const user = config.UserConfig.Users.find((u) => u.username === username);
  if (
    user &&
    !user.banned &&
    user.role === 'admin' &&
    !isUserTokenRevoked(user, authTimestamp)
  ) {
    return 'admin';
  }

  return null;
}

export async function getAdminRoleByUsername(
  username: string,
  authTimestamp?: number,
): Promise<AdminRole | null> {
  if (!username) {
    return null;
  }

  if (username === process.env.USERNAME) {
    return 'owner';
  }

  const config = await getConfig();
  return resolveRoleFromConfig(config, username, authTimestamp);
}

export async function getAdminRoleFromRequest(
  request: NextRequest,
): Promise<AdminRole | null> {
  const verified = await resolveRequestUser(request);
  if (!verified) {
    return null;
  }

  return getAdminRoleByUsername(verified.username, verified.timestamp);
}

type RequireAdminResult =
  | {
      username: string;
      role: AdminRole;
      config: AdminConfig;
      timestamp?: number;
      response?: undefined;
    }
  | {
      username?: undefined;
      role?: undefined;
      config?: undefined;
      timestamp?: undefined;
      response: NextResponse;
    };

/**
 * 统一的管理员 / 站长鉴权守卫：
 * - 未认证 / 验签失败 / 会话过期或被吊销 → 401
 * - 已认证但无管理员权限（或要求 ownerOnly 但为 admin）→ 403
 */
export async function requireAdmin(
  request: NextRequest,
  options: { ownerOnly?: boolean; forbiddenMessage?: string } = {},
): Promise<RequireAdminResult> {
  const auth = await requireUser(request);
  if (!auth.authInfo) {
    return { response: auth.response };
  }

  const { username, timestamp } = auth.authInfo;
  const config = await getConfig();

  if (username === process.env.USERNAME) {
    return { username, role: 'owner', config, timestamp };
  }

  const user = config.UserConfig.Users.find((u) => u.username === username);
  if (!user) {
    return {
      response: NextResponse.json({ error: '用户不存在' }, { status: 401 }),
    };
  }
  if (user.banned) {
    return {
      response: NextResponse.json({ error: '用户已被封禁' }, { status: 401 }),
    };
  }
  if (isUserTokenRevoked(user, timestamp)) {
    return {
      response: NextResponse.json(
        { error: '登录状态已失效，请重新登录' },
        { status: 401 },
      ),
    };
  }

  if (user.role !== 'admin') {
    return {
      response: NextResponse.json(
        { error: options.forbiddenMessage || '权限不足' },
        { status: 403 },
      ),
    };
  }

  if (options.ownerOnly) {
    return {
      response: NextResponse.json(
        { error: options.forbiddenMessage || '权限不足，仅站长可执行此操作' },
        { status: 403 },
      ),
    };
  }

  return { username, role: 'admin', config, timestamp };
}
