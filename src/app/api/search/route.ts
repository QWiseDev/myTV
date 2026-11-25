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
import { searchFromApi } from '@/lib/downstream';
import { withAbortableTimeout } from '@/lib/promise-timeout';
import {
  isSearchTimeoutError,
  isSiteSearchBenched,
  markSiteSearchSuccess,
  markSiteSearchTimeout,
  SEARCH_SITE_TIMEOUT_MS,
} from '@/lib/site-health';
import { yellowWords } from '@/lib/yellow';

export const runtime = 'nodejs';

// 强制动态渲染，避免在构建时预生成
export async function GET(request: NextRequest) {
  const auth = requireUser(request);
  if (!auth.authInfo) return auth.response;
  const authInfo = auth.authInfo;

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
          'Cache-Control': `public, max-age=${cacheTime}, s-maxage=${cacheTime}`,
          'CDN-Cache-Control': `public, s-maxage=${cacheTime}`,
          'Vercel-CDN-Cache-Control': `public, s-maxage=${cacheTime}`,
          'Netlify-Vary': 'query',
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

  // 添加超时控制和错误处理，避免慢接口拖累整体响应；近期连续超时的站点
  // 直接跳过（站点级隔离），防止挂死站点把整体完成时间钉在超时上限
  const searchPromises = apiSites.map((site) => {
    if (isSiteSearchBenched(site.key)) {
      return Promise.resolve([]);
    }

    return withAbortableTimeout(
      async () => searchFromApi(site, query),
      SEARCH_SITE_TIMEOUT_MS,
    )
      .then((results) => {
        markSiteSearchSuccess(site.key);
        return results;
      })
      .catch((err) => {
        if (isSearchTimeoutError(err)) {
          markSiteSearchTimeout(site.key);
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
            'Cache-Control': `public, max-age=${cacheTime}, s-maxage=${cacheTime}`,
            'CDN-Cache-Control': `public, s-maxage=${cacheTime}`,
            'Vercel-CDN-Cache-Control': `public, s-maxage=${cacheTime}`,
            'Netlify-Vary': 'query',
          };

    return NextResponse.json({ results: flattenedResults }, { headers });
  } catch (error) {
    return NextResponse.json({ error: '搜索失败' }, { status: 500 });
  }
}
