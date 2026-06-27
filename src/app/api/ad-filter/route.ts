/* eslint-disable no-console */

import { NextResponse } from 'next/server';

import { getConfig } from '@/lib/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    const config = await getConfig();
    const { searchParams } = new URL(request.url);
    const full = searchParams.get('full') === 'true';
    const version = config.SiteConfig?.CustomAdFilterVersion || 0;

    if (full) {
      return NextResponse.json({
        code: config.SiteConfig?.CustomAdFilterCode || '',
        version,
      });
    }

    return NextResponse.json({ version });
  } catch (error) {
    console.error('获取去广告代码配置失败:', error);
    return NextResponse.json(
      {
        error: '获取配置失败',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
