import { NextRequest, NextResponse } from 'next/server';

import { resolveRequestUser } from '@/lib/auth';
import { getConfig } from '@/lib/config';
import { normalizeDanmakuComments } from '@/lib/danmaku';
import { consumeRateLimit } from '@/lib/rate-limit';
import { resolveAndValidateRemoteUrl } from '@/lib/url-safety';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : {};
}

function identifier(value: unknown) {
  return (typeof value === 'number' || typeof value === 'string') &&
    /^[\w-]{1,200}$/.test(String(value))
    ? String(value)
    : '';
}

function extractClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0].trim();
    if (first) return first;
  }
  return request.headers.get('x-real-ip') || 'unknown';
}

// 只代理固定的 danmu_api 查询，不接受客户端传入目标地址或任意路径。
export async function GET(request: Request) {
  const user =
    'cookies' in request
      ? await resolveRequestUser(request as NextRequest)
      : null;
  if (!user) {
    const rate = consumeRateLimit(
      `guest:danmaku:${extractClientIp(request)}`,
      60,
      60_000,
    );
    if (!rate.allowed) {
      return NextResponse.json(
        { error: '请求过于频繁，请稍后再试' },
        {
          status: 429,
          headers: { 'Retry-After': String(rate.retryAfterSeconds) },
        },
      );
    }
  }

  const params = new URL(request.url).searchParams;
  const action = params.get('action');
  const keyword = params.get('keyword')?.trim();
  const id = identifier(params.get('id'));
  let path: string;
  if (action === 'search' && keyword && keyword.length <= 100) {
    path = `/api/v2/search/anime?${new URLSearchParams({ keyword })}`;
  } else if (action === 'episodes' && id) {
    path = `/api/v2/bangumi/${encodeURIComponent(id)}`;
  } else if (action === 'comment' && id) {
    path = `/api/v2/comment/${encodeURIComponent(id)}?format=json`;
  } else {
    return NextResponse.json({ error: '弹幕查询参数无效' }, { status: 400 });
  }

  const controller = new AbortController();
  const abort = () => controller.abort();
  request.signal?.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(abort, 20000);
  try {
    const config = await getConfig();
    const base = config.DanmuConfig?.apiBaseUrl?.trim().replace(/\/+$/, '');
    if (!base)
      return NextResponse.json(
        { error: '请先在管理面板配置弹幕 API 地址' },
        { status: 503 },
      );
    const url = new URL(base + path);
    try {
      // 地址来自管理端配置（用户不可控），允许指向 docker 内网的弹幕服务。
      await resolveAndValidateRemoteUrl(url.toString(), {
        allowHttp: true,
        allowPrivateNetwork: true,
      });
    } catch {
      return NextResponse.json({ error: '弹幕 API 配置无效' }, { status: 503 });
    }
    if (request.signal?.aborted) controller.abort();
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
      redirect: 'error',
      cache: 'no-store',
    });
    if (!response.ok) throw new Error('upstream');
    const data = record(await response.json());
    if (
      data.success === false ||
      (typeof data.errorCode === 'number' && data.errorCode !== 0)
    )
      throw new Error('upstream');
    let result: object;
    if (action === 'search') {
      if (!Array.isArray(data.animes)) throw new Error('format');
      result = {
        animes: data.animes
          .slice(0, 100)
          .map((entry) => {
            const anime = record(entry);
            return {
              id: identifier(anime.animeId),
              title: String(anime.animeTitle || ''),
              episodeCount: Number(anime.episodeCount) || 0,
            };
          })
          .filter((anime) => anime.id && anime.title),
      };
    } else if (action === 'episodes') {
      const bangumi = record(data.bangumi);
      if (!Array.isArray(bangumi.episodes)) throw new Error('format');
      result = {
        episodes: bangumi.episodes
          .slice(0, 5000)
          .map((entry) => {
            const episode = record(entry);
            return {
              id: identifier(episode.episodeId),
              title: String(episode.episodeTitle || episode.title || ''),
            };
          })
          .filter((episode) => episode.id),
      };
    } else {
      if (!Array.isArray(data.comments)) throw new Error('format');
      result = { danmu: normalizeDanmakuComments(data.comments) };
    }
    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch {
    return NextResponse.json(
      {
        error: controller.signal.aborted
          ? '弹幕请求超时或已取消，请重试'
          : '弹幕服务暂不可用，请稍后重试',
      },
      { status: controller.signal.aborted ? 504 : 502 },
    );
  } finally {
    clearTimeout(timeout);
    request.signal?.removeEventListener('abort', abort);
  }
}
