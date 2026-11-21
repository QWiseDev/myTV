/* eslint-disable no-console */

import { getConfig } from '@/lib/config';
import { withAbortableTimeout } from '@/lib/promise-timeout';

import {
  type EpisodeMatchTarget,
  extractEpisodeDate,
  extractEpisodeNumber,
  extractEpisodeSplitDirection,
  extractEpisodeVariant,
  scoreEpisodeCandidate,
} from './episode-match';
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

export { extractEpisodeNumber } from './episode-match';

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

// 打分路径用：返回全部候选（不做年份硬过滤，年份交给 scoreEpisodeCandidate）
async function searchKlmEpisodeCandidates(
  apiBaseUrl: string,
  title: string,
  episode?: string | null,
): Promise<KlmEpisodeMatch[]> {
  const params = new URLSearchParams({ anime: title });
  if (episode) params.set('episode', episode);

  const data = await fetchKlmJson<KlmSearchEpisodesResponse>(
    `${apiBaseUrl}/api/v2/search/episodes?${params}`,
    {},
    15000,
  );

  if (!data?.success || !Array.isArray(data.animes)) return [];

  return data.animes.flatMap((anime) =>
    (anime.episodes || []).map((item) => ({
      ...item,
      animeTitle: anime.animeTitle,
    })),
  );
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
  options: { softYearFilter?: boolean } = {},
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

  // 衍生版本（沉浸版/加更/抢鲜等）排后，正片优先；
  // 打分路径（softYearFilter）不做年份硬过滤——
  // 「后会友期 沉浸版(2026)」之外还存在不含年份的条目，硬过滤会整条丢弃，
  // 年份倾向统一交给 scoreEpisodeCandidate 参与排序。
  const derivativePattern = /沉浸版|加更|抢鲜|抢先|花絮|预告|纯享|解说/;
  const animes = searchData.animes
    .filter((anime) => {
      if (!anime.animeId) return false;
      if (options.softYearFilter) return true;
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

/**
 * 打分匹配路径：本地集名可解析出日期/版式时启用。
 *
 * 与 legacy 路径的三级候选来源一致（match → search/episodes → search/anime+bangumi），
 * 但不做年份硬过滤，全部候选交给 scoreEpisodeCandidate 排序；
 * 序数能精确对齐时仍在「序数相等」子集内挑最优（硬底线，防错绑）。
 */
async function resolveEpisodeByScoring(
  apiBaseUrl: string,
  title: string,
  year: string | null | undefined,
  episode: string | null | undefined,
  meta: { episodeTitle: string; variantEpisode: number },
): Promise<{ danmu: DanmuItem[]; resolvedEpisode: KlmResolvedEpisode | null }> {
  const localTitle = meta.episodeTitle.trim();
  const variant = extractEpisodeVariant(localTitle);
  const date = extractEpisodeDate(localTitle, year);
  const globalEpisodeNum = Number.parseInt(episode || '', 10) || 0;
  // 衍生版（沉浸版/加更等）在 danmu_api 里通常是独立条目、自己从头编号，
  // 目标序数要换成「同版式内的序数」；正片仍用全局集数
  const episodeNum =
    variant !== '正片' && meta.variantEpisode > 0
      ? meta.variantEpisode
      : globalEpisodeNum;

  const target: EpisodeMatchTarget = {
    title,
    year: year || null,
    episodeNum,
    date,
    variant,
    splitDirection: extractEpisodeSplitDirection(localTitle),
  };

  const candidates: KlmEpisodeMatch[] = [];
  const pushAll = (items: KlmEpisodeMatch[]) => {
    for (const item of items) {
      if (
        item.episodeId &&
        !candidates.some((x) => String(x.episodeId) === String(item.episodeId))
      ) {
        candidates.push(item);
      }
    }
  };

  const matchCandidate = await matchKlmEpisodeByFileName(
    apiBaseUrl,
    title,
    year,
    String(episodeNum || episode || '1'),
  );
  if (matchCandidate) pushAll([matchCandidate]);
  pushAll(await searchKlmEpisodeCandidates(apiBaseUrl, title, episode));
  pushAll(
    await resolveEpisodeViaAnimeSearch(apiBaseUrl, title, year, episode, {
      softYearFilter: true,
    }),
  );
  if (candidates.length === 0) {
    return { danmu: [], resolvedEpisode: null };
  }

  // 硬底线：目标序数可解析且存在序数完全一致的候选时，只在一致子集内挑，
  // 拦截标题相似度错配（沿用 legacy 的复核语义）；对不齐时退回全候选打分
  const ordinalPool =
    episodeNum > 0
      ? candidates.filter(
          (item) =>
            extractEpisodeNumber(item.episodeTitle || '') === episodeNum,
        )
      : [];
  const pool = ordinalPool.length > 0 ? ordinalPool : candidates;
  const ranked = [...pool].sort(
    (a, b) =>
      scoreEpisodeCandidate(b, target) - scoreEpisodeCandidate(a, target),
  );

  for (const candidate of ranked.slice(0, 3)) {
    const resolved = normalizeKlmEpisode(candidate);
    if (!resolved) continue;
    const danmu = await fetchKlmCommentDanmu(apiBaseUrl, resolved.episodeId);
    if (danmu.length > 0) {
      return { danmu, resolvedEpisode: resolved };
    }
  }

  return {
    danmu: [],
    resolvedEpisode: normalizeKlmEpisode(ranked[0] || undefined),
  };
}

async function fetchDanmuFromKlmEpisode(
  title: string,
  year?: string | null,
  episode?: string | null,
  meta?: {
    episodeTitle?: string | null;
    variantEpisode?: number | null;
  } | null,
): Promise<{
  danmu: DanmuItem[];
  resolvedEpisode: KlmResolvedEpisode | null;
}> {
  const apiBaseUrl = await getDanmuApiBase();
  if (!apiBaseUrl || !title.trim()) {
    return { danmu: [], resolvedEpisode: null };
  }

  // 本地集名可用时走打分匹配（日期 + 中文版式 + 序数）
  if (meta?.episodeTitle?.trim()) {
    return resolveEpisodeByScoring(apiBaseUrl, title, year, episode, {
      episodeTitle: meta.episodeTitle,
      variantEpisode: meta.variantEpisode || 0,
    });
  }

  // legacy 路径（缺省 episode_title 时行为与历史版本完全一致）
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
