import { cachedGet } from '@/lib/api-cache.client';
import type { SearchResult } from '@/lib/types';

import { generateSearchVariants } from './helpers';

export interface SearchApiResponse {
  results: SearchResult[];
}

/**
 * 按标题搜索各源共用的变体循环：
 * 生成搜索变体（最多 2 个）→ 逐个调用聚合搜索 → 按调用方的匹配规则过滤 →
 * 命中数达到 minMatchesToStop 即提前停止。单个变体失败不影响后续变体。
 */
export interface SearchSourcesByTitleOptions {
  /** 生成搜索变体的原始标题 */
  query: string;
  /** 每条结果是否命中（宽松/严格由调用方决定） */
  matchResult: (result: SearchResult) => boolean;
  /** 命中数达到该值即停止尝试后续变体；默认 1（命中即停） */
  minMatchesToStop?: number;
  /** 单个变体搜索失败时的回调 */
  onVariantError?: (variant: string, error: unknown) => void;
  /** 附加给 /api/search 的查询参数（如 group=adult、forSource） */
  extraSearchParams?: Record<string, string>;
}

export interface SearchSourcesByTitleResult {
  /** 全部变体返回的原始结果并集（供二次模糊匹配使用） */
  allResults: SearchResult[];
  /** 最后一个产生命中的变体的过滤结果 */
  bestResults: SearchResult[];
}

const EDITION_TAG_PATTERN =
  /(?:[（([【]\s*(?:(?:19|20)\d{2}|hd|4k|1080p|720p|bd|tc|ts|国语版?|粤语版?|中字|双语|完整版|全集|未删减版?)\s*[）)\]】]|(?:第一季|第1季|全集|完整版|未删减版?|国语版|粤语版|hd|4k))$/i;

const ENGLISH_STOP_WORDS = new Set([
  'the',
  'a',
  'an',
  'and',
  'or',
  'of',
  'in',
  'on',
  'at',
  'to',
  'for',
  'with',
  'by',
]);

export function normalizeSearchYear(year?: string): string {
  const trimmed = (year || '').trim().toLowerCase();
  return !trimmed || trimmed === 'unknown' ? '' : trimmed;
}

/**
 * 规范化标题用于精确对齐：
 * 剥离结尾年份/清晰度/第一季等修饰后缀及书名号、空白、标点，避免
 * 《裙下之臣：逃出魔窟》与“裙下之臣：逃出魔窟”失配，同时拒绝“裙下之臣”等短子串误匹配。
 */
export function normalizeTitleForMatch(title: string): string {
  let normalized = title.trim().toLowerCase();
  let prev = '';
  while (normalized !== prev) {
    prev = normalized;
    normalized = normalized.replace(EDITION_TAG_PATTERN, '').trim();
  }
  return normalized.replace(
    /[\s《》<>""''「」『』()（）[\]【】：:·\-—_,，.。!！?？、]/g,
    '',
  );
}

/**
 * 严格标题对齐：
 * 1. 去标点/修饰后缀后完全一致；
 * 2. 允许“死神来了：血脉诅咒”与“死神来了6：血脉诅咒”这类中间缺省编号，但拒绝末尾续集序号差异（如 1 vs 2、无序号 vs 2）；
 * 3. 多词空格分隔查询时要求所有词均命中且长度覆盖主标题（>= 0.6），防止短子串误吸相似片名。
 */
export function titlesMatchStrictly(
  queryTitle: string,
  resultTitle: string,
): boolean {
  const nq = normalizeTitleForMatch(queryTitle);
  const nr = normalizeTitleForMatch(resultTitle);
  if (!nq || !nr) {
    return false;
  }

  if (nr === nq) {
    return true;
  }

  const digitsQ = nq.replace(/\D/g, '');
  const digitsR = nr.replace(/\D/g, '');
  const baseQ = nq.replace(/\d+/g, '');
  const baseR = nr.replace(/\d+/g, '');
  if (
    baseQ.length >= 2 &&
    baseQ === baseR &&
    (digitsQ === digitsR ||
      (digitsQ === '' && !/\d+$/.test(nr)) ||
      (digitsR === '' && !/\d+$/.test(nq)))
  ) {
    return true;
  }

  const queryTokens = queryTitle
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((token) => normalizeTitleForMatch(token))
    .filter((token) => token.length > 0);
  if (queryTokens.length >= 2) {
    const allTokensIncluded = queryTokens.every((token) => nr.includes(token));
    const tokenCharSum = queryTokens.reduce(
      (sum, token) => sum + token.length,
      0,
    );
    if (allTokensIncluded && tokenCharSum / nr.length >= 0.6) {
      return true;
    }
  }

  return false;
}

export async function searchSourcesByTitle(
  options: SearchSourcesByTitleOptions,
): Promise<SearchSourcesByTitleResult> {
  const maxVariants = 2;
  const minMatchesToStop = options.minMatchesToStop ?? 1;
  const variants = generateSearchVariants(options.query.trim()).slice(
    0,
    maxVariants,
  );

  const allResults: SearchResult[] = [];
  let bestResults: SearchResult[] = [];

  for (const variant of variants) {
    try {
      const data = await cachedGet<SearchApiResponse>('/api/search', {
        q: variant,
        ...options.extraSearchParams,
      });

      if (data.results && data.results.length > 0) {
        allResults.push(...data.results);

        const filteredResults = data.results.filter(options.matchResult);

        if (filteredResults.length > 0) {
          bestResults = filteredResults;
          if (filteredResults.length >= minMatchesToStop) {
            break;
          }
        }
      }
    } catch (error) {
      options.onVariantError?.(variant, error);
    }
  }

  return { allResults, bestResults };
}

/** 宽松匹配：标题（去空格、小写后）双向包含即命中。用于详情页补充相关源。 */
export function matchesSourceLoosely(
  resultTitle: string,
  queryTitle: string,
): boolean {
  const normalizedResult = normalizeTitleForMatch(resultTitle);
  const normalizedQuery = normalizeTitleForMatch(queryTitle);
  if (!normalizedResult || !normalizedQuery) {
    return false;
  }
  return normalizedResult === normalizedQuery;
}

export interface StrictSourceMatchContext {
  /** 用于匹配的标题（原始值，内部做规范化） */
  queryTitle: string;
  /** 年份（可选；为空或 unknown 时不过滤） */
  year?: string;
  /** 搜索类型 'tv' | 'movie'（可选；为空时不过滤） */
  searchType?: string;
}

/** 严格匹配：规范化标题对齐，且年份与类型同时满足。 */
export function matchesSourceStrictly(
  result: SearchResult,
  context: StrictSourceMatchContext,
): boolean {
  const titleMatch = titlesMatchStrictly(context.queryTitle, result.title);

  const normalizedYear = normalizeSearchYear(context.year);
  const normalizedResultYear = normalizeSearchYear(result.year);
  const yearMatch = normalizedYear
    ? normalizedResultYear === normalizedYear
    : true;
  const typeMatch = context.searchType
    ? (context.searchType === 'tv' && result.episodes.length > 1) ||
      (context.searchType === 'movie' && result.episodes.length === 1)
    : true;

  return titleMatch && yearMatch && typeMatch;
}

function extractSignificantEnglishWords(title: string): string[] {
  return title
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 0 && !ENGLISH_STOP_WORDS.has(word));
}

/**
 * 二次兜底：严格匹配全部落空后，在兼容年份（允许某侧缺省年份但拒绝年份冲突）
 * 与兼容类型（允许在播首集仅有 1 集）的前提下对齐标题，不再做低阈值单字重合兜底，
 * 避免跳到名字部分相似的其他剧集。
 */
export function fuzzyMatchSources(
  candidates: SearchResult[],
  queryTitle: string,
  context: { year?: string; searchType?: string } = {},
): SearchResult[] {
  const normalizedQueryTitle = queryTitle.toLowerCase().trim();
  if (!normalizedQueryTitle) {
    return [];
  }

  const englishChars = (normalizedQueryTitle.match(/[a-z\s]/g) || []).length;
  const chineseChars = (normalizedQueryTitle.match(/[\u4e00-\u9fff]/g) || [])
    .length;
  const isEnglishQuery = englishChars > chineseChars;
  const queryYear = normalizeSearchYear(context.year);

  const isCompatibleMetadata = (result: SearchResult): boolean => {
    const resultYear = normalizeSearchYear(result.year);
    if (queryYear && resultYear && queryYear !== resultYear) {
      return false;
    }
    if (context.searchType === 'movie' && result.episodes.length !== 1) {
      return false;
    }
    if (context.searchType === 'tv' && result.episodes.length === 0) {
      return false;
    }
    return true;
  };

  let relevantMatches: SearchResult[] = [];

  if (isEnglishQuery) {
    const queryWords = extractSignificantEnglishWords(normalizedQueryTitle);
    relevantMatches = candidates.filter((result) => {
      if (!isCompatibleMetadata(result)) return false;
      if (titlesMatchStrictly(queryTitle, result.title)) return true;
      if (queryWords.length === 0) return false;

      const titleWords = extractSignificantEnglishWords(result.title);
      return (
        titleWords.length === queryWords.length &&
        queryWords.every((word, idx) => titleWords[idx] === word)
      );
    });
  } else {
    relevantMatches = candidates.filter(
      (result) =>
        isCompatibleMetadata(result) &&
        titlesMatchStrictly(queryTitle, result.title),
    );
  }

  const maxResults = isEnglishQuery ? 5 : 20;
  if (relevantMatches.length > 0 && relevantMatches.length <= maxResults) {
    return Array.from(
      new Map(
        relevantMatches.map((item) => [`${item.source}-${item.id}`, item]),
      ).values(),
    );
  }
  return [];
}
