import { NextRequest, NextResponse } from 'next/server';

import { requireUser } from '@/lib/auth';
import { getConfig } from '@/lib/config';
import { ensureUserAccessOrResponse } from '@/lib/user-access';

export const runtime = 'nodejs';

// 普通用户也可以访问的 TVBox 配置接口
// 对非管理员脱敏全局认证凭据与 IP 白名单
export async function GET(request: NextRequest) {
  try {
    // 检查用户是否登录
    const auth = await requireUser(request);
    if (!auth.authInfo) return auth.response;
    const authInfo = auth.authInfo;

    const guardResult = await ensureUserAccessOrResponse(
      authInfo.username,
      authInfo.timestamp,
    );
    if ('response' in guardResult) {
      return guardResult.response;
    }

    // 获取配置
    const config = await getConfig();
    const rawSecurityConfig = config.TVBoxSecurityConfig || {
      enableAuth: false,
      token: '',
      enableIpWhitelist: false,
      allowedIPs: [],
      enableRateLimit: false,
      rateLimit: 60,
    };

    // 获取当前用户的专属配置
    const currentUser = config.UserConfig.Users.find(
      (u) => u.username === authInfo.username,
    );
    const isAdmin =
      authInfo.username === process.env.USERNAME ||
      currentUser?.role === 'admin';

    const securityConfig = isAdmin
      ? rawSecurityConfig
      : {
          ...rawSecurityConfig,
          token: '',
          allowedIPs: [],
        };

    const userTvboxToken = currentUser?.tvboxToken || '';
    const userEnabledSources = currentUser?.tvboxEnabledSources || [];

    // 获取所有可用源（用于管理界面选择）
    const allSources = (config.SourceConfig || [])
      .filter((s) => !s.disabled)
      .map((s) => ({ key: s.key, name: s.name }));

    // 返回配置（普通用户仅获得非敏感结构与个人专属配置）
    return NextResponse.json(
      {
        securityConfig,
        siteName: config.SiteConfig?.SiteName || '卡拉米影视',
        userToken: userTvboxToken,
        userEnabledSources,
        allSources,
      },
      {
        headers: {
          'Cache-Control': 'private, no-store',
        },
      },
    );
  } catch (error) {
    console.error('获取 TVBox 配置失败:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 },
    );
  }
}
