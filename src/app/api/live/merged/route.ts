import { NextRequest, NextResponse } from 'next/server';

import { resolveRequestUser } from '@/lib/auth';
import { getConfig } from '@/lib/config';
import { withAbortableTimeout } from '@/lib/promise-timeout';
import { getClientIp } from '@/lib/rate-limit';
import {
  isIpInWhitelist,
  resolveAndValidateRemoteUrl,
  safeFetch,
} from '@/lib/url-safety';

export const runtime = 'nodejs';

const MERGED_CACHE_TTL_MS = 60 * 1000;
const LIVE_FETCH_TIMEOUT_MS = 10 * 1000;
const MAX_CONCURRENT_LIVE_FETCHES = 5;

let mergedCache: {
  key: string;
  content: string;
  expiresAt: number;
} | null = null;

async function fetchLiveSourceContent(live: {
  key: string;
  name: string;
  url: string;
  ua?: string;
}): Promise<string> {
  await resolveAndValidateRemoteUrl(live.url, { allowHttp: true });
  const response = await withAbortableTimeout(
    (signal) =>
      safeFetch(live.url, {
        signal,
        headers: {
          'User-Agent':
            live.ua ||
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      }),
    LIVE_FETCH_TIMEOUT_MS,
  );

  if (!response.ok) {
    return '';
  }

  const m3uContent = await response.text();
  const lines = m3uContent.split('\n');
  const currentGroup = live.name;
  let chunk = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line.startsWith('#EXTINF:')) {
      const channelInfo = line.replace('#EXTINF:', '');
      const parts = channelInfo.split(',');
      if (parts.length >= 2) {
        const channelName = parts[parts.length - 1];
        const prefix = parts.slice(0, -1).join(',');

        if (!line.includes('group-title=')) {
          chunk += `#EXTINF:${prefix},group-title="${currentGroup}" ${channelName}\n`;
        } else {
          chunk += line + '\n';
        }
      } else {
        chunk += line + '\n';
      }
    } else if (line && !line.startsWith('#EXTM3U')) {
      chunk += line + '\n';
    }
  }

  return chunk ? chunk + '\n' : '';
}

// 强制动态渲染，避免在构建时预生成
export async function GET(request: NextRequest) {
  try {
    const config = await getConfig();

    if (!config) {
      return NextResponse.json({ error: '配置未找到' }, { status: 404 });
    }

    const securityConfig = config.TVBoxSecurityConfig;
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');
    const signedUser = await resolveRequestUser(request);

    const matchedUser = token
      ? config.UserConfig.Users.find((u) => !u.banned && u.tvboxToken === token)
      : undefined;

    if (securityConfig?.enableAuth) {
      const validGlobalToken = Boolean(
        securityConfig.token && token === securityConfig.token,
      );
      if (!signedUser && !matchedUser && !validGlobalToken) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    if (
      securityConfig?.enableIpWhitelist &&
      securityConfig.allowedIPs.length > 0 &&
      !signedUser
    ) {
      const clientIP = getClientIp(request);
      if (!isIpInWhitelist(clientIP, securityConfig.allowedIPs)) {
        return NextResponse.json(
          { error: `Access denied for IP: ${clientIP}` },
          { status: 403 },
        );
      }
    }

    // 获取所有启用的直播源
    const enabledLives = (config.LiveConfig || []).filter(
      (live) => !live.disabled,
    );

    if (enabledLives.length === 0) {
      return new NextResponse('#EXTM3U\n', {
        headers: {
          'Content-Type': 'application/x-mpegurl',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
      });
    }

    const cacheSignature = enabledLives
      .map((l) => `${l.key}:${l.url}:${l.name}`)
      .join('|');
    if (
      mergedCache &&
      mergedCache.key === cacheSignature &&
      Date.now() < mergedCache.expiresAt
    ) {
      return new NextResponse(mergedCache.content, {
        headers: {
          'Content-Type': 'application/x-mpegurl',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'X-Cache': 'HIT',
        },
      });
    }

    // 限制并发并发拉取所有启用的直播源
    const chunks: string[] = new Array(enabledLives.length).fill('');
    for (let i = 0; i < enabledLives.length; i += MAX_CONCURRENT_LIVE_FETCHES) {
      const batch = enabledLives.slice(i, i + MAX_CONCURRENT_LIVE_FETCHES);
      const results = await Promise.allSettled(
        batch.map((live) => fetchLiveSourceContent(live)),
      );
      results.forEach((result, offset) => {
        if (result.status === 'fulfilled') {
          chunks[i + offset] = result.value;
        } else {
          const live = batch[offset];
          console.error(`获取直播源 ${live?.name} 失败:`, result.reason);
        }
      });
    }

    const mergedM3U = `#EXTM3U\n${chunks.join('')}`;
    mergedCache = {
      key: cacheSignature,
      content: mergedM3U,
      expiresAt: Date.now() + MERGED_CACHE_TTL_MS,
    };

    return new NextResponse(mergedM3U, {
      headers: {
        'Content-Type': 'application/x-mpegurl',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  } catch (error) {
    console.error('合并直播源失败:', error);
    return NextResponse.json({ error: '合并直播源失败' }, { status: 500 });
  }
}

// 支持CORS预检请求
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
