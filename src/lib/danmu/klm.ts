/* eslint-disable no-console */

import { getConfig } from '@/lib/config';
import { withAbortableTimeout } from '@/lib/promise-timeout';

import type {
  DanmuItem,
  KlmDanmuComment,
  KlmDanmuResponse,
  KlmEpisode,
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

// 从「第2集/第02集/第二集」等标题中解析集数，无法解析返回 null
function extractEpisodeNumber(episodeTitle: string): number | null {
  const arabic = episodeTitle.match(/第\s*(\d{1,4})\s*[集话期]/);
  if (arabic) {
    const num = Number.parseInt(arabic[1], 10);
    return Number.isFinite(num) ? num : null;
  }

  const chinese = episodeTitle.match(
    /第\s*([零一二三四五六七八九十]{1,7})\s*[集话期]/,
  );
  if (!chinese) return null;

  const digits: Record<string, number> = {
    零: 0,
    一: 1,
    二: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
  };
  const text = chinese[1];
  if (text === '十') return 10;

  // 十X / X十 / X十Y
  const shiMatch = text.match(
    /^(?:([一二三四五六七八九])?十)(?:([一二三四五六七八九]))?$/,
  );
  if (shiMatch) {
    const tens = shiMatch[1] ? digits[shiMatch[1]] : 1;
    const ones = shiMatch[2] ? digits[shiMatch[2]] : 0;
    return tens * 10 + ones;
  }

  // 纯数字串（如 一二三）
  if (/^[零一二三四五六七八九]+$/.test(text)) {
    const num = Number.parseInt(
      text
        .split('')
        .map((char) => digits[char])
        .join(''),
      10,
    );
    return Number.isFinite(num) ? num : null;
  }

  return null;
}

// 按集数从候选中精确挑选：缺集时返回 null，避免错绑其他集的弹幕
function pickKlmEpisodeByNumber(
  candidates: KlmEpisodeMatch[],
  episodeNum: number,
): KlmEpisodeMatch | null {
  return (
    candidates.find(
      (item) => extractEpisodeNumber(item.episodeTitle || '') === episodeNum,
    ) || null
  );
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

  const episodeNum = Number.parseInt(episode || '', 10);
  const selected =
    episodeNum > 0
      ? pickKlmEpisodeByNumber(candidates, episodeNum)
      : candidates[0];

  return normalizeKlmEpisode(selected || undefined);
}

function normalizeKlmDanmuResponse(data: KlmDanmuResponse | null): DanmuItem[] {
  const comments = data && Array.isArray(data.comments) ? data.comments : [];
  return comments
    .map(parseKlmDanmuComment)
    .filter((item): item is DanmuItem => Boolean(item))
    .sort((a, b) => a.time - b.time)
    .slice(0, 20000);
}

async function fetchKlmCommentDanmu(
  apiBaseUrl: string,
  episodeId: string,
  timeout = 15000,
): Promise<DanmuItem[]> {
  const data = await fetchKlmJson<KlmDanmuResponse>(
    `${apiBaseUrl}/api/v2/comment/${encodeURIComponent(
      episodeId,
    )}?format=json&duration=true`,
    {},
    timeout,
  );
  return normalizeKlmDanmuResponse(data);
}

// 第三级兜底：search/anime 找番剧 → bangumi 拿集列表 → 按「第N期/集」选集。
// 综艺集标题多为「【imgo】 第1期：…」，match 与 search/episodes 接口覆盖不到时仍可命中。
async function resolveEpisodeViaAnimeSearch(
  apiBaseUrl: string,
  title: string,
  year?: string | null,
  episode?: string | null,
): Promise<KlmEpisodeMatch[]> {
  if (!title.trim()) return [];

  const searchData = await fetchKlmJson<{
    success?: boolean;
    animes?: Array<{ animeId?: number | string; animeTitle?: string }>;
  }>(
    `${apiBaseUrl}/api/v2/search/anime?keyword=${encodeURIComponent(title)}`,
    {},
    10000,
  );
  if (!searchData?.success || !Array.isArray(searchData.animes)) return [];

  // 衍生版本（沉浸版/加更/抢鲜等）排后，正片优先
  const derivativePattern = /沉浸版|加更|抢鲜|抢先|花絮|预告|纯享|解说/;
  const animes = searchData.animes
    .filter((anime) => {
      if (!anime.animeId) return false;
      if (!year) return true;
      return anime.animeTitle?.includes(year);
    })
    .sort(
      (a, b) =>
        Number(derivativePattern.test(a.animeTitle || '')) -
        Number(derivativePattern.test(b.animeTitle || '')),
    )
    .slice(0, 4);

  if (animes.length === 0) return [];

  const episodeNum = Number.parseInt(episode || '1', 10) || 1;

  // 并发拉取各来源的集列表
  const details = await Promise.allSettled(
    animes.map((anime) =>
      fetchKlmJson<{ bangumi?: { episodes?: KlmEpisode[] } }>(
        `${apiBaseUrl}/api/v2/bangumi/${encodeURIComponent(
          String(anime.animeId),
        )}`,
        {},
        8000,
      ).then((data) => ({
        animeTitle: anime.animeTitle,
        episodes: data?.bangumi?.episodes || [],
      })),
    ),
  );

  const candidates: KlmEpisodeMatch[] = [];
  for (const result of details) {
    if (result.status !== 'fulfilled') continue;
    const { animeTitle, episodes } = result.value;
    const matched = episodes.find(
      (item) => extractEpisodeNumber(item.episodeTitle || '') === episodeNum,
    );
    if (matched?.episodeId) {
      candidates.push({ ...matched, animeTitle });
    }
  }

  return candidates;
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

  // 三级候选：文件名匹配 → search/episodes → search/anime + bangumi 组合
  const candidates: KlmResolvedEpisode[] = [];
  const pushCandidate = (candidate: KlmResolvedEpisode | null) => {
    if (
      candidate &&
      !candidates.some((item) => item.episodeId === candidate.episodeId)
    ) {
      candidates.push(candidate);
    }
  };
  // 指定集数时复核候选集标题，拦截 match 按标题相似度错配的集（如「第2集」错配「第1期」）
  const matchesTargetEpisode = (candidate: KlmResolvedEpisode | null) => {
    const episodeNum = Number.parseInt(episode || '', 10);
    if (!Number.isFinite(episodeNum) || episodeNum <= 0) return true;
    return extractEpisodeNumber(candidate?.episodeTitle || '') === episodeNum;
  };

  const matchCandidate = await matchKlmEpisodeByFileName(
    apiBaseUrl,
    title,
    year,
    episode,
  );
  if (matchesTargetEpisode(matchCandidate)) {
    pushCandidate(matchCandidate);
  }
  pushCandidate(await searchKlmEpisode(apiBaseUrl, title, year, episode));
  for (const candidate of await resolveEpisodeViaAnimeSearch(
    apiBaseUrl,
    title,
    year,
    episode,
  )) {
    pushCandidate(normalizeKlmEpisode(candidate));
  }

  // 逐个候选拉弹幕，空结果自动降级到下一候选（最多尝试 3 个，控制最坏耗时）
  for (const candidate of candidates.slice(0, 3)) {
    const danmu = await fetchKlmCommentDanmu(apiBaseUrl, candidate.episodeId);
    if (danmu.length > 0) {
      return { danmu, resolvedEpisode: candidate };
    }
  }

  return { danmu: [], resolvedEpisode: candidates[0] || null };
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
