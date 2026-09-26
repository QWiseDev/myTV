import { cachedGet } from '@/lib/api-cache.client';
import type { SearchResult } from '@/lib/types';

import { checkAllKeywordsMatch, generateSearchVariants } from './helpers';

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
}

export interface SearchSourcesByTitleResult {
  /** 全部变体返回的原始结果并集（供二次模糊匹配使用） */
  allResults: SearchResult[];
  /** 最后一个产生命中的变体的过滤结果 */
  bestResults: SearchResult[];
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
  const normalizedResult = resultTitle.replaceAll(' ', '').toLowerCase();
  const normalizedQuery = queryTitle.replaceAll(' ', '').toLowerCase();
  return (
    normalizedResult.includes(normalizedQuery) ||
    normalizedQuery.includes(normalizedResult)
  );
}

export interface StrictSourceMatchContext {
  /** 用于匹配的标题（原始值，内部做规范化） */
  queryTitle: string;
  /** 年份（可选；为空时不过滤） */
  year?: string;
  /** 搜索类型 'tv' | 'movie'（可选；为空时不过滤） */
  searchType?: string;
}

/** 严格匹配：标题双向包含 / 去集数标点相等 / 全关键词命中，且年份与类型同时满足。 */
export function matchesSourceStrictly(
  result: SearchResult,
  context: StrictSourceMatchContext,
): boolean {
  const queryTitle = context.queryTitle.replaceAll(' ', '').toLowerCase();
  const resultTitle = result.title.replaceAll(' ', '').toLowerCase();

  const titleMatch =
    resultTitle.includes(queryTitle) ||
    queryTitle.includes(resultTitle) ||
    resultTitle.replace(/\d+|[：:]/g, '') ===
      queryTitle.replace(/\d+|[：:]/g, '') ||
    checkAllKeywordsMatch(queryTitle, resultTitle);

  const normalizedYear = context.year?.toLowerCase();
  const yearMatch = normalizedYear
    ? result.year.toLowerCase() === normalizedYear
    : true;
  const typeMatch = context.searchType
    ? (context.searchType === 'tv' && result.episodes.length > 1) ||
      (context.searchType === 'movie' && result.episodes.length === 1)
    : true;

  return titleMatch && yearMatch && typeMatch;
}

/**
 * 二次兜底：所有变体的严格匹配全部落空后，对全量结果做模糊匹配。
 * 英文按分词命中率（≥ 0.5，最多 5 条），中文按归一化包含或字符相似度
 * （≥ 0.5，最多 20 条）；超过上限视为噪音，返回空数组。
 */
export function fuzzyMatchSources(
  candidates: SearchResult[],
  queryTitle: string,
): SearchResult[] {
  const normalizedQueryTitle = queryTitle.toLowerCase().trim();
  const englishChars = (normalizedQueryTitle.match(/[a-z\s]/g) || []).length;
  const chineseChars = (normalizedQueryTitle.match(/[\u4e00-\u9fff]/g) || [])
    .length;
  const isEnglishQuery = englishChars > chineseChars;

  let relevantMatches: SearchResult[] = [];

  if (isEnglishQuery) {
    const queryWords = normalizedQueryTitle
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(
        (word) =>
          word.length > 2 &&
          ![
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
          ].includes(word),
      );

    relevantMatches = candidates.filter((result) => {
      const title = result.title.toLowerCase();
      const titleWords = title
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter((word) => word.length > 1);

      const matchedWords = queryWords.filter((queryWord) =>
        titleWords.some(
          (titleWord) =>
            titleWord.includes(queryWord) ||
            queryWord.includes(titleWord) ||
            (queryWord.length > 4 &&
              titleWord.length > 4 &&
              queryWord.substring(0, 4) === titleWord.substring(0, 4)),
        ),
      );

      const wordMatchRatio = matchedWords.length / queryWords.length;
      return wordMatchRatio >= 0.5;
    });
  } else {
    const strippedQuery = normalizedQueryTitle.replace(
      /[^\w\u4e00-\u9fff]/g,
      '',
    );

    relevantMatches = candidates.filter((result) => {
      const normalizedResultTitle = result.title
        .toLowerCase()
        .replace(/[^\w\u4e00-\u9fff]/g, '');

      if (
        normalizedResultTitle.includes(strippedQuery) ||
        strippedQuery.includes(normalizedResultTitle)
      ) {
        return true;
      }

      const commonChars = Array.from(strippedQuery).filter((char) =>
        normalizedResultTitle.includes(char),
      ).length;
      const similarity = commonChars / strippedQuery.length;
      return similarity >= 0.5;
    });
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
