/* eslint-disable @typescript-eslint/no-explicit-any,no-console,no-case-declarations */

import {
  type DoubanRecentHotResponse,
  buildDoubanCategoryUrl,
  DOUBAN_RECENT_HOT_HOSTS,
  mapDoubanRecentHotItems,
} from '@/lib/douban-shared';

import { ClientCache } from './client-cache';
import { withAbortableTimeout } from './promise-timeout';
import { DoubanCommentsResult, DoubanItem, DoubanResult } from './types';

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

// 缓存工具函数
function getCacheKey(prefix: string, params: Record<string, any>): string {
  const sortedParams = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join('&');
  return `douban-${prefix}-${sortedParams}`;
}

// 统一缓存获取方法
async function getCache(key: string): Promise<any | null> {
  try {
    // 优先从统一存储获取
    const cached = await ClientCache.get(key);
    if (cached) return cached;

    // 兜底：从localStorage获取（兼容性）
    if (typeof localStorage !== 'undefined') {
      const localCached = localStorage.getItem(key);
      if (localCached) {
        const { data, expire } = JSON.parse(localCached);
        if (Date.now() <= expire) {
          return data;
        }
        localStorage.removeItem(key);
      }
    }

    return null;
  } catch (e) {
    console.warn('获取豆瓣缓存失败:', e);
    return null;
  }
}

// 统一缓存设置方法
async function setCache(
  key: string,
  data: any,
  expireSeconds: number
): Promise<void> {
  try {
    // 主要存储：统一存储
    await ClientCache.set(key, data, expireSeconds);

    // 兜底存储：localStorage（兼容性，短期缓存）
    if (typeof localStorage !== 'undefined') {
      try {
        const cacheData = {
          data,
          expire: Date.now() + expireSeconds * 1000,
          created: Date.now(),
        };
        localStorage.setItem(key, JSON.stringify(cacheData));
      } catch (e) {
        // localStorage可能满了，忽略错误
      }
    }
  } catch (e) {
    console.warn('设置豆瓣缓存失败:', e);
  }
}

// 清理过期缓存（包括bangumi缓存）
async function cleanExpiredCache(): Promise<void> {
  try {
    // 清理统一存储中的过期缓存
    await ClientCache.clearExpired('douban-');
    await ClientCache.clearExpired('bangumi-');

    // 清理localStorage中的过期缓存（兼容性）
    if (typeof localStorage !== 'undefined') {
      const keys = Object.keys(localStorage).filter(
        (key) => key.startsWith('douban-') || key.startsWith('bangumi-')
      );

      keys.forEach((key) => {
        try {
          const cached = localStorage.getItem(key);
          if (cached) {
            const { expire } = JSON.parse(cached);
            if (Date.now() > expire) {
              localStorage.removeItem(key);
            }
          }
        } catch (e) {
          // 清理损坏的缓存数据
          localStorage.removeItem(key);
        }
      });

    }
  } catch (e) {
    console.warn('清理过期缓存失败:', e);
  }
}

// 获取缓存状态信息（包括bangumi）
export function getDoubanCacheStats(): {
  totalItems: number;
  totalSize: number;
  byType: Record<string, number>;
} {
  if (typeof localStorage === 'undefined') {
    return { totalItems: 0, totalSize: 0, byType: {} };
  }

  const keys = Object.keys(localStorage).filter(
    (key) => key.startsWith('douban-') || key.startsWith('bangumi-')
  );
  const byType: Record<string, number> = {};
  let totalSize = 0;

  keys.forEach((key) => {
    const type = key.split('-')[1]; // douban-{type}-{params} 或 bangumi-{type}
    byType[type] = (byType[type] || 0) + 1;

    const data = localStorage.getItem(key);
    if (data) {
      totalSize += data.length;
    }
  });

  return {
    totalItems: keys.length,
    totalSize,
    byType,
  };
}

// 清理所有缓存（豆瓣+bangumi）
export function clearDoubanCache(): void {
  if (typeof localStorage === 'undefined') return;

  const keys = Object.keys(localStorage).filter(
    (key) => key.startsWith('douban-') || key.startsWith('bangumi-')
  );
  keys.forEach((key) => localStorage.removeItem(key));
}

// 初始化缓存系统（应该在应用启动时调用）
export async function initDoubanCache(): Promise<void> {
  if (typeof window === 'undefined') return;

  // 立即清理一次过期缓存
  await cleanExpiredCache();

  // 每10分钟清理一次过期缓存
  setInterval(() => cleanExpiredCache(), 10 * 60 * 1000);

}

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
  const finalUrl =
    proxyUrl === 'https://cors-anywhere.com/'
      ? `${proxyUrl}${url}`
      : proxyUrl
        ? `${proxyUrl}${encodeURIComponent(url)}`
        : url;

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
  params: DoubanListParams
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
        `/api/douban?tag=${tag}&type=${type}&pageSize=${pageLimit}&pageStart=${pageStart}`
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
  useAliCDN = false
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
        })
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
  params: DoubanRecommendsParams
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
        'https://ciao-cors.is-an.org/'
      );
      break;
    case 'direct':
    default:
      const response = await fetch(
        `/api/douban/recommends?kind=${kind}&limit=${pageLimit}&start=${pageStart}&category=${category}&format=${format}&region=${region}&year=${year}&platform=${platform}&sort=${sort}&label=${label}`
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
  useAliCDN = false
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
 * 按演员名字搜索相关电影/电视剧
 */
interface DoubanActorSearchParams {
  actorName: string;
  type?: 'movie' | 'tv';
  pageLimit?: number;
  pageStart?: number;
}

export async function getDoubanActorMovies(
  params: DoubanActorSearchParams
): Promise<DoubanResult> {
  const { actorName, type = 'movie', pageLimit = 20, pageStart = 0 } = params;

  // 验证参数
  if (!actorName?.trim()) {
    throw new Error('演员名字不能为空');
  }

  // 检查缓存
  const cacheKey = getCacheKey('actor', {
    actorName,
    type,
    pageLimit,
    pageStart,
  });
  const cached = await getCache(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    // 使用豆瓣搜索API
    const searchUrl = `https://search.douban.com/movie/subject_search?search_text=${encodeURIComponent(
      actorName.trim()
    )}`;

    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        Referer: 'https://www.douban.com/',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const html = await response.text();

    // 解析HTML中的JSON数据
    const dataMatch = html.match(/window\.__DATA__\s*=\s*({.*?});/s);
    if (!dataMatch) {
      throw new Error('无法解析搜索结果数据');
    }

    const searchData = JSON.parse(dataMatch[1]);
    const items = searchData.items || [];

    // 过滤掉第一个结果（通常是演员本人的资料页）和不相关的结果
    let filteredItems = items.slice(1).filter((item: any) => {
      // 过滤掉书籍等非影视内容
      const abstract = item.abstract || '';
      const isBook =
        abstract.includes('出版') ||
        abstract.includes('页数') ||
        item.url?.includes('/book/');
      const isPerson = item.url?.includes('/celebrity/');
      return !isBook && !isPerson;
    });

    // 按类型过滤
    if (type === 'movie') {
      filteredItems = filteredItems.filter((item: any) => {
        const abstract = item.abstract || '';
        return (
          !abstract.includes('季') &&
          !abstract.includes('集') &&
          !abstract.includes('剧集')
        );
      });
    } else if (type === 'tv') {
      filteredItems = filteredItems.filter((item: any) => {
        const abstract = item.abstract || '';
        return (
          abstract.includes('季') ||
          abstract.includes('集') ||
          abstract.includes('剧集') ||
          abstract.includes('电视')
        );
      });
    }

    // 分页处理
    const startIndex = pageStart;
    const endIndex = startIndex + pageLimit;
    const paginatedItems = filteredItems.slice(startIndex, endIndex);

    // 转换数据格式
    const list: DoubanItem[] = paginatedItems.map((item: any) => {
      // 从abstract中提取年份
      const yearMatch = item.abstract?.match(/(\d{4})/);
      const year = yearMatch ? yearMatch[1] : '';

      return {
        id: item.id?.toString() || '',
        title: item.title || '',
        poster: item.cover_url || '',
        rate: item.rating?.value ? item.rating.value.toFixed(1) : '',
        year: year,
      };
    });

    const result = {
      code: 200,
      message: '获取成功',
      list: list,
    };

    // 保存到缓存
    await setCache(cacheKey, result, DOUBAN_CACHE_EXPIRE.lists);

    return result;
  } catch (error) {
    console.error(`搜索演员 ${actorName} 失败:`, error);
    return {
      code: 500,
      message: `搜索演员 ${actorName} 失败: ${(error as Error).message}`,
      list: [],
    };
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
  params: DoubanCommentsParams
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
        `/api/douban/comments?id=${id}&start=${start}&limit=${limit}&sort=${sort}`
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
