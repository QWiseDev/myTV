/* eslint-disable @typescript-eslint/no-explicit-any,no-console,no-case-declarations */

import {
  type DoubanRecentHotResponse,
  buildDoubanCategoryUrl,
  DOUBAN_RECENT_HOT_HOSTS,
  mapDoubanRecentHotItems,
} from '@/lib/douban-shared';

import { createPrefixedCache } from './prefixed-cache';
import { withAbortableTimeout } from './promise-timeout';
import { DoubanCommentsResult, DoubanItem, DoubanResult } from './types';

// 与 TMDB 客户端共用同一套双写缓存实现，仅命名空间不同
const { getCacheKey, getCache, setCache } = createPrefixedCache(
  'douban',
  '豆瓣',
);

// 豆瓣数据缓存配置（秒）
const DOUBAN_CACHE_EXPIRE = {
  details: 4 * 60 * 60, // 详情4小时（变化较少）
  lists: 2 * 60 * 60, // 列表2小时（更新频繁）
  categories: 2 * 60 * 60, // 分类2小时
  recommends: 2 * 60 * 60, // 推荐2小时
  comments: 2 * 60 * 60, // 短评2小时
};

// 空短评的负缓存时间（秒）：避免反复拉取刷屏，同时允许较快回填
const DOUBAN_EMPTY_COMMENTS_EXPIRE = 10 * 60; // 10分钟

interface DoubanCategoriesParams {
  kind: 'tv' | 'movie';
  category: string;
  type: string;
  pageLimit?: number;
  pageStart?: number;
}

interface DoubanListApiResponse {
  total: number;
  subjects: Array<{
    id: string;
    title: string;
    card_subtitle: string;
    cover: string;
    rate: string;
  }>;
}

interface DoubanRecommendApiResponse {
  total: number;
  items: Array<{
    id: string;
    title: string;
    year: string;
    type: string;
    pic: {
      large: string;
      normal: string;
    };
    rating: {
      value: number;
    };
  }>;
}

/**
 * 带超时的 fetch 请求
 */
async function fetchJsonWithTimeout<T>(
  url: string,
  proxyUrl: string,
  signal?: AbortSignal,
): Promise<T> {
  // 检查是否使用代理
  const finalUrl = proxyUrl ? `${proxyUrl}${encodeURIComponent(url)}` : url;

  return withAbortableTimeout(
    async (requestSignal) => {
      const response = await fetch(finalUrl, {
        signal: requestSignal,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
          Referer: 'https://movie.douban.com/',
          Accept: 'application/json, text/plain, */*',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }

      return response.json() as Promise<T>;
    },
    10000,
    signal,
  );
}

import { getBestDataProxySync } from './douban-proxy-detector';

function getDoubanProxyConfig() {
  return { proxyType: getBestDataProxySync() };
}

export async function fetchDoubanCategories(
  params: DoubanCategoriesParams,
  proxyUrl: string,
  useTencentCDN = false,
  useAliCDN = false,
  signal?: AbortSignal,
): Promise<DoubanResult> {
  const { kind, category, type, pageLimit = 20, pageStart = 0 } = params;

  // 验证参数
  if (!['tv', 'movie'].includes(kind)) {
    throw new Error('kind 参数必须是 tv 或 movie');
  }

  if (!category || !type) {
    throw new Error('category 和 type 参数不能为空');
  }

  if (pageLimit < 1 || pageLimit > 100) {
    throw new Error('pageLimit 必须在 1-100 之间');
  }

  if (pageStart < 0) {
    throw new Error('pageStart 不能小于 0');
  }

  const host = useTencentCDN
    ? DOUBAN_RECENT_HOT_HOSTS.tencent
    : useAliCDN
      ? DOUBAN_RECENT_HOT_HOSTS.ali
      : DOUBAN_RECENT_HOT_HOSTS.default;
  const target = buildDoubanCategoryUrl(
    { kind, category, type, pageStart, pageLimit },
    host,
  );

  try {
    const doubanData = await fetchJsonWithTimeout<DoubanRecentHotResponse>(
      target,
      useTencentCDN || useAliCDN ? '' : proxyUrl,
      signal,
    );

    // 转换数据格式
    const list = mapDoubanRecentHotItems(doubanData);

    return {
      code: 200,
      message: '获取成功',
      list: list,
    };
  } catch (error) {
    if (signal?.aborted) {
      throw error;
    }

    // 触发全局错误提示
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('globalError', {
          detail: { message: '获取豆瓣分类数据失败' },
        }),
      );
    }
    throw new Error(`获取豆瓣分类数据失败: ${(error as Error).message}`);
  }
}

/**
 * 统一的豆瓣分类数据获取函数，根据代理设置选择使用服务端 API 或客户端代理获取
 */
export async function getDoubanCategories(
  params: DoubanCategoriesParams,
  signal?: AbortSignal,
): Promise<DoubanResult> {
  const { kind, category, type, pageLimit = 20, pageStart = 0 } = params;

  // 检查缓存
  const cacheKey = getCacheKey('categories', {
    kind,
    category,
    type,
    pageLimit,
    pageStart,
  });
  const cached = await getCache(cacheKey);
  if (cached) {
    return cached;
  }

  const { proxyType } = getDoubanProxyConfig();
  let result: DoubanResult;

  switch (proxyType) {
    case 'cmliussss-cdn-ali':
      result = await fetchDoubanCategories(params, '', false, true, signal);
      break;
    case 'cmliussss-cdn-tencent':
      result = await fetchDoubanCategories(params, '', true, false, signal);
      break;
    case 'cors-proxy-zwei':
      result = await fetchDoubanCategories(
        params,
        'https://ciao-cors.is-an.org/',
        false,
        false,
        signal,
      );
      break;
    case 'direct':
    default:
      const response = await fetch(
        `/api/douban/categories?kind=${kind}&category=${category}&type=${type}&limit=${pageLimit}&start=${pageStart}`,
        { signal },
      );
      result = await response.json();
      break;
  }

  // 保存到缓存
  if (result.code === 200 && !signal?.aborted) {
    await setCache(cacheKey, result, DOUBAN_CACHE_EXPIRE.categories);
  }

  return result;
}

interface DoubanListParams {
  tag: string;
  type: string;
  pageLimit?: number;
  pageStart?: number;
}

export async function getDoubanList(
  params: DoubanListParams,
): Promise<DoubanResult> {
  const { tag, type, pageLimit = 20, pageStart = 0 } = params;

  // 检查缓存
  const cacheKey = getCacheKey('lists', { tag, type, pageLimit, pageStart });
  const cached = await getCache(cacheKey);
  if (cached) {
    return cached;
  }

  const { proxyType } = getDoubanProxyConfig();
  let result: DoubanResult;

  switch (proxyType) {
    case 'cmliussss-cdn-ali':
      result = await fetchDoubanList(params, '', false, true);
      break;
    case 'cmliussss-cdn-tencent':
      result = await fetchDoubanList(params, '', true, false);
      break;
    case 'cors-proxy-zwei':
      result = await fetchDoubanList(params, 'https://ciao-cors.is-an.org/');
      break;
    case 'direct':
    default:
      const response = await fetch(
        `/api/douban?tag=${tag}&type=${type}&pageSize=${pageLimit}&pageStart=${pageStart}`,
      );
      result = await response.json();
      break;
  }

  // 保存到缓存
  if (result.code === 200) {
    await setCache(cacheKey, result, DOUBAN_CACHE_EXPIRE.lists);
  }

  return result;
}

export async function fetchDoubanList(
  params: DoubanListParams,
  proxyUrl: string,
  useTencentCDN = false,
  useAliCDN = false,
): Promise<DoubanResult> {
  const { tag, type, pageLimit = 20, pageStart = 0 } = params;

  // 验证参数
  if (!tag || !type) {
    throw new Error('tag 和 type 参数不能为空');
  }

  if (!['tv', 'movie'].includes(type)) {
    throw new Error('type 参数必须是 tv 或 movie');
  }

  if (pageLimit < 1 || pageLimit > 100) {
    throw new Error('pageLimit 必须在 1-100 之间');
  }

  if (pageStart < 0) {
    throw new Error('pageStart 不能小于 0');
  }

  const target = useTencentCDN
    ? `https://movie.douban.cmliussss.net/j/search_subjects?type=${type}&tag=${tag}&sort=recommend&page_limit=${pageLimit}&page_start=${pageStart}`
    : useAliCDN
      ? `https://movie.douban.cmliussss.com/j/search_subjects?type=${type}&tag=${tag}&sort=recommend&page_limit=${pageLimit}&page_start=${pageStart}`
      : `https://movie.douban.com/j/search_subjects?type=${type}&tag=${tag}&sort=recommend&page_limit=${pageLimit}&page_start=${pageStart}`;

  try {
    const doubanData = await fetchJsonWithTimeout<DoubanListApiResponse>(
      target,
      useTencentCDN || useAliCDN ? '' : proxyUrl,
    );

    // 转换数据格式
    const list: DoubanItem[] = doubanData.subjects.map((item) => ({
      id: item.id,
      title: item.title,
      poster: item.cover,
      rate: item.rate,
      year: item.card_subtitle?.match(/(\d{4})/)?.[1] || '',
    }));

    return {
      code: 200,
      message: '获取成功',
      list: list,
    };
  } catch (error) {
    // 触发全局错误提示
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('globalError', {
          detail: { message: '获取豆瓣列表数据失败' },
        }),
      );
    }
    throw new Error(`获取豆瓣分类数据失败: ${(error as Error).message}`);
  }
}

interface DoubanRecommendsParams {
  kind: 'tv' | 'movie';
  pageLimit?: number;
  pageStart?: number;
  category?: string;
  format?: string;
  label?: string;
  region?: string;
  year?: string;
  platform?: string;
  sort?: string;
}

export async function getDoubanRecommends(
  params: DoubanRecommendsParams,
): Promise<DoubanResult> {
  const {
    kind,
    pageLimit = 20,
    pageStart = 0,
    category,
    format,
    label,
    region,
    year,
    platform,
    sort,
  } = params;

  // 检查缓存
  const cacheKey = getCacheKey('recommends', {
    kind,
    pageLimit,
    pageStart,
    category,
    format,
    label,
    region,
    year,
    platform,
    sort,
  });
  const cached = await getCache(cacheKey);
  if (cached) {
    return cached;
  }

  const { proxyType } = getDoubanProxyConfig();
  let result: DoubanResult;

  switch (proxyType) {
    case 'cmliussss-cdn-ali':
      result = await fetchDoubanRecommends(params, '', false, true);
      break;
    case 'cmliussss-cdn-tencent':
      result = await fetchDoubanRecommends(params, '', true, false);
      break;
    case 'cors-proxy-zwei':
      result = await fetchDoubanRecommends(
        params,
        'https://ciao-cors.is-an.org/',
      );
      break;
    case 'direct':
    default:
      const response = await fetch(
        `/api/douban/recommends?kind=${kind}&limit=${pageLimit}&start=${pageStart}&category=${category}&format=${format}&region=${region}&year=${year}&platform=${platform}&sort=${sort}&label=${label}`,
      );
      result = await response.json();
      break;
  }

  // 保存到缓存
  if (result.code === 200) {
    await setCache(cacheKey, result, DOUBAN_CACHE_EXPIRE.recommends);
  }

  return result;
}

/**
 * 获取豆瓣影片详细信息
 */
export async function getDoubanDetails(id: string): Promise<{
  code: number;
  message: string;
  data?: {
    id: string;
    title: string;
    poster: string;
    rate: string;
    year: string;
    directors?: string[];
    screenwriters?: string[];
    cast?: string[];
    genres?: string[];
    countries?: string[];
    languages?: string[];
    episodes?: number;
    episode_length?: number;
    first_aired?: string;
    plot_summary?: string;
    recommendations?: Array<{
      id: string;
      title: string;
      poster: string;
      rate: string;
    }>;
  };
}> {
  // 检查缓存
  const cacheKey = getCacheKey('details', { id });
  const cached = await getCache(cacheKey);
  if (cached) {
    const title = cached.data?.title;
    const poster = cached.data?.poster;
    const isValid =
      cached.code === 200 &&
      typeof title === 'string' &&
      title.trim().length > 0 &&
      typeof poster === 'string' &&
      poster.trim().length > 0;

    if (isValid) {
      return cached;
    }
  }

  try {
    const response = await fetch(`/api/douban/details?id=${id}`);

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const result = await response.json();

    // 保存到缓存
    if (
      result.code === 200 &&
      result.data &&
      typeof result.data.title === 'string' &&
      result.data.title.trim().length > 0 &&
      typeof result.data.poster === 'string' &&
      result.data.poster.trim().length > 0
    ) {
      await setCache(cacheKey, result, DOUBAN_CACHE_EXPIRE.details);
    }

    return result;
  } catch (error) {
    return {
      code: 500,
      message: `获取豆瓣详情失败: ${(error as Error).message}`,
    };
  }
}

async function fetchDoubanRecommends(
  params: DoubanRecommendsParams,
  proxyUrl: string,
  useTencentCDN = false,
  useAliCDN = false,
): Promise<DoubanResult> {
  const { kind, pageLimit = 20, pageStart = 0 } = params;
  let { category, format, region, year, platform, sort, label } = params;
  if (category === 'all') {
    category = '';
  }
  if (format === 'all') {
    format = '';
  }
  if (label === 'all') {
    label = '';
  }
  if (region === 'all') {
    region = '';
  }
  if (year === 'all') {
    year = '';
  }
  if (platform === 'all') {
    platform = '';
  }
  if (sort === 'T') {
    sort = '';
  }

  const selectedCategories = { 类型: category } as any;
  if (format) {
    selectedCategories['形式'] = format;
  }
  if (region) {
    selectedCategories['地区'] = region;
  }

  const tags = [] as Array<string>;
  if (category) {
    tags.push(category);
  }
  if (!category && format) {
    tags.push(format);
  }
  if (label) {
    tags.push(label);
  }
  if (region) {
    tags.push(region);
  }
  if (year) {
    tags.push(year);
  }
  if (platform) {
    tags.push(platform);
  }

  const baseUrl = useTencentCDN
    ? `https://m.douban.cmliussss.net/rexxar/api/v2/${kind}/recommend`
    : useAliCDN
      ? `https://m.douban.cmliussss.com/rexxar/api/v2/${kind}/recommend`
      : `https://m.douban.com/rexxar/api/v2/${kind}/recommend`;
  const reqParams = new URLSearchParams();
  reqParams.append('refresh', '0');
  reqParams.append('start', pageStart.toString());
  reqParams.append('count', pageLimit.toString());
  reqParams.append('selected_categories', JSON.stringify(selectedCategories));
  reqParams.append('uncollect', 'false');
  reqParams.append('score_range', '0,10');
  reqParams.append('tags', tags.join(','));
  if (sort) {
    reqParams.append('sort', sort);
  }
  const target = `${baseUrl}?${reqParams.toString()}`;
  try {
    const doubanData = await fetchJsonWithTimeout<DoubanRecommendApiResponse>(
      target,
      useTencentCDN || useAliCDN ? '' : proxyUrl,
    );

    const list: DoubanItem[] = doubanData.items
      .filter((item) => item.type == 'movie' || item.type == 'tv')
      .map((item) => ({
        id: item.id,
        title: item.title,
        poster: item.pic?.normal || item.pic?.large || '',
        rate: item.rating?.value ? item.rating.value.toFixed(1) : '',
        year: item.year,
      }));

    return {
      code: 200,
      message: '获取成功',
      list: list,
    };
  } catch (error) {
    throw new Error(`获取豆瓣推荐数据失败: ${(error as Error).message}`);
  }
}

/**
 * 获取豆瓣影片短评
 */
interface DoubanCommentsParams {
  id: string;
  start?: number;
  limit?: number;
  sort?: 'new_score' | 'time';
}

// 请求去重：避免同一个短评请求被多次并发触发
const pendingDoubanCommentRequests = new Map<
  string,
  Promise<DoubanCommentsResult>
>();

export async function getDoubanComments(
  params: DoubanCommentsParams,
): Promise<DoubanCommentsResult> {
  const { id, start = 0, limit = 10, sort = 'new_score' } = params;

  // 验证参数
  if (!id) {
    return {
      code: 400,
      message: 'id 参数不能为空',
    };
  }

  if (limit < 1 || limit > 50) {
    return {
      code: 400,
      message: 'limit 必须在 1-50 之间',
    };
  }

  if (start < 0) {
    return {
      code: 400,
      message: 'start 不能小于 0',
    };
  }

  // 检查缓存
  const cacheKey = getCacheKey('comments', { id, start, limit, sort });
  const cached = await getCache(cacheKey);
  if (cached && cached.code === 200) {
    // 兼容旧缓存格式：确保 comments 字段存在且为数组
    const comments = cached.data?.comments;
    if (Array.isArray(comments)) {
      // 非空：直接命中
      if (comments.length > 0) {
        return cached as DoubanCommentsResult;
      }

      // 空：只认可“负缓存”（带标记且未过期），否则认为是旧空缓存/挑战页误解析，需要回源刷新
      const isEmptyCache = cached.data?.__empty_cache === true;
      const cachedAt = cached.data?.__cached_at;
      if (
        isEmptyCache &&
        typeof cachedAt === 'number' &&
        Date.now() - cachedAt <= DOUBAN_EMPTY_COMMENTS_EXPIRE * 1000
      ) {
        return cached as DoubanCommentsResult;
      }
    }
  }

  const pending = pendingDoubanCommentRequests.get(cacheKey);
  if (pending) return pending;

  const requestPromise = (async (): Promise<DoubanCommentsResult> => {
    try {
      const response = await fetch(
        `/api/douban/comments?id=${id}&start=${start}&limit=${limit}&sort=${sort}`,
      );

      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }

      const result = (await response.json()) as DoubanCommentsResult;

      // 保存到缓存：
      // - 非空：正常 TTL
      // - 空：写入“负缓存”标记 + 短 TTL，避免反复拉取/刷屏，同时允许较快回填
      if (result.code === 200) {
        const comments = result.data?.comments;
        const commentCount = Array.isArray(comments) ? comments.length : 0;
        const expireSeconds =
          commentCount > 0
            ? DOUBAN_CACHE_EXPIRE.comments
            : DOUBAN_EMPTY_COMMENTS_EXPIRE;
        const resultToCache =
          commentCount > 0
            ? result
            : ({
                ...result,
                data: {
                  ...(result.data || {
                    comments: [],
                    start,
                    limit,
                    count: 0,
                  }),
                  __empty_cache: true,
                  __cached_at: Date.now(),
                },
              } as any);
        await setCache(cacheKey, resultToCache, expireSeconds);
      }

      return result;
    } catch (error) {
      return {
        code: 500,
        message: `获取豆瓣短评失败: ${(error as Error).message}`,
      };
    } finally {
      pendingDoubanCommentRequests.delete(cacheKey);
    }
  })();

  pendingDoubanCommentRequests.set(cacheKey, requestPromise);
  return requestPromise;
}
