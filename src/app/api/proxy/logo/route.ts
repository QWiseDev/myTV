/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextResponse } from 'next/server';

import { getConfig } from '@/lib/config';
import { resolveAndValidateRemoteUrl, safeFetch } from '@/lib/url-safety';

export const runtime = 'nodejs';

// 强制动态渲染，避免在构建时预生成
// Logo 缓存管理
const logoCache = new Map<
  string,
  { data: ArrayBuffer; contentType: string; timestamp: number; etag?: string }
>();
const LOGO_CACHE_TTL = 86400000; // 24小时
const MAX_CACHE_SIZE = 500;
const MAX_LOGO_BYTES = 5 * 1024 * 1024;

function applySvgSecurityHeaders(headers: Headers, contentType: string): void {
  if (contentType.toLowerCase().includes('svg')) {
    headers.set('Content-Security-Policy', "sandbox; default-src 'none';");
    headers.set('X-Content-Type-Options', 'nosniff');
  }
}

// 性能统计
const logoStats = {
  requests: 0,
  errors: 0,
  cacheHits: 0,
  avgResponseTime: 0,
  totalBytes: 0,
};

// 清理过期缓存
function cleanupExpiredCache() {
  const now = Date.now();

  // 使用 Array.from() 来避免迭代器问题
  const cacheEntries = Array.from(logoCache.entries());
  for (const [key, value] of cacheEntries) {
    if (now - value.timestamp > LOGO_CACHE_TTL) {
      logoCache.delete(key);
    }
  }

  // 如果缓存仍然过大，删除最老的条目
  if (logoCache.size > MAX_CACHE_SIZE) {
    const entries = Array.from(logoCache.entries()).sort(
      (a, b) => a[1].timestamp - b[1].timestamp,
    );
    const toDelete = entries.slice(0, entries.length - MAX_CACHE_SIZE);
    toDelete.forEach(([key]) => logoCache.delete(key));
  }
}

// 检测图片格式和大小
function validateImageResponse(
  contentType: string | null,
  contentLength: number,
): { isValid: boolean; reason?: string } {
  if (!contentType) {
    return { isValid: true }; // 允许没有 content-type 的响应
  }

  const validTypes = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/svg+xml',
    'image/x-icon',
    'image/vnd.microsoft.icon',
  ];
  const isValidType = validTypes.some((type) =>
    contentType.toLowerCase().includes(type),
  );

  if (!isValidType) {
    return { isValid: false, reason: `Invalid content type: ${contentType}` };
  }

  // 限制图片大小为 5MB
  if (contentLength > 5 * 1024 * 1024) {
    return {
      isValid: false,
      reason: `Image too large: ${contentLength} bytes`,
    };
  }

  return { isValid: true };
}

export async function GET(request: Request) {
  const startTime = Date.now();
  logoStats.requests++;

  const { searchParams } = new URL(request.url);
  const imageUrl = searchParams.get('url');
  const source = searchParams.get('source'); // 注意这里是 'source' 不是 'moontv-source'

  if (!imageUrl || !source) {
    logoStats.errors++;
    return NextResponse.json(
      { error: !imageUrl ? 'Missing image URL' : 'Missing source' },
      { status: 400 },
    );
  }

  const config = await getConfig();
  const liveSource = config.LiveConfig?.find((s: any) => s.key === source);
  if (!liveSource || liveSource.disabled) {
    logoStats.errors++;
    return NextResponse.json({ error: 'Source not found' }, { status: 404 });
  }
  const ua = liveSource.ua || 'AptvPlayer/1.4.10';

  const targetUrl = imageUrl.trim();
  try {
    await resolveAndValidateRemoteUrl(targetUrl, { allowHttp: true });
  } catch (validationError) {
    logoStats.errors++;
    return NextResponse.json(
      {
        error:
          validationError instanceof Error
            ? validationError.message
            : 'Invalid or restricted image URL',
      },
      { status: 400 },
    );
  }

  const cacheKey = `${source}-${targetUrl}`;

  // 检查缓存
  const cached = logoCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < LOGO_CACHE_TTL) {
    logoStats.cacheHits++;

    const responseTime = Date.now() - startTime;
    logoStats.avgResponseTime =
      (logoStats.avgResponseTime * (logoStats.requests - 1) + responseTime) /
      logoStats.requests;

    const hitHeaders = new Headers({
      'Content-Type': cached.contentType,
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=604800, s-maxage=604800, immutable',
      'X-Cache': 'HIT',
      'Content-Length': cached.data.byteLength.toString(),
      ...(cached.etag && { ETag: cached.etag }),
    });
    applySvgSecurityHeaders(hitHeaders, cached.contentType);

    return new Response(cached.data, {
      headers: hitHeaders,
    });
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000); // 15秒超时

  try {
    const imageResponse = await safeFetch(targetUrl, {
      cache: 'no-cache',
      signal: controller.signal,
      headers: {
        'User-Agent': ua,
        Accept:
          'image/webp,image/avif,image/png,image/jpeg,image/gif,image/svg+xml,*/*;q=0.8',
        'Accept-Encoding': 'identity',
        'Cache-Control': 'no-cache',
        ...(cached?.etag && { 'If-None-Match': cached.etag }),
      },
    });

    clearTimeout(timeoutId);

    // 如果是 304 Not Modified，返回缓存的数据
    if (imageResponse.status === 304 && cached) {
      logoStats.cacheHits++;

      const responseTime = Date.now() - startTime;
      logoStats.avgResponseTime =
        (logoStats.avgResponseTime * (logoStats.requests - 1) + responseTime) /
        logoStats.requests;

      const notModifiedHeaders = new Headers({
        'Content-Type': cached.contentType,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=604800, immutable',
        'X-Cache': '304-HIT',
        'Content-Length': cached.data.byteLength.toString(),
      });
      applySvgSecurityHeaders(notModifiedHeaders, cached.contentType);

      return new Response(cached.data, {
        headers: notModifiedHeaders,
      });
    }

    if (!imageResponse.ok) {
      logoStats.errors++;
      return NextResponse.json(
        {
          error: `Failed to fetch image: ${imageResponse.status} ${imageResponse.statusText}`,
        },
        { status: imageResponse.status >= 500 ? 500 : imageResponse.status },
      );
    }

    const contentType =
      imageResponse.headers.get('content-type') || 'image/jpeg';
    const contentLength = parseInt(
      imageResponse.headers.get('content-length') || '0',
      10,
    );
    const etag = imageResponse.headers.get('ETag');

    // 验证图片
    const validation = validateImageResponse(contentType, contentLength);
    if (!validation.isValid) {
      logoStats.errors++;
      return NextResponse.json({ error: validation.reason }, { status: 400 });
    }

    if (!imageResponse.body) {
      logoStats.errors++;
      return NextResponse.json(
        { error: 'Image response has no body' },
        { status: 500 },
      );
    }

    // 读取图片数据并二次校验实际字节大小（防止缺失 Content-Length 绕过）
    const imageData = await imageResponse.arrayBuffer();
    if (imageData.byteLength > MAX_LOGO_BYTES) {
      logoStats.errors++;
      return NextResponse.json(
        { error: `Image too large: ${imageData.byteLength} bytes` },
        { status: 400 },
      );
    }

    // 缓存图片数据
    logoCache.set(cacheKey, {
      data: imageData,
      contentType,
      timestamp: Date.now(),
      etag: etag || undefined,
    });

    // 定期清理缓存
    if (logoCache.size > MAX_CACHE_SIZE || logoStats.requests % 100 === 0) {
      cleanupExpiredCache();
    }

    // 更新统计信息
    logoStats.totalBytes += imageData.byteLength;
    const responseTime = Date.now() - startTime;
    logoStats.avgResponseTime =
      (logoStats.avgResponseTime * (logoStats.requests - 1) + responseTime) /
      logoStats.requests;

    // 创建响应头
    const headers = new Headers();
    headers.set('Content-Type', contentType);
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS, HEAD');
    headers.set(
      'Cache-Control',
      'public, max-age=604800, s-maxage=604800, immutable',
    ); // 7天缓存
    headers.set('X-Cache', 'MISS');
    headers.set('Content-Length', imageData.byteLength.toString());
    headers.set('Vary', 'Accept-Encoding');
    applySvgSecurityHeaders(headers, contentType);

    if (etag) {
      headers.set('ETag', etag);
    } else {
      // 生成简单的 ETag
      const hash = Buffer.from(targetUrl).toString('base64').slice(0, 16);
      headers.set('ETag', `"${hash}"`);
    }

    return new Response(imageData, {
      status: 200,
      headers,
    });
  } catch (error: any) {
    logoStats.errors++;
    clearTimeout(timeoutId);

    // 处理不同类型的错误
    if (error.name === 'AbortError') {
      return NextResponse.json(
        { error: 'Image request timeout' },
        { status: 408 },
      );
    }

    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      return NextResponse.json(
        { error: 'Network connection failed' },
        { status: 503 },
      );
    }

    if (process.env.NODE_ENV === 'development') {
      console.error('Logo proxy error:', error);
    }
    return NextResponse.json(
      {
        error: 'Error fetching image',
        details:
          process.env.NODE_ENV === 'development' ? error.message : undefined,
      },
      { status: 500 },
    );
  } finally {
    clearTimeout(timeoutId);
  }
}
