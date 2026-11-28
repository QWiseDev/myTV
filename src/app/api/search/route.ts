/* eslint-disable @typescript-eslint/no-explicit-any,no-console */

import { NextRequest, NextResponse } from 'next/server';

import { requireUser } from '@/lib/auth';
import {
  BUILT_IN_ADULT_SOURCES,
  getAdultApiSites,
  getAvailableApiSites,
  getCacheTime,
  getConfig,
} from '@/lib/config';
import { probeSiteSearchHealth, searchFromApi } from '@/lib/downstream';
import { withAbortableTimeout } from '@/lib/promise-timeout';
import {
  getSiteSearchTimeoutMs,
  isSearchTimeoutError,
  markSiteSearchFailure,
  SEARCH_SITE_TIMEOUT_MS,
  shouldSkipSiteSearch,
} from '@/lib/site-health';
import { ensureUserAccessOrResponse } from '@/lib/user-access';
import { yellowWords } from '@/lib/yellow';

export const runtime = 'nodejs';

// 强制动态渲染，避免在构建时预生成
export async function GET(request: NextRequest) {
  const auth = await requireUser(request);
  if (!auth.authInfo) return auth.response;
  const authInfo = auth.authInfo;

  const guardResult = await ensureUserAccessOrResponse(
    authInfo.username,
    authInfo.timestamp,
  );
  if ('response' in guardResult) {
    return guardResult.response;
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');
  const group = searchParams.get('group');
  const forSource = searchParams.get('forSource') || '';

  if (!query) {
    const cacheTime = await getCacheTime();
    return NextResponse.json(
      { results: [] },
      {
        headers: {
          'Cache-Control': `private, max-age=${cacheTime}`,
        },
      },
    );
  }

  const config = await getConfig();
  const isAdultSource = Boolean(
    forSource &&
    (config.SourceConfig?.some((s) => s.key === forSource && s.adult) ||
      BUILT_IN_ADULT_SOURCES.some((s) => s.key === forSource)),
  );
  const isAdultSearch = group === 'adult' || isAdultSource;
  const candidateSites = isAdultSearch
    ? await getAdultApiSites(authInfo.username)
    : await getAvailableApiSites(authInfo.username);
  const apiSites = forSource
    ? candidateSites.filter((site) => site.key !== forSource)
    : candidateSites;

  // 三态熔断与慢源收紧超时：
  // - open 状态直接跳过；
  // - half_open 到期时本次请求 0 等待跳过，并在后台跨源并发触发单路 4s 轻探活；
  // - 真实网络成功/失败由 downstream.ts 精准上报，外层仅保留兜底超时避免漏判。
  const searchPromises = apiSites.map((site) => {
    const decision = shouldSkipSiteSearch(site.key);
    if (decision.skip) {
      if (decision.shouldBackgroundProbe) {
        void probeSiteSearchHealth(site);
      }
      return Promise.resolve([]);
    }

    const requestTimeoutMs = getSiteSearchTimeoutMs(site.key, 8000);
    const outerTimeoutMs = getSiteSearchTimeoutMs(
      site.key,
      SEARCH_SITE_TIMEOUT_MS,
    );

    return withAbortableTimeout(
      async () =>
        requestTimeoutMs < 8000
          ? searchFromApi(site, query, { timeoutMs: requestTimeoutMs })
          : searchFromApi(site, query),
      outerTimeoutMs,
    ).catch((err) => {
      if (isSearchTimeoutError(err)) {
        markSiteSearchFailure(site.key, 'timeout');
      }
      console.warn(`搜索失败 ${site.name}:`, err.message);
      return []; // 返回空数组而不是抛出错误
    });
  });

  try {
    const results = await Promise.allSettled(searchPromises);
    const successResults = results
      .filter((result) => result.status === 'fulfilled')
      .map((result) => (result as PromiseFulfilledResult<any>).value);
    let flattenedResults = successResults.flat();
    if (!isAdultSearch && !config.SiteConfig.DisableYellowFilter) {
      flattenedResults = flattenedResults.filter((result) => {
        const typeName = result.type_name || '';
        return !yellowWords.some((word: string) => typeName.includes(word));
      });
    }
    if (isAdultSearch) {
      flattenedResults = flattenedResults.map((result) => ({
        ...result,
        adult: true,
      }));
    }
    const cacheTime = await getCacheTime();

    if (flattenedResults.length === 0) {
      // no cache if empty
      return NextResponse.json({ results: [] }, { status: 200 });
    }

    const headers: Record<string, string> =
      isAdultSearch || Boolean(forSource)
        ? { 'Cache-Control': 'private, no-store' }
        : {
            'Cache-Control': `private, max-age=${cacheTime}`,
          };

    return NextResponse.json({ results: flattenedResults }, { headers });
  } catch (error) {
    return NextResponse.json({ error: '搜索失败' }, { status: 500 });
  }
}
