/* eslint-disable no-console */

import { getConfig } from '@/lib/config';
import { withAbortableTimeout } from '@/lib/promise-timeout';
import { resolveAndValidateRemoteUrl } from '@/lib/url-safety';

import {
  type EpisodeMatchTarget,
  extractEpisodeDate,
  extractEpisodeNumber,
  extractEpisodeSplitDirection,
  extractEpisodeVariant,
  scoreEpisodeCandidate,
} from './episode-match';
import { isSupportedDanmuPlatformUrl } from './platform-url';
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
  if (!Number.isInteger(colorInt) || colorInt < 0 || colorInt > 0xffffff) {
    return '#FFFFFF';
  }
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
    text: text.slice(0, 1000),
    time,
    color: convertDecimalColor(params[3]),
    mode: convertDanmuMode(params[1]),
  };
}

async function fetchKlmJson<T>(
  apiUrl: string,
  options: RequestInit = {},
  timeout = 12000,
): Promise<T | null> {
  try {
    // 地址来自管理端配置，允许指向 docker 内网的弹幕服务。
    await resolveAndValidateRemoteUrl(apiUrl, {
      allowHttp: true,
      allowPrivateNetwork: true,
    });
  } catch (validationError) {
    console.warn('自建弹幕 API 地址未通过安全校验，跳过请求:', validationError);
    return null;
  }

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
        redirect: 'error',
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
  const seen = new Set<string>();
  const normalized: DanmuItem[] = [];

  for (const comment of comments.slice(0, 50000)) {
    const item = parseKlmDanmuComment(comment);
    if (!item) continue;
    const timeKey = Math.round(item.time * 100) / 100;
    const dedupeKey = `${timeKey}_${item.text.toLowerCase()}_${item.mode ?? 0}_${item.color || 'default'}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    normalized.push(item);
  }

  return normalized.sort((a, b) => a.time - b.time).slice(0, 20000);
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

function normalizeSearchTitle(text: string): string {
  return text.replace(/[\s\p{P}]+/gu, '').toLowerCase();
}

// 第三级兜底：search/anime 找番剧 → bangumi 拿集列表 → 按「第N期/集」选集。
// 综艺集标题多为「【imgo】 第1期：…」，match 与 search/episodes 接口覆盖不到时仍可命中。
async function resolveEpisodeViaAnimeSearch(
  apiBaseUrl: string,
  title: string,
  year?: string | null,
  episode?: string | null,
  options: {
    softYearFilter?: boolean;
    allEpisodes?: boolean;
    preferVariant?: string;
  } = {},
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

  const derivativePattern = /沉浸版|加更|抢鲜|抢先|花絮|预告|纯享|解说/;
  const queryNorm = normalizeSearchTitle(title);
  const scoreAnime = (animeTitle: string): number => {
    let score = 0;
    const norm = normalizeSearchTitle(animeTitle);
    if (queryNorm && norm.includes(queryNorm)) score += 30;
    if (year && animeTitle.includes(year)) score += 20;
    const animeVariant = extractEpisodeVariant(animeTitle);
    if (options.preferVariant && options.preferVariant !== '正片') {
      score += animeVariant === options.preferVariant ? 40 : -10;
    } else {
      score += derivativePattern.test(animeTitle) ? -10 : 10;
    }
    return score;
  };

  const animes = searchData.animes
    .filter((anime) => {
      if (!anime.animeId) return false;
      if (options.softYearFilter) return true;
      if (!year) return true;
      return anime.animeTitle?.includes(year);
    })
    .sort(
      (a, b) => scoreAnime(b.animeTitle || '') - scoreAnime(a.animeTitle || ''),
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
    if (options.allEpisodes) {
      // 打分路径：交出全部集，由 scoreEpisodeCandidate 统一裁决
      for (const item of episodes) {
        if (item.episodeId) {
          candidates.push({ ...item, animeTitle });
        }
      }
      continue;
    }
    const matched = episodes.find(
      (item) => extractEpisodeNumber(item.episodeTitle || '') === episodeNum,
    );
    if (matched?.episodeId) {
      candidates.push({ ...matched, animeTitle });
    }
  }

  return candidates;
}

function selectScoringPool(
  candidates: KlmEpisodeMatch[],
  target: EpisodeMatchTarget,
): KlmEpisodeMatch[] {
  if (target.variant === '正片' && !target.date && target.episodeNum > 0) {
    const exactOrdinalPool = candidates.filter(
      (item) =>
        extractEpisodeNumber(item.episodeTitle || '') === target.episodeNum,
    );
    if (exactOrdinalPool.length > 0) {
      return exactOrdinalPool;
    }

    // 常规剧集无日期时严禁错绑其他集数；仅当目标为第 1 集/电影且存在无集号条目时允许匹配
    if (target.episodeNum === 1) {
      return candidates.filter(
        (item) => extractEpisodeNumber(item.episodeTitle || '') === null,
      );
    }
    return [];
  }

  return candidates;
}

function isConfidentStage1Candidate(
  candidate: KlmEpisodeMatch,
  target: EpisodeMatchTarget,
): boolean {
  const combined = `${candidate.animeTitle || ''} ${candidate.episodeTitle || ''}`;
  if (extractEpisodeVariant(combined) !== target.variant) {
    return false;
  }

  if (target.date) {
    const candidateDate =
      extractEpisodeDate(candidate.episodeTitle || '') ??
      extractEpisodeDate(candidate.animeTitle || '');
    if (candidateDate !== target.date) {
      return false;
    }
  }

  if (target.splitDirection) {
    const candidateDirection = extractEpisodeSplitDirection(
      candidate.episodeTitle || '',
    );
    if (candidateDirection !== target.splitDirection) {
      return false;
    }
  }

  if (!target.date && target.episodeNum > 0) {
    const num = extractEpisodeNumber(candidate.episodeTitle || '');
    if (num !== null && num !== target.episodeNum) {
      return false;
    }
  }

  return true;
}

/**
 * 打分匹配路径：本地集名可解析出日期/版式时启用。
 *
 * 阶段 1 并发拉取 match + search/episodes，若已有高置信度匹配并成功拉到弹幕则直接返回，
 * 避免串行触发 search/anime + bangumi 导致累计超时；未命中时再补全阶段 2 候选。
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
  const triedEpisodeIds = new Set<string>();
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

  const [matchCandidate, searchCandidates] = await Promise.all([
    matchKlmEpisodeByFileName(
      apiBaseUrl,
      title,
      year,
      String(episodeNum || episode || '1'),
    ),
    searchKlmEpisodeCandidates(apiBaseUrl, title, null),
  ]);
  if (matchCandidate) pushAll([matchCandidate]);
  pushAll(searchCandidates);

  const stage1Pool = selectScoringPool(candidates, target).filter((item) =>
    isConfidentStage1Candidate(item, target),
  );
  if (stage1Pool.length > 0) {
    const rankedStage1 = [...stage1Pool].sort(
      (a, b) =>
        scoreEpisodeCandidate(b, target) - scoreEpisodeCandidate(a, target),
    );
    for (const candidate of rankedStage1.slice(0, 3)) {
      const resolved = normalizeKlmEpisode(candidate);
      if (!resolved) continue;
      triedEpisodeIds.add(resolved.episodeId);
      const danmu = await fetchKlmCommentDanmu(apiBaseUrl, resolved.episodeId);
      if (danmu.length > 0) {
        return { danmu, resolvedEpisode: resolved };
      }
    }
  }

  pushAll(
    await resolveEpisodeViaAnimeSearch(apiBaseUrl, title, year, episode, {
      softYearFilter: true,
      allEpisodes: true,
      preferVariant: variant,
    }),
  );
  if (candidates.length === 0) {
    return { danmu: [], resolvedEpisode: null };
  }

  const pool = selectScoringPool(candidates, target);
  if (pool.length === 0) {
    return { danmu: [], resolvedEpisode: null };
  }

  const ranked = [...pool].sort(
    (a, b) =>
      scoreEpisodeCandidate(b, target) - scoreEpisodeCandidate(a, target),
  );

  for (const candidate of ranked.slice(0, 3)) {
    const resolved = normalizeKlmEpisode(candidate);
    if (!resolved || triedEpisodeIds.has(resolved.episodeId)) continue;
    triedEpisodeIds.add(resolved.episodeId);
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
