/* eslint-disable @typescript-eslint/no-explicit-any,no-console */

import { NextRequest, NextResponse } from 'next/server';

import type { AdminConfig } from '@/lib/admin.types';
import { requireUser } from '@/lib/auth';
import {
  type ApiSite,
  BUILT_IN_ADULT_SOURCES,
  getAdultApiSites,
  getAvailableApiSites,
} from '@/lib/config';
import { probeSiteSearchHealth, searchFromApi } from '@/lib/downstream';
import { withAbortableTimeout } from '@/lib/promise-timeout';
import {
  type SoftDeadlineOptions,
  collectSearchResultsWithSoftDeadline,
} from '@/lib/search-soft-deadline';
import {
  getSiteSearchTimeoutMs,
  isSearchTimeoutError,
  markSiteSearchFailure,
  SEARCH_SITE_TIMEOUT_MS,
  shouldSkipSiteSearch,
} from '@/lib/site-health';
import type { SearchResult } from '@/lib/types';
import { ensureUserAccessOrResponse } from '@/lib/user-access';
import { yellowWords } from '@/lib/yellow';

export const MAX_SEARCH_QUERY_LENGTH = 100;
const DEFAULT_DOWNSTREAM_TIMEOUT_MS = 8_000;

export type SearchAuthResult =
  | { username: string; timestamp?: number }
  | { response: NextResponse };

/** 规范化并限长搜索词：去首尾空白并截断异常超长输入 */
export function normalizeSearchQuery(raw: string | null | undefined): string {
  if (!raw) return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';
  return trimmed.length > MAX_SEARCH_QUERY_LENGTH
    ? trimmed.slice(0, MAX_SEARCH_QUERY_LENGTH)
    : trimmed;
}

/** 统一搜索接口鉴权（合并 requireUser 与账号封禁/吊销校验） */
export async function authenticateSearchRequest(
  request: NextRequest,
): Promise<SearchAuthResult> {
  const auth = await requireUser(request);
  if (!auth.authInfo) {
    return { response: auth.response };
  }
  const guardResult = await ensureUserAccessOrResponse(
    auth.authInfo.username,
    auth.authInfo.timestamp,
  );
  if ('response' in guardResult) {
    return { response: guardResult.response };
  }
  return {
    username: auth.authInfo.username,
    timestamp: auth.authInfo.timestamp,
  };
}

/** 统一黄词过滤与成人源打标 */
export function filterSearchResults(
  results: SearchResult[],
  options: {
    isAdultSearch?: boolean;
    disableYellowFilter?: boolean;
  } = {},
): SearchResult[] {
  const { isAdultSearch = false, disableYellowFilter = false } = options;
  let filtered = results;
  if (!isAdultSearch && !disableYellowFilter) {
    filtered = filtered.filter((result) => {
      const typeName = result.type_name || '';
      return !yellowWords.some((word: string) => typeName.includes(word));
    });
  }
  if (isAdultSearch) {
    filtered = filtered.map((result) => ({
      ...result,
      adult: true,
    }));
  }
  return filtered;
}

/** 统一解析候选源（区分成人源分组并按需排除 forSource） */
export async function resolveSearchSites(params: {
  username: string;
  config: AdminConfig;
  group?: string | null;
  forSource?: string | null;
}): Promise<{ isAdultSearch: boolean; apiSites: ApiSite[] }> {
  const { username, config, group, forSource } = params;
  const normalizedForSource = (forSource || '').trim();
  const isAdultSource = Boolean(
    normalizedForSource &&
    (config.SourceConfig?.some(
      (s) => s.key === normalizedForSource && s.adult,
    ) ||
      BUILT_IN_ADULT_SOURCES.some((s) => s.key === normalizedForSource)),
  );
  const isAdultSearch = group === 'adult' || isAdultSource;
  const candidateSites = isAdultSearch
    ? await getAdultApiSites(username)
    : await getAvailableApiSites(username);
  const apiSites = normalizedForSource
    ? candidateSites.filter((site) => site.key !== normalizedForSource)
    : candidateSites;

  return { isAdultSearch, apiSites };
}

export interface SingleSiteSearchOutcome {
  skipped: boolean;
  results: SearchResult[];
  error?: unknown;
}

/**
 * 统一单源搜索执行器：
 * - open：直接跳过；
 * - half_open：当前请求 0 等待跳过，并触发 1 路后台异步探活；
 * - closed：按需对历史慢源收紧超时，外层保留兜底超时并捕获异常。
 */
export async function executeSingleSiteSearch(
  site: ApiSite,
  query: string,
  options: {
    tightenSlowTimeout?: boolean;
    signal?: AbortSignal;
    throwOnError?: boolean;
  } = {},
): Promise<SingleSiteSearchOutcome> {
  const decision = shouldSkipSiteSearch(site.key);
  if (decision.skip) {
    if (decision.shouldBackgroundProbe) {
      void probeSiteSearchHealth(site);
    }
    return { skipped: true, results: [] };
  }

  const requestTimeoutMs = options.tightenSlowTimeout
    ? getSiteSearchTimeoutMs(site.key, DEFAULT_DOWNSTREAM_TIMEOUT_MS)
    : DEFAULT_DOWNSTREAM_TIMEOUT_MS;
  const outerTimeoutMs = options.tightenSlowTimeout
    ? getSiteSearchTimeoutMs(site.key, SEARCH_SITE_TIMEOUT_MS)
    : SEARCH_SITE_TIMEOUT_MS;

  try {
    const results = (await withAbortableTimeout(
      async () =>
        requestTimeoutMs < DEFAULT_DOWNSTREAM_TIMEOUT_MS
          ? searchFromApi(site, query, { timeoutMs: requestTimeoutMs })
          : searchFromApi(site, query),
      outerTimeoutMs,
      options.signal,
    )) as SearchResult[];
    return { skipped: false, results };
  } catch (error) {
    if (isSearchTimeoutError(error)) {
      markSiteSearchFailure(site.key, 'timeout');
    }
    if (options.throwOnError) {
      throw error;
    }
    console.warn(
      `搜索失败 ${site.name}:`,
      error instanceof Error ? error.message : String(error),
    );
    return { skipped: false, results: [], error };
  }
}

/**
 * 聚合搜索（供 /api/search 使用）：
 * 仅将实际发起的非熔断源纳入软截止完成比例，超过软截止且结果充足时立即返回。
 */
export async function runAggregatedSearch(
  apiSites: ApiSite[],
  query: string,
  options: {
    isAdultSearch?: boolean;
    disableYellowFilter?: boolean;
    softDeadline?: SoftDeadlineOptions;
  } = {},
): Promise<{ results: SearchResult[]; earlyReturned: boolean }> {
  const activeTasks: Array<Promise<SearchResult[]>> = [];

  for (const site of apiSites) {
    const decision = shouldSkipSiteSearch(site.key);
    if (decision.skip) {
      if (decision.shouldBackgroundProbe) {
        void probeSiteSearchHealth(site);
      }
      continue;
    }

    const requestTimeoutMs = getSiteSearchTimeoutMs(
      site.key,
      DEFAULT_DOWNSTREAM_TIMEOUT_MS,
    );
    const outerTimeoutMs = getSiteSearchTimeoutMs(
      site.key,
      SEARCH_SITE_TIMEOUT_MS,
    );

    const task = withAbortableTimeout(
      async () =>
        requestTimeoutMs < DEFAULT_DOWNSTREAM_TIMEOUT_MS
          ? searchFromApi(site, query, { timeoutMs: requestTimeoutMs })
          : searchFromApi(site, query),
      outerTimeoutMs,
    ).catch((err) => {
      if (isSearchTimeoutError(err)) {
        markSiteSearchFailure(site.key, 'timeout');
      }
      console.warn(
        `搜索失败 ${site.name}:`,
        err instanceof Error ? err.message : String(err),
      );
      return [] as SearchResult[];
    });

    activeTasks.push(task);
  }

  const { results: collectedResults, earlyReturned } =
    await collectSearchResultsWithSoftDeadline(
      activeTasks,
      options.softDeadline,
    );

  return {
    results: filterSearchResults(collectedResults, {
      isAdultSearch: options.isAdultSearch,
      disableYellowFilter: options.disableYellowFilter,
    }),
    earlyReturned,
  };
}
