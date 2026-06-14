/* eslint-disable no-console */

import { NextRequest, NextResponse } from 'next/server';

import { getConfig } from '@/lib/config';

export const runtime = 'nodejs';

// 强制动态渲染，避免在构建时预生成
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(_request: NextRequest) {
  console.error('[API-SOURCES] 请求开始处理');
  try {
    // 清除缓存
    const { clearConfigCache } = await import('@/lib/config');
    clearConfigCache();
    console.error('[API-SOURCES] 已清除配置缓存');

    console.error('[API-SOURCES] 重新加载配置...');
    const config = await getConfig();
    console.error('[API-SOURCES] 配置加载完成');

    if (!config) {
      console.error('[API-SOURCES] 错误: 配置为 null');
      return NextResponse.json({ error: '配置未找到' }, { status: 404 });
    }

    console.error(`[API-SOURCES] LiveConfig 存在: ${!!config.LiveConfig}`);
    console.error(`[API-SOURCES] LiveConfig 长度: ${config.LiveConfig?.length || 0}`);

    if (config.LiveConfig && config.LiveConfig.length > 0) {
      config.LiveConfig.forEach((source, index) => {
        console.error(`[API-SOURCES] [${index}] ${source.name} (${source.key}) - disabled: ${source.disabled}`);
      });
    }

    // 确保 LiveConfig 存在
    if (!config.LiveConfig) {
      return NextResponse.json({
        success: true,
        data: [],
        message: 'LiveConfig 不存在',
        forced: true,
        timestamp: new Date().toISOString(),
      }, {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, s-maxage=0',
          'Pragma': 'no-cache',
          'Expires': '0',
          'Surrogate-Control': 'no-store, no-cache, must-revalidate, max-age=0',
          'Vary': '*',
          'ETag': `"sources-empty-force-${Date.now()}-${Math.random()}"`,
        },
      });
    }

    // 过滤出所有非 disabled 的直播源
    const liveSources = config.LiveConfig.filter(
      (source) => !source.disabled
    );

    console.error(`[API-SOURCES] 过滤后得到 ${liveSources.length} 个可用直播源`);

    const response = {
      success: true,
      data: liveSources,
      timestamp: new Date().toISOString(),
      debug: {
        total: config.LiveConfig.length,
        filtered: liveSources.length,
      },
      forced: true,
      message: '强制刷新数据'
    };

    console.error('[API-SOURCES] 返回响应:', JSON.stringify(response, null, 2));

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, s-maxage=0',
        'Pragma': 'no-cache',
        'Expires': '0',
        'Surrogate-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        'Vary': '*',
        'ETag': `"sources-force-${Date.now()}-${Math.random()}"`,
      },
    });
  } catch (error) {
    console.error('[API-SOURCES] 获取直播源失败:', error);
    return NextResponse.json({ error: '获取直播源失败' }, { status: 500 });
  }
}
