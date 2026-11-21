/* eslint-disable no-console,@typescript-eslint/no-explicit-any */

import { NextResponse } from 'next/server';

import { filterAdsFromM3U8 } from '@/lib/ad-filter';
import { getConfig } from '@/lib/config';
import { getBaseUrl, resolveUrl } from '@/lib/live';
import {
  buildExternalSegmentUrl,
  buildFetchViaProxyUrl,
  resolveSegmentProxy,
  SegmentProxyConfig,
} from '@/lib/live-proxy';
import { withAbortableTimeout } from '@/lib/promise-timeout';

export const runtime = 'nodejs';

// 强制动态渲染，避免在构建时预生成
// 性能统计
const stats = {
  requests: 0,
  errors: 0,
  avgResponseTime: 0,
  totalBytes: 0,
};

export async function GET(request: Request) {
  const startTime = Date.now();
  stats.requests++;

  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url');
  const source = searchParams.get('moontv-source');

  if (!url) {
    stats.errors++;
    return NextResponse.json({ error: 'Missing url' }, { status: 400 });
  }

  const config = await getConfig();
  const liveSource = config.LiveConfig?.find((s: any) => s.key === source);
  if (!liveSource) {
    stats.errors++;
    return NextResponse.json({ error: 'Source not found' }, { status: 404 });
  }
  const ua = liveSource.ua || 'AptvPlayer/1.4.10';
  // 直连判定：仅按源配置 direct（管理后台按源开启）
  const allowDirect = liveSource.direct === true;
  // 独立分片代理（管理后台配置优先，回落环境变量）：分片与播放列表均经其转发
  const segProxy = resolveSegmentProxy(config);

  let response: Response | null = null;
  let responseUsed = false;

  try {
    const decodedUrl = decodeURIComponent(url);

    // 参考 hls.js fetch-loader，构建标准headers
    const headers: Record<string, string> = {
      'User-Agent': ua,
      Accept:
        'application/vnd.apple.mpegurl, application/x-mpegurl, application/octet-stream, */*',
      'Accept-Encoding': 'identity', // 避免gzip压缩导致的处理复杂性
      'Accept-Language': 'en-US,en;q=0.9',
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
    };

    // 配置了独立分片代理时，播放列表也经其代取（主站与源不通时仍可取到）
    const fetchUrl = segProxy
      ? buildFetchViaProxyUrl(segProxy, decodedUrl, ua)
      : decodedUrl;

    response = await withAbortableTimeout(
      (signal) =>
        fetch(fetchUrl, {
          cache: 'no-cache',
          redirect: 'follow',
          credentials: 'same-origin',
          signal,
          headers: new Headers(headers),
        }),
      15000, // 15秒超时
    );

    // 参考 hls.js fetch-loader 的错误处理逻辑
    if (!response.ok) {
      stats.errors++;

      // 直接返回原始的HTTP错误，让hls.js处理
      // 不返回JSON，因为hls.js期望的是M3U8内容或标准HTTP错误
      return new NextResponse(
        `HTTP Error ${response.status}: ${response.statusText}`,
        {
          status: response.status,
          statusText: response.statusText,
          headers: {
            'Content-Type': 'text/plain',
            'Access-Control-Allow-Origin': '*',
          },
        },
      );
    }

    const contentType = response.headers.get('Content-Type') || '';
    const contentLength = parseInt(
      response.headers.get('Content-Length') || '0',
      10,
    );

    // 检查内容是否为 M3U8
    const isM3U8 =
      contentType.toLowerCase().includes('mpegurl') ||
      contentType.toLowerCase().includes('octet-stream') ||
      decodedUrl.includes('.m3u8');

    if (isM3U8) {
      // 获取最终的响应URL（处理重定向后的URL）
      // 经独立代理代取时，最终地址由 X-Final-Url 头带回（response.url 是代理地址）
      const finalUrl =
        (segProxy && response.headers.get('X-Final-Url')) || response.url;
      const m3u8Content = await response.text();
      responseUsed = true;

      // 更新统计信息
      if (contentLength > 0) {
        stats.totalBytes += contentLength;
      } else {
        stats.totalBytes += m3u8Content.length;
      }

      // 使用最终的响应URL作为baseUrl，而不是原始的请求URL
      const baseUrl = getBaseUrl(finalUrl);

      const filteredContent = filterAdsFromM3U8(m3u8Content, {
        type: source || '',
        customCode: config.SiteConfig?.CustomAdFilterCode || '',
        onCustomError: (error) => {
          console.error('执行自定义去广告代码失败，使用默认规则:', error);
        },
      });

      // 重写 M3U8 内容
      const modifiedContent = rewriteM3U8Content(
        filteredContent,
        baseUrl,
        request,
        allowDirect,
        source,
        ua,
        segProxy,
      );

      const headers = new Headers();
      headers.set(
        'Content-Type',
        contentType || 'application/vnd.apple.mpegurl',
      );
      headers.set('Access-Control-Allow-Origin', '*');
      headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, HEAD');
      headers.set(
        'Access-Control-Allow-Headers',
        'Content-Type, Range, Origin, Accept, User-Agent',
      );
      headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
      headers.set('Pragma', 'no-cache');
      headers.set('Expires', '0');
      headers.set(
        'Access-Control-Expose-Headers',
        'Content-Length, Content-Range, Content-Type',
      );
      headers.set('Content-Length', modifiedContent.length.toString());

      // 更新性能统计
      const responseTime = Date.now() - startTime;
      stats.avgResponseTime =
        (stats.avgResponseTime * (stats.requests - 1) + responseTime) /
        stats.requests;

      return new Response(modifiedContent, { headers, status: 200 });
    }

    // 直接代理非M3U8内容
    const responseHeaders = new Headers();
    responseHeaders.set(
      'Content-Type',
      response.headers.get('Content-Type') || 'application/vnd.apple.mpegurl',
    );
    responseHeaders.set('Access-Control-Allow-Origin', '*');
    responseHeaders.set(
      'Access-Control-Allow-Methods',
      'GET, POST, OPTIONS, HEAD',
    );
    responseHeaders.set(
      'Access-Control-Allow-Headers',
      'Content-Type, Range, Origin, Accept, User-Agent',
    );
    responseHeaders.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    responseHeaders.set(
      'Access-Control-Expose-Headers',
      'Content-Length, Content-Range, Content-Type',
    );

    // 复制原始响应的相关头部
    const originalHeaders = [
      'Content-Length',
      'Content-Range',
      'Accept-Ranges',
    ];
    originalHeaders.forEach((header) => {
      const value = response?.headers.get(header);
      if (value) {
        responseHeaders.set(header, value);
      }
    });

    // 更新统计信息
    if (contentLength > 0) {
      stats.totalBytes += contentLength;
    }

    const responseTime = Date.now() - startTime;
    stats.avgResponseTime =
      (stats.avgResponseTime * (stats.requests - 1) + responseTime) /
      stats.requests;

    return new Response(response?.body, {
      status: 200,
      headers: responseHeaders,
    });
  } catch (error: any) {
    stats.errors++;

    // 处理不同类型的错误
    if (error.name === 'TimeoutError' || error.name === 'AbortError') {
      return NextResponse.json({ error: 'Request timeout' }, { status: 408 });
    }

    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      return NextResponse.json(
        { error: 'Network connection failed' },
        { status: 503 },
      );
    }

    if (process.env.NODE_ENV === 'development') {
      console.error('M3U8 proxy error:', error);
    }
    return NextResponse.json(
      {
        error: 'Failed to fetch m3u8',
        details:
          process.env.NODE_ENV === 'development' ? error.message : undefined,
      },
      { status: 500 },
    );
  } finally {
    // 确保 response 被正确关闭以释放资源
    if (response && !responseUsed) {
      try {
        response.body?.cancel();
      } catch (error) {
        if (process.env.NODE_ENV === 'development') {
          console.warn('Failed to close response body:', error);
        }
      }
    }

    // 定期打印统计信息
  }
}

function rewriteM3U8Content(
  content: string,
  baseUrl: string,
  req: Request,
  allowDirect: boolean,
  source: string | null,
  ua: string,
  segProxy: SegmentProxyConfig | null,
) {
  // 从 referer 头提取协议信息
  const referer = req.headers.get('referer');
  let protocol = 'http';
  if (referer) {
    try {
      const refererUrl = new URL(referer);
      protocol = refererUrl.protocol.replace(':', '');
    } catch (error) {
      // ignore
    }
  }

  const host = req.headers.get('host');
  const proxyBase = `${protocol}://${host}/api/proxy`;

  const lines = content.split('\n');
  const rewrittenLines: string[] = [];
  const variables = new Map<string, string>(); // 用于 EXT-X-DEFINE 变量替换

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();

    // 处理 TS 片段 URL 和其他媒体文件
    if (line && !line.startsWith('#')) {
      const resolvedUrl = resolveUrl(baseUrl, line);
      // 直连模式透传；配置独立代理时指向该服务；否则走内置分片代理
      let targetUrl: string;
      if (allowDirect) {
        targetUrl = resolvedUrl;
      } else if (segProxy) {
        targetUrl = buildExternalSegmentUrl(segProxy, resolvedUrl, ua);
      } else {
        targetUrl = createProxyUrl(proxyBase, 'segment', resolvedUrl, source);
      }
      rewrittenLines.push(targetUrl);
      continue;
    }

    // 处理变量定义 (EXT-X-DEFINE)
    if (line.startsWith('#EXT-X-DEFINE:')) {
      line = processDefineVariables(line, variables);
    }

    // 处理 EXT-X-MAP 标签中的 URI
    if (line.startsWith('#EXT-X-MAP:')) {
      line = rewriteTagUri(line, baseUrl, proxyBase, source, variables, {
        endpoint: 'segment',
      });
    }

    // 处理 EXT-X-KEY 标签中的 URI
    if (line.startsWith('#EXT-X-KEY:')) {
      line = rewriteTagUri(line, baseUrl, proxyBase, source, variables, {
        endpoint: 'key',
      });
    }

    // 处理 EXT-X-MEDIA 标签中的 URI (音频轨道等)
    if (line.startsWith('#EXT-X-MEDIA:')) {
      line = rewriteTagUri(line, baseUrl, proxyBase, source, variables, {
        endpoint: 'm3u8',
        onInvalid: 'strip',
      });
    }

    // 处理 LL-HLS 部分片段 (EXT-X-PART)
    if (line.startsWith('#EXT-X-PART:')) {
      line = rewriteTagUri(line, baseUrl, proxyBase, source, variables, {
        endpoint: 'segment',
      });
    }

    // 处理内容导向 (EXT-X-CONTENT-STEERING)
    if (line.startsWith('#EXT-X-CONTENT-STEERING:')) {
      line = rewriteTagUri(line, baseUrl, proxyBase, source, variables, {
        attr: 'SERVER-URI',
        endpoint: 'm3u8',
      });
    }

    // 处理会话数据 (EXT-X-SESSION-DATA) - 可能包含 URI
    if (line.startsWith('#EXT-X-SESSION-DATA:')) {
      line = rewriteTagUri(line, baseUrl, proxyBase, source, variables, {
        endpoint: 'segment',
      });
    }

    // 处理会话密钥 (EXT-X-SESSION-KEY)
    if (line.startsWith('#EXT-X-SESSION-KEY:')) {
      line = rewriteTagUri(line, baseUrl, proxyBase, source, variables, {
        endpoint: 'key',
      });
    }

    // 处理嵌套的 M3U8 文件 (EXT-X-STREAM-INF)
    if (line.startsWith('#EXT-X-STREAM-INF:')) {
      rewrittenLines.push(line);
      // 下一行通常是 M3U8 URL
      if (i + 1 < lines.length) {
        i++;
        const nextLine = lines[i].trim();
        if (nextLine && !nextLine.startsWith('#')) {
          let resolvedUrl = resolveUrl(baseUrl, nextLine);
          resolvedUrl = substituteVariables(resolvedUrl, variables);
          const proxyUrl = createProxyUrl(
            proxyBase,
            'm3u8',
            resolvedUrl,
            source,
          );
          rewrittenLines.push(proxyUrl);
        } else {
          rewrittenLines.push(nextLine);
        }
      }
      continue;
    }

    // 处理日期范围标签中的 URI (EXT-X-DATERANGE)
    if (line.startsWith('#EXT-X-DATERANGE:')) {
      line = rewriteDateRangeUri(line, baseUrl, proxyBase, source, variables);
    }

    // 处理预加载提示 (EXT-X-PRELOAD-HINT)
    if (line.startsWith('#EXT-X-PRELOAD-HINT:')) {
      line = rewriteTagUri(line, baseUrl, proxyBase, source, variables, {
        endpoint: 'segment',
      });
    }

    // 处理渲染报告 (EXT-X-RENDITION-REPORT)
    if (line.startsWith('#EXT-X-RENDITION-REPORT:')) {
      line = rewriteTagUri(line, baseUrl, proxyBase, source, variables, {
        endpoint: 'm3u8',
      });
    }

    // EXT-X-SERVER-CONTROL 与 EXT-X-SKIP 不含 URI，无需处理，原样透传

    rewrittenLines.push(line);
  }

  return rewrittenLines.join('\n');
}

function createProxyUrl(
  proxyBase: string,
  endpoint: 'm3u8' | 'key' | 'segment',
  targetUrl: string,
  source: string | null,
): string {
  const params = new URLSearchParams({ url: targetUrl });
  if (source) {
    params.set('moontv-source', source);
  }
  return `${proxyBase}/${endpoint}?${params.toString()}`;
}

// 变量替换函数 - 参考 hls.js 标准实现
const VARIABLE_REPLACEMENT_REGEX = /\{\$([a-zA-Z0-9-_]+)\}/g;

function substituteVariables(
  text: string,
  variables: Map<string, string>,
): string {
  if (variables.size === 0) {
    return text;
  }

  return text.replace(
    VARIABLE_REPLACEMENT_REGEX,
    (variableReference: string, variableName: string) => {
      const variableValue = variables.get(variableName);
      if (variableValue === undefined) {
        if (process.env.NODE_ENV === 'development') {
          console.warn(`Missing variable definition for: "${variableName}"`);
        }
        return variableReference; // 保持原始引用如果变量未定义
      }
      return variableValue;
    },
  );
}

// 处理变量定义
function processDefineVariables(
  line: string,
  variables: Map<string, string>,
): string {
  const nameMatch = line.match(/NAME="([^"]+)"/);
  const valueMatch = line.match(/VALUE="([^"]+)"/);

  if (nameMatch && valueMatch) {
    variables.set(nameMatch[1], valueMatch[1]);
  }

  return line; // 返回原始标签，让客户端处理
}

/**
 * 通用的 HLS 标签 URI 重写：
 * 匹配 attr="..." → 变量替换 → 解析相对路径 → 指向代理端点。
 * 各 EXT-X-* 标签的差异只剩属性名、代理端点与无效 URI 的处理方式。
 */
function rewriteTagUri(
  line: string,
  baseUrl: string,
  proxyBase: string,
  source: string | null,
  variables: Map<string, string> | undefined,
  options: {
    /** 标签上携带 URI 的属性名，默认 URI */
    attr?: string;
    /** 重写后指向的代理端点 */
    endpoint: 'm3u8' | 'key' | 'segment';
    /** 无效 URI（如 EXT-X-MEDIA 中的 "nan"）处理：strip 移除属性让 HLS.js 忽略该轨道，keep 保留原行 */
    onInvalid?: 'strip' | 'keep';
  },
): string {
  const { attr = 'URI', endpoint, onInvalid = 'keep' } = options;
  const uriMatch = line.match(new RegExp(`${attr}="([^"]+)"`));
  if (!uriMatch) {
    return line;
  }

  let originalUri = uriMatch[1];
  if (variables) {
    originalUri = substituteVariables(originalUri, variables);
  }

  const stripAttr = () => line.replace(new RegExp(`,?${attr}="[^"]*"`), '');

  if (!originalUri || originalUri === 'nan' || originalUri.includes('nan')) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('检测到无效的URI:', originalUri, '原始行:', line);
    }
    return onInvalid === 'strip' ? stripAttr() : line;
  }

  try {
    const resolvedUrl = resolveUrl(baseUrl, originalUri);
    const proxyUrl = createProxyUrl(proxyBase, endpoint, resolvedUrl, source);
    return line.replace(uriMatch[0], `${attr}="${proxyUrl}"`);
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('解析URI失败:', originalUri, error);
    }
    return onInvalid === 'strip' ? stripAttr() : line;
  }
}

// 处理日期范围标签中的 URI (SCTE-35 等，可能包含多个 URI 属性)
function rewriteDateRangeUri(
  line: string,
  baseUrl: string,
  proxyBase: string,
  source: string | null,
  variables?: Map<string, string>,
): string {
  // SCTE-35 或其他可能包含 URI 的属性
  const uriMatches = Array.from(
    line.matchAll(/([A-Z-]+)="([^"]*(?:https?:\/\/|\/)[^"]*)"/g),
  );
  let result = line;

  for (const match of uriMatches) {
    const [fullMatch, , originalUri] = match;
    if (originalUri.includes('://') || originalUri.startsWith('/')) {
      let uri = originalUri;
      if (variables) {
        uri = substituteVariables(uri, variables);
      }
      try {
        const resolvedUrl = resolveUrl(baseUrl, uri);
        const proxyUrl = createProxyUrl(
          proxyBase,
          'segment',
          resolvedUrl,
          source,
        );
        result = result.replace(
          fullMatch,
          fullMatch.replace(originalUri, proxyUrl),
        );
      } catch (error) {
        // 保持原始 URI 如果解析失败
      }
    }
  }

  return result;
}
