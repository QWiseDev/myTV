/* eslint-disable no-console */

import { NextRequest, NextResponse } from 'next/server';

import { getConfig } from '@/lib/config';
import { CURRENT_VERSION } from '@/lib/version';

export const runtime = 'nodejs';

// 强制动态渲染，避免在构建时预生成
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(_request: NextRequest) {

  const config = await getConfig();

  const result: Record<string, unknown> = {
    SiteName: config.SiteConfig.SiteName,
    DoubanProxyType: config.SiteConfig.DoubanProxyType,
    DoubanProxy: config.SiteConfig.DoubanProxy,
    DoubanImageProxyType: config.SiteConfig.DoubanImageProxyType,
    DoubanImageProxy: config.SiteConfig.DoubanImageProxy,
    DisableYellowFilter: config.SiteConfig.DisableYellowFilter,
    FluidSearch: config.SiteConfig.FluidSearch,
    StorageType: process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage',
    Version: CURRENT_VERSION,
  };

  // 添加 Telegram 登录配置（仅公开必要信息）
  if (config.TelegramAuthConfig?.enabled) {
    result.TelegramAuthConfig = {
      enabled: true,
      botUsername: config.TelegramAuthConfig.botUsername,
      buttonSize: config.TelegramAuthConfig.buttonSize || 'large',
      showAvatar: config.TelegramAuthConfig.showAvatar ?? true,
      requestWriteAccess: config.TelegramAuthConfig.requestWriteAccess ?? false,
      // 注意：不返回 botToken，保护敏感信息
    };
  }

  return NextResponse.json(result);
}
