import { cachedGet } from '@/lib/api-cache.client';
import type { SearchResult } from '@/lib/types';

import { generateSearchVariants } from './helpers';

export {
  type StrictSourceMatchContext,
  filterExactSourceMatches,
  fuzzyMatchSources,
  matchesSourceLoosely,
  matchesSourceStrictly,
  normalizeSearchYear,
  normalizeTitleForMatch,
  titlesMatchStrictly,
} from '@/lib/search-match';

export interface SearchApiResponse {
  results: SearchResult[];
}

/**
 * 按标题搜索各源共用的变体循环：
 * 生成搜索变体（最多 2 个）→ 逐个调用聚合搜索 → 按调用方的匹配规则过滤 →
 * 命中数达到 minMatchesToStop 即提前停止。单个变体失败不影响后续变体。
 * 注：mode=exact 时服务端已执行变体兜底与精确筛选，首轮命中即停，不再串行重发二次聚合搜索。
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
  /** 附加给 /api/search 的查询参数（如 group=adult、forSource、mode=exact） */
  extraSearchParams?: Record<string, string>;
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
  const isServerExactMode = options.extraSearchParams?.mode === 'exact';
  const minMatchesToStop = isServerExactMode
    ? 1
    : (options.minMatchesToStop ?? 1);
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
