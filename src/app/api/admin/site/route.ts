/* eslint-disable @typescript-eslint/no-explicit-any,no-console */

import { NextRequest, NextResponse } from 'next/server';

import { requireAdmin } from '@/lib/admin-auth';
import { clearConfigCache } from '@/lib/config';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

// 强制动态渲染，避免在构建时预生成
export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    if ('response' in admin) return admin.response;

    const body = await request.json();

    const {
      SiteName,
      Announcement,
      SearchDownstreamMaxPage,
      SiteInterfaceCacheTime,
      DoubanProxyType,
      DoubanProxy,
      DoubanImageProxyType,
      DoubanImageProxy,
      DisableYellowFilter,
      FluidSearch,
      CustomAdFilterCode,
      CustomAdFilterVersion,
      TMDBApiKey,
      TMDBLanguage,
      EnableTMDBActorSearch,
    } = body as {
      SiteName: string;
      Announcement: string;
      SearchDownstreamMaxPage: number;
      SiteInterfaceCacheTime: number;
      DoubanProxyType: string;
      DoubanProxy: string;
      DoubanImageProxyType: string;
      DoubanImageProxy: string;
      DisableYellowFilter: boolean;
      FluidSearch: boolean;
      CustomAdFilterCode?: string;
      CustomAdFilterVersion?: number;
      TMDBApiKey?: string;
      TMDBLanguage?: string;
      EnableTMDBActorSearch?: boolean;
    };

    // 参数校验
    if (
      typeof SiteName !== 'string' ||
      typeof Announcement !== 'string' ||
      typeof SearchDownstreamMaxPage !== 'number' ||
      typeof SiteInterfaceCacheTime !== 'number' ||
      typeof DoubanProxyType !== 'string' ||
      typeof DoubanProxy !== 'string' ||
      typeof DoubanImageProxyType !== 'string' ||
      typeof DoubanImageProxy !== 'string' ||
      typeof DisableYellowFilter !== 'boolean' ||
      typeof FluidSearch !== 'boolean'
    ) {
      return NextResponse.json({ error: '参数格式错误' }, { status: 400 });
    }

    const adminConfig = admin.config;

    const currentCustomAdFilterCode =
      adminConfig.SiteConfig.CustomAdFilterCode || '';
    const currentCustomAdFilterVersion =
      adminConfig.SiteConfig.CustomAdFilterVersion || 0;

    if (
      typeof CustomAdFilterCode === 'string' &&
      CustomAdFilterCode !== currentCustomAdFilterCode &&
      admin.role !== 'owner'
    ) {
      return NextResponse.json(
        { error: '只有站长可以修改自定义去广告脚本' },
        { status: 403 },
      );
    }

    // 更新缓存中的站点设置
    adminConfig.SiteConfig = {
      SiteName,
      Announcement,
      SearchDownstreamMaxPage,
      SiteInterfaceCacheTime,
      DoubanProxyType,
      DoubanProxy,
      DoubanImageProxyType,
      DoubanImageProxy,
      DisableYellowFilter,
      FluidSearch,
      CustomAdFilterCode:
        typeof CustomAdFilterCode === 'string'
          ? CustomAdFilterCode
          : currentCustomAdFilterCode,
      CustomAdFilterVersion:
        typeof CustomAdFilterVersion === 'number'
          ? CustomAdFilterVersion
          : currentCustomAdFilterVersion,
      TMDBApiKey: TMDBApiKey || '',
      TMDBLanguage: TMDBLanguage || 'zh-CN',
      EnableTMDBActorSearch: EnableTMDBActorSearch || false,
    };

    // 写入数据库
    await db.saveAdminConfig(adminConfig);

    // 清除配置缓存，强制下次重新从数据库读取
    clearConfigCache();

    return NextResponse.json(
      { ok: true },
      {
        headers: {
          'Cache-Control': 'no-store', // 不缓存结果
        },
      },
    );
  } catch (error) {
    console.error('更新站点配置失败:', error);
    return NextResponse.json(
      {
        error: '更新站点配置失败',
        details: (error as Error).message,
      },
      { status: 500 },
    );
  }
}
