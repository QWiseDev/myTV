/* eslint-disable no-console */

import { getConfig } from '@/lib/config';
import { withAbortableTimeout } from '@/lib/promise-timeout';

import type {
  DanmuItem,
  KlmDanmuComment,
  KlmDanmuResponse,
  KlmEpisodeMatch,
  KlmMatchResponse,
  KlmResolvedEpisode,
  KlmSearchEpisodesResponse,
} from './types';

async function getDanmuApiBase(): Promise<string | null> {
  try {
    const config = await getConfig();
    const apiBaseUrl = config.DanmuConfig?.apiBaseUrl?.trim();
    if (!apiBaseUrl) return null;

    return apiBaseUrl.replace(/\/+$/, '');
  } catch (error) {
    console.warn('读取弹幕 API 配置失败，跳过自建弹幕 API:', error);
    return null;
  }
}

function convertDecimalColor(colorValue: string | undefined): string {
  const colorInt = Number.parseInt(colorValue || '16777215', 10);
  if (!Number.isFinite(colorInt)) return '#FFFFFF';
  return '#' + colorInt.toString(16).padStart(6, '0').toUpperCase();
}

function convertDanmuMode(modeValue: string | undefined): number {
  const mode = Number.parseInt(modeValue || '1', 10);
  return mode === 5 ? 1 : mode === 4 ? 2 : 0;
}

function parseKlmDanmuComment(comment: KlmDanmuComment): DanmuItem | null {
  const text = (comment.m || comment.text || '').trim();
  if (!text || text.includes('弹幕正在赶来') || text.includes('官方弹幕库')) {
    return null;
  }

  const params = (comment.p || '').split(',');
  const time = Number.parseFloat(params[0] || String(comment.t || 0));
  if (!Number.isFinite(time) || time < 0 || time > 86400) return null;

  return {
    text,
    time,
    color: convertDecimalColor(params[3]),
    mode: convertDanmuMode(params[1]),
  };
}

function isSupportedDanmuPlatformUrl(videoUrl: string): boolean {
  return [
    'v.qq.com',
    'iqiyi.com',
    'youku.com',
    'mgtv.com',
    'bilibili.com',
    'miguvideo.com',
    'sohu.com',
    'le.com',
    'ixigua.com',
  ].some((domain) => videoUrl.includes(domain));
}

async function fetchKlmJson<T>(
  apiUrl: string,
  options: RequestInit = {},
  timeout = 12000,
): Promise<T | null> {
  const headers = new Headers(options.headers);
  if (!headers.has('User-Agent')) {
    headers.set(
      'User-Agent',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    );
  }
  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json, text/plain, */*');
  }

  try {
    return await withAbortableTimeout(async (signal) => {
      const response = await fetch(apiUrl, {
        ...options,
        signal,
        headers,
      });

      if (!response.ok) {
        return null;
      }

      return (await response.json()) as T;
    }, timeout);
  } catch (error) {
    if (
      error instanceof Error &&
      (error.name === 'TimeoutError' || error.name === 'AbortError')
    ) {
      console.error(`❌ 自建弹幕API请求超时 (${timeout / 1000}秒):`, apiUrl);
    } else {
      console.error('❌ 自建弹幕API请求失败:', error);
    }
    return null;
  }
}

function normalizeKlmEpisode(
  episode: KlmEpisodeMatch | undefined,
): KlmResolvedEpisode | null {
  if (!episode?.episodeId) return null;
  return {
    episodeId: String(episode.episodeId),
    animeTitle: episode.animeTitle,
    episodeTitle: episode.episodeTitle,
  };
}

async function matchKlmEpisodeByFileName(
  apiBaseUrl: string,
  title: string,
  year?: string | null,
  episode?: string | null,
): Promise<KlmResolvedEpisode | null> {
  const episodeNum = Number.parseInt(episode || '1', 10) || 1;
  const fileName = `${title}${year ? ` ${year}` : ''} 第${episodeNum}集`;
  const apiUrl = `${apiBaseUrl}/api/v2/match`;

  const data = await fetchKlmJson<KlmMatchResponse>(
    apiUrl,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName }),
    },
    15000,
  );

  if (!data?.success || !data.isMatched || !Array.isArray(data.matches)) {
    return null;
  }

  return normalizeKlmEpisode(data.matches[0]);
}

async function searchKlmEpisode(
  apiBaseUrl: string,
  title: string,
  year?: string | null,
  episode?: string | null,
): Promise<KlmResolvedEpisode | null> {
  const params = new URLSearchParams({ anime: title });
  if (episode) params.set('episode', episode);

  const data = await fetchKlmJson<KlmSearchEpisodesResponse>(
    `${apiBaseUrl}/api/v2/search/episodes?${params}`,
    {},
    15000,
  );

  if (!data?.success || !Array.isArray(data.animes)) return null;

  const candidates = data.animes
    .filter((anime) => {
      if (!year) return true;
      return anime.animeTitle?.includes(year);
    })
    .flatMap((anime) =>
      (anime.episodes || []).map((item) => ({
        ...item,
        animeTitle: anime.animeTitle,
      })),
    );

  return normalizeKlmEpisode(candidates[0]);
}

function normalizeKlmDanmuResponse(
  data: KlmDanmuResponse | null,
): DanmuItem[] {
  const comments = data && Array.isArray(data.comments) ? data.comments : [];
  return comments
    .map(parseKlmDanmuComment)
    .filter((item): item is DanmuItem => Boolean(item))
    .sort((a, b) => a.time - b.time)
    .slice(0, 20000);
}

async function fetchDanmuFromKlmEpisode(
  title: string,
  year?: string | null,
  episode?: string | null,
): Promise<{
  danmu: DanmuItem[];
  resolvedEpisode: KlmResolvedEpisode | null;
}> {
  const apiBaseUrl = await getDanmuApiBase();
  if (!apiBaseUrl || !title.trim()) {
    return { danmu: [], resolvedEpisode: null };
  }

  const resolvedEpisode =
    (await matchKlmEpisodeByFileName(apiBaseUrl, title, year, episode)) ||
    (await searchKlmEpisode(apiBaseUrl, title, year, episode));

  if (!resolvedEpisode) {
    return { danmu: [], resolvedEpisode: null };
  }

  const data = await fetchKlmJson<KlmDanmuResponse>(
    `${apiBaseUrl}/api/v2/comment/${encodeURIComponent(
      resolvedEpisode.episodeId,
    )}?format=json&duration=true`,
    {},
    20000,
  );

  const danmu = normalizeKlmDanmuResponse(data);

  return { danmu, resolvedEpisode };
}

// 从自建 danmu_api 获取弹幕数据（复用 fetchKlmJson：超时/非 2xx/解析失败均归一为空结果）
async function fetchDanmuFromKlmAPI(videoUrl: string): Promise<DanmuItem[]> {
  const timeout = videoUrl.includes('iqiyi.com') ? 30000 : 20000;
  const apiBaseUrl = await getDanmuApiBase();
  if (!apiBaseUrl) {
    return [];
  }

  const apiUrl = `${apiBaseUrl}/api/v2/comment?url=${encodeURIComponent(
    videoUrl,
  )}&format=json`;

  return normalizeKlmDanmuResponse(
    await fetchKlmJson<KlmDanmuResponse>(apiUrl, {}, timeout),
  );
}

export {
  fetchDanmuFromKlmAPI,
  fetchDanmuFromKlmEpisode,
  getDanmuApiBase,
  isSupportedDanmuPlatformUrl,
};
