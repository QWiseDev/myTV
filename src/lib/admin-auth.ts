import { NextRequest } from 'next/server';

import { AdminConfig } from '@/lib/admin.types';
import { getAuthInfoFromCookie } from '@/lib/auth';
import { getConfig } from '@/lib/config';

export type AdminRole = 'owner' | 'admin';

async function resolveRoleFromConfig(
  config: AdminConfig,
  username: string,
): Promise<AdminRole | null> {
  if (username === process.env.USERNAME) {
    return 'owner';
  }

  const user = config.UserConfig.Users.find((u) => u.username === username);
  if (user && !user.banned && user.role === 'admin') {
    return 'admin';
  }

  return null;
}

export async function getAdminRoleFromRequest(
  request: NextRequest,
): Promise<AdminRole | null> {
  const authInfo = getAuthInfoFromCookie(request);
  if (!authInfo) {
    return null;
  }

  const username = authInfo.username;
  if (!username) {
    return null;
  }

  if (username === process.env.USERNAME) {
    return 'owner';
  }

  const config = await getConfig();
  return resolveRoleFromConfig(config, username);
}
