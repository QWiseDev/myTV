/* eslint-disable no-console,@typescript-eslint/no-explicit-any */

import { NextResponse } from 'next/server';

import { getConfig } from '@/lib/config';

export const runtime = 'nodejs';

// 强制动态渲染，避免在构建时预生成
// 性能统计
const segmentStats = {
  requests: 0,
  errors: 0,
};

export async function GET(request: Request) {
  segmentStats.requests++;

  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url');
  const source = searchParams.get('moontv-source');

  if (!url) {
    segmentStats.errors++;
    return NextResponse.json({ error: 'Missing url' }, { status: 400 });
  }

  const config = await getConfig();
  const liveSource = config.LiveConfig?.find((s: any) => s.key === source);
  if (!liveSource) {
    segmentStats.errors++;
    return NextResponse.json({ error: 'Source not found' }, { status: 404 });
  }
  const ua = liveSource.ua || 'AptvPlayer/1.4.10';

  const controller = new AbortController();
  // 超时仅覆盖建连与响应头阶段；分片 body 由客户端背压自然调节
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    const decodedUrl = decodeURIComponent(url);

    const response = await fetch(decodedUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': ua,
        Accept: 'video/mp2t, video/*, */*',
        'Accept-Encoding': 'identity',
        'Cache-Control': 'no-cache',
      },
    });

    if (!response.ok) {
      segmentStats.errors++;
      return NextResponse.json(
        {
          error: `Failed to fetch segment: ${response.status} ${response.statusText}`,
        },
        { status: response.status >= 500 ? 500 : response.status }
      );
    }

    const headers = new Headers();

    // 设置内容类型
    const originalContentType = response.headers.get('Content-Type');
    if (originalContentType) {
      headers.set('Content-Type', originalContentType);
    } else {
      headers.set('Content-Type', 'video/mp2t');
    }

    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, HEAD');
    headers.set(
      'Access-Control-Allow-Headers',
      'Content-Type, Range, Origin, Accept, User-Agent'
    );
    headers.set('Accept-Ranges', 'bytes');
    headers.set(
      'Access-Control-Expose-Headers',
      'Content-Length, Content-Range, Content-Type, Accept-Ranges'
    );
    headers.set('Cache-Control', 'public, max-age=300'); // 5分钟缓存

    // 复制原始响应的重要头部
    const importantHeaders = [
      'Content-Length',
      'Content-Range',
      'Last-Modified',
      'ETag',
    ];
    importantHeaders.forEach((header) => {
      const value = response.headers.get(header);
      if (value) {
        headers.set(header, value);
      }
    });

    // Node fetch 的 body 本身就是 ReadableStream：直接透传，
    // 自带背压（客户端消费慢则上游读取慢），客户端断开时自动取消上游连接
    return new Response(response.body, { headers });
  } catch (error: any) {
    segmentStats.errors++;

    // 处理不同类型的错误
    if (error.name === 'AbortError') {
      return NextResponse.json(
        { error: 'Segment request timeout' },
        { status: 408 }
      );
    }

    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      return NextResponse.json(
        { error: 'Network connection failed' },
        { status: 503 }
      );
    }

    if (process.env.NODE_ENV === 'development') {
      console.error('Segment proxy error:', error);
    }
    return NextResponse.json(
      {
        error: 'Failed to fetch segment',
        details:
          process.env.NODE_ENV === 'development' ? error.message : undefined,
      },
      { status: 500 }
    );
  } finally {
    clearTimeout(timeoutId);
  }
}
