import { NextRequest, NextResponse } from 'next/server';

import { requireAdmin } from '@/lib/admin-auth';
import { requireUser } from '@/lib/auth';
import { assertPublicHttpUrl } from '@/lib/url-safety';
import { ensureUserAccessOrResponse } from '@/lib/user-access';

function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// 视频解析接口配置
interface Parser {
  name: string;
  url: string;
  platforms: string[];
  priority: number; // 优先级，数字越小优先级越高
  timeout?: number; // 超时时间(毫秒)
  status: 'active' | 'inactive' | 'unknown'; // 接口状态
}

// 视频解析接口列表（经过可用性测试，2025年1月更新）
const PARSERS: Parser[] = [
  {
    name: 'M3U8.TV解析',
    url: 'https://jx.m3u8.tv/jiexi/?url=',
    platforms: ['qq', 'iqiyi', 'youku', 'mgtv', 'bilibili', 'pptv'],
    priority: 1,
    timeout: 15000,
    status: 'active', // ✅ 测试可用，支持多平台
  },
  {
    name: '星空解析',
    url: 'https://jx.xmflv.com/?url=',
    platforms: ['qq', 'iqiyi', 'youku', 'mgtv', 'bilibili'],
    priority: 2,
    timeout: 15000,
    status: 'active', // ✅ 测试可用，HLS解析
  },
  {
    name: '播放家解析',
    url: 'https://jx.playerjy.com/?url=',
    platforms: ['qq', 'iqiyi', 'youku', 'sohu', 'letv'],
    priority: 3,
    timeout: 15000,
    status: 'active', // ✅ 测试可用，支持老平台
  },
  {
    name: '爱豆解析',
    url: 'https://jx.aidouer.net/?url=',
    platforms: ['qq', 'iqiyi', 'youku', 'bilibili', 'mgtv'],
    priority: 4,
    timeout: 15000,
    status: 'active', // ✅ 重定向到77flv，可用
  },
  {
    name: '77FLV解析',
    url: 'https://jx.77flv.cc/?url=',
    platforms: ['qq', 'iqiyi', 'youku', 'mgtv', 'bilibili'],
    priority: 5,
    timeout: 15000,
    status: 'active', // ✅ 多个接口都重定向到这里，应该是可用的
  },
];

const PLATFORM_DOMAIN_RULES: Array<{ platform: string; domains: string[] }> = [
  { platform: 'qq', domains: ['qq.com'] },
  { platform: 'iqiyi', domains: ['iqiyi.com', 'qiyi.com'] },
  { platform: 'youku', domains: ['youku.com'] },
  { platform: 'mgtv', domains: ['mgtv.com'] },
  { platform: 'bilibili', domains: ['bilibili.com', 'b23.tv'] },
  { platform: 'sohu', domains: ['sohu.com'] },
  { platform: 'letv', domains: ['letv.com', 'le.com'] },
  { platform: 'pptv', domains: ['pptv.com'] },
  { platform: 'tudou', domains: ['tudou.com'] },
  { platform: 'wasu', domains: ['wasu.com'] },
  { platform: '1905', domains: ['1905.com'] },
];

function matchesHostDomain(hostname: string, domain: string): boolean {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

// 根据 URL hostname 严格识别视频平台（避免 example.com 命中 le.com 或查询串伪造域名）
function detectPlatform(url: string): string {
  let hostname = '';
  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch {
    return 'unknown';
  }
  if (!hostname) return 'unknown';

  for (const rule of PLATFORM_DOMAIN_RULES) {
    if (rule.domains.some((domain) => matchesHostDomain(hostname, domain))) {
      return rule.platform;
    }
  }

  return 'unknown';
}

// 检查解析器健康状态
async function checkParserHealth(parser: Parser): Promise<boolean> {
  try {
    const testUrl = 'https://v.qq.com/x/page/test.html';
    const parseUrl = parser.url + encodeURIComponent(testUrl);

    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      parser.timeout || 5000,
    );

    const response = await fetch(parseUrl, {
      method: 'HEAD',
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    clearTimeout(timeoutId);
    return response.ok || response.status === 405; // 405 Method Not Allowed 也算正常
  } catch (error) {
    console.warn(`解析器 ${parser.name} 健康检查失败:`, error);
    return false;
  }
}

// 获取可用的解析器（仅匹配已知支持的视频平台，拒绝 unknown 任意域名）
function getAvailableParsers(platform: string): Parser[] {
  if (!platform || platform === 'unknown') {
    return [];
  }
  const filtered = PARSERS.filter((parser) =>
    parser.platforms.includes(platform),
  );

  // 按优先级和状态排序：active > unknown > inactive，同级别按priority排序
  return filtered.sort((a, b) => {
    // 状态权重：active=0, unknown=1, inactive=2
    const statusWeight = { active: 0, unknown: 1, inactive: 2 };
    const aWeight = statusWeight[a.status];
    const bWeight = statusWeight[b.status];

    if (aWeight !== bWeight) {
      return aWeight - bWeight;
    }

    // 状态相同时按优先级排序
    return a.priority - b.priority;
  });
}

// 批量检查所有解析器健康状态（后台任务）
async function updateParsersHealth() {
  const healthChecks = PARSERS.map(async (parser) => {
    const isHealthy = await checkParserHealth(parser);
    parser.status = isHealthy ? 'active' : 'inactive';
    return { name: parser.name, status: parser.status, isHealthy };
  });

  await Promise.allSettled(healthChecks);
}

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get('url');
    const parser = searchParams.get('parser');
    const format = searchParams.get('format') || 'json';
    const healthCheck = searchParams.get('health_check') === 'true';

    // 如果是健康检查请求（限制仅管理员可触发，防止外部探测扇出放大）
    if (healthCheck) {
      const admin = await requireAdmin(request);
      if ('response' in admin) {
        return (
          admin.response ??
          NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        );
      }

      await updateParsersHealth();
      return NextResponse.json({
        success: true,
        data: {
          parsers: PARSERS.map((p) => ({
            name: p.name,
            status: p.status,
            priority: p.priority,
            platforms: p.platforms,
          })),
          timestamp: new Date().toISOString(),
        },
      });
    }

    // 纳入登录鉴权与账号可用性校验，禁止未登录匿名滥用为重定向跳板或解析代理
    const auth = await requireUser(request);
    if (!auth.authInfo) {
      return (
        auth.response ??
        NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      );
    }
    const guardResult = await ensureUserAccessOrResponse(
      auth.authInfo.username,
      auth.authInfo.timestamp,
    );
    if ('response' in guardResult) {
      return guardResult.response;
    }

    if (!url) {
      return NextResponse.json({ error: '缺少必需参数: url' }, { status: 400 });
    }

    try {
      assertPublicHttpUrl(url, { allowHttp: true });
    } catch {
      return NextResponse.json(
        { error: '非法的目标视频地址' },
        { status: 400 },
      );
    }

    // 检测视频平台
    const platform = detectPlatform(url);
    const availableParsers = getAvailableParsers(platform);

    if (availableParsers.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: '该平台暂不支持解析',
          data: {
            original_url: url,
            platform: platform,
            available_parsers: [],
          },
        },
        { status: 400 },
      );
    }

    // 选择解析器
    let selectedParser;
    if (parser) {
      selectedParser = availableParsers.find((p) => p.name === parser);
      if (!selectedParser) {
        return NextResponse.json({
          success: false,
          error: '指定的解析器不存在或不支持该平台',
          data: {
            original_url: url,
            platform: platform,
            available_parsers: availableParsers.map((p) => p.name),
          },
        });
      }
    } else {
      // 使用第一个可用的解析器
      selectedParser = availableParsers[0];
    }

    const parseUrl = selectedParser.url + encodeURIComponent(url);

    // 根据format参数返回不同格式
    switch (format) {
      case 'redirect':
        // 直接重定向到解析地址
        return NextResponse.redirect(parseUrl);

      case 'iframe': {
        // 返回带沙箱隔离的 iframe HTML
        const safeParseUrl = escapeHtmlAttr(parseUrl);
        const iframeHtml = `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>视频解析 - 卡拉米影视</title>
    <style>
        body { margin: 0; padding: 0; background: #000; }
        iframe { width: 100vw; height: 100vh; border: none; }
    </style>
</head>
<body>
    <iframe src="${safeParseUrl}" sandbox="allow-scripts allow-same-origin allow-forms allow-presentation" referrerpolicy="no-referrer" allowfullscreen></iframe>
</body>
</html>`;
        return new NextResponse(iframeHtml, {
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'private, no-store',
            'X-Frame-Options': 'SAMEORIGIN',
            'Content-Security-Policy':
              "default-src 'none'; style-src 'unsafe-inline'; frame-src https: http:; frame-ancestors 'self'",
          },
        });
      }

      case 'json':
      default:
        // 返回JSON格式的解析信息（鉴权接口使用 private 缓存，不暴露跨源通配符）
        return NextResponse.json(
          {
            success: true,
            data: {
              original_url: url,
              platform: platform,
              parse_url: parseUrl,
              parser_name: selectedParser.name,
              available_parsers: availableParsers.map((p) => p.name),
            },
          },
          {
            headers: {
              'Cache-Control': 'private, max-age=300',
            },
          },
        );
    }
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: '视频解析服务异常',
        details:
          process.env.NODE_ENV === 'development' && error instanceof Error
            ? error.message
            : undefined,
      },
      { status: 500 },
    );
  }
}
