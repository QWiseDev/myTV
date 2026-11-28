import type { SearchResult } from '@/lib/types';

const EDITION_TAG_PATTERN =
  /(?:[（([【]\s*(?:(?:19|20)\d{2}|hd|4k|1080p|720p|bd|tc|ts|国语版?|粤语版?|中字|双语|完整版|全集|未删减版?)\s*[）)\]】]|(?:第一季|第1季|全集|完整版|未删减版?|国语版|粤语版|hd|4k))$/i;

const PUNCT_AND_SPACE_PATTERN =
  /[\s《》<>""''「」『』()（）[\]【】：:·\-—_,，.。!！?？、]/g;

const PURE_SEASON_TOKEN_PATTERN =
  /^第?[一二三四五六七八九十百0-9]+[季部集篇话期]$/;

const TRAILING_SEASON_SUFFIX_PATTERN =
  /第?[一二三四五六七八九十百0-9]+[季部集篇话期]$/;

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

function stripPunctAndSpace(value: string): string {
  return value.trim().toLowerCase().replace(PUNCT_AND_SPACE_PATTERN, '');
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
  return normalized.replace(PUNCT_AND_SPACE_PATTERN, '');
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
      if (!isCompatibleMetadata(result)) {
        return false;
      }
      if (titlesMatchStrictly(queryTitle, result.title)) {
        return true;
      }
      if (queryWords.length === 0) {
        return false;
      }
      const resultWords = extractSignificantEnglishWords(result.title);
      if (resultWords.length === 0) {
        return false;
      }
      const matchedQueryWords = queryWords.filter((word) =>
        resultWords.includes(word),
      );
      const coverageOnQuery = matchedQueryWords.length / queryWords.length;
      const coverageOnResult = matchedQueryWords.length / resultWords.length;
      return coverageOnQuery >= 0.8 && coverageOnResult >= 0.6;
    });
  } else {
    relevantMatches = candidates.filter(
      (result) =>
        isCompatibleMetadata(result) &&
        titlesMatchStrictly(queryTitle, result.title),
    );
  }

  return relevantMatches;
}

/** 播放页精准找源过滤器：先严格匹配，若为空再降级到兼容年份/类型的标题对齐兜底 */
export function filterExactSourceMatches(
  candidates: SearchResult[],
  context: StrictSourceMatchContext,
): SearchResult[] {
  const strictMatches = candidates.filter((result) =>
    matchesSourceStrictly(result, context),
  );
  if (strictMatches.length > 0) {
    return strictMatches;
  }
  return fuzzyMatchSources(candidates, context.queryTitle, {
    year: context.year,
    searchType: context.searchType,
  });
}

function extractUpstreamRelevanceTokens(query: string): {
  compactQuery: string;
  tokens: string[];
} {
  const compactQuery = stripPunctAndSpace(query);
  const rawParts = query
    .trim()
    .toLowerCase()
    .split(/[\s《》<>""''「」『』()（）[\]【】：:·\-—_,，.。!！?？、]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  const tokenSet = new Set<string>();
  for (const part of rawParts) {
    if (PURE_SEASON_TOKEN_PATTERN.test(part)) {
      continue;
    }
    if (part.length >= 2 && !ENGLISH_STOP_WORDS.has(part)) {
      tokenSet.add(part);
    }
    const stem = part.replace(TRAILING_SEASON_SUFFIX_PATTERN, '').trim();
    if (stem.length >= 2 && stem !== part) {
      tokenSet.add(stem);
    }
  }

  const compactStem = compactQuery
    .replace(TRAILING_SEASON_SUFFIX_PATTERN, '')
    .trim();
  if (compactStem.length >= 2) {
    tokenSet.add(compactStem);
  }

  if (tokenSet.size === 0 && compactQuery.length > 0) {
    tokenSet.add(compactQuery);
  }

  return {
    compactQuery,
    tokens: Array.from(tokenSet),
  };
}

export function isUpstreamResultRelevantToQuery(
  result: SearchResult,
  query: string,
): boolean {
  const { compactQuery, tokens } = extractUpstreamRelevanceTokens(query);
  if (!compactQuery) return true;

  const normTitle = stripPunctAndSpace(result.title || '');
  const normDesc = stripPunctAndSpace(result.desc || '');

  if (normTitle.includes(compactQuery) || normDesc.includes(compactQuery)) {
    return true;
  }

  for (const token of tokens) {
    if (normTitle.includes(token)) {
      return true;
    }
    if (token.length >= 3 && normDesc.includes(token)) {
      return true;
    }
  }

  return false;
}

export interface SanitizedUpstreamPage {
  results: SearchResult[];
  effectivePageCount: number;
  isCatalogDump: boolean;
}

/**
 * 上游单页相关性护栏：
 * 部分坏 MacCMS 采集站在遇到带空格或陌生关键词时会无视 wd 参数，吐出全站最新目录（pagecount 动辄数百页）。
 * 当单页样本较多或 pagecount 异常偏大且几乎不包含查询核心词时，判定为全库灌水：
 * 仅保留真正相关条目并禁止继续翻页（避免单次搜索膨胀至上千条 / 数 MB）。
 * 同时保留少量结果（如搜英文别名返回 1~5 条中文译名）的正常命中。
 */
export function sanitizeUpstreamSearchPage(
  results: SearchResult[],
  pageCount: number,
  query: string,
): SanitizedUpstreamPage {
  if (results.length === 0) {
    return { results: [], effectivePageCount: 1, isCatalogDump: false };
  }

  const normalizedPageCount = Math.max(1, Number(pageCount) || 1);
  const relevant = results.filter((item) =>
    isUpstreamResultRelevantToQuery(item, query),
  );
  const matchRatio = relevant.length / results.length;

  const isCatalogDump =
    (normalizedPageCount >= 5 && results.length >= 10 && matchRatio < 0.2) ||
    (results.length >= 15 && matchRatio < 0.15) ||
    (normalizedPageCount >= 20 && matchRatio < 0.5);

  if (isCatalogDump) {
    return {
      results: relevant,
      effectivePageCount: 1,
      isCatalogDump: true,
    };
  }

  // 非全库灌水但相关性偏低时，只保留第一页避免翻 2~5 页把无关条目放大数倍
  const effectivePageCount =
    normalizedPageCount > 1 && matchRatio < 0.3 ? 1 : normalizedPageCount;

  return {
    results,
    effectivePageCount,
    isCatalogDump: false,
  };
}
