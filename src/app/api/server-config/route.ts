/* eslint-disable no-console */

import { NextRequest, NextResponse } from 'next/server';

import { getConfig } from '@/lib/config';
import { CURRENT_VERSION } from '@/lib/version';

export const runtime = 'nodejs';

// 强制动态渲染，避免在构建时预生成
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
    StorageType: process.env.NEXT_PUBLIC_STORAGE_TYPE || 'redis',
    Version: CURRENT_VERSION,
  };

  return NextResponse.json(result);
}
