/* eslint-disable @next/next/no-img-element */

'use client';

import { Search, Server, Tv } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ClientCache } from '@/lib/client-cache';
import type {
  DoubanItem,
  SearchResult as GlobalSearchResult,
} from '@/lib/types';
import { useSourceBrowserAnalytics } from '@/hooks/useSourceBrowserAnalytics';

import PageLayout from '@/components/PageLayout';

type Source = { key: string; name: string; api: string };
type Category = { type_id: string | number; type_name: string };
type Item = {
  id: string;
  title: string;
  poster: string;
  year: string;
  type_name?: string;
  remarks?: string;
};

// 执行一次分析埋点，任何异常只打印警告，不影响主功能
function trackAnalyticsSafely(fn: () => void) {
  try {
    fn();
  } catch (analyticsError) {
    // 忽略分析错误，避免影响主要功能
    console.warn('Analytics error:', analyticsError);
  }
}

// 统一提取错误文案：Error 实例取 message，否则使用默认文案
function toErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export default function SourceBrowserPage() {
  const router = useRouter();

  // 📊 源浏览器分析埋点
  const analytics = useSourceBrowserAnalytics({
    userId: '', // 可以根据实际用户系统传入
    userType: 'guest', // 可以根据实际用户系统传入
  });

  const [sources, setSources] = useState<Source[]>([]);
  const [loadingSources, setLoadingSources] = useState(true);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [activeSourceKey, setActiveSourceKey] = useState('');

  // 源列表筛选
  const [sourceFilter, setSourceFilter] = useState('');
  const filteredSources = useMemo(() => {
    if (!sourceFilter.trim()) return sources;
    const lower = sourceFilter.trim().toLowerCase();
    return sources.filter(
      (s) =>
        s.name.toLowerCase().includes(lower) ||
        s.key.toLowerCase().includes(lower),
    );
  }, [sources, sourceFilter]);

  const activeSource = useMemo(
    () => sources.find((s) => s.key === activeSourceKey),
    [sources, activeSourceKey],
  );

  const [categories, setCategories] = useState<Category[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | number>('');

  const [items, setItems] = useState<Item[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [itemsError, setItemsError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const hasMore = page < pageCount;
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const lastFetchAtRef = useRef(0);
  const autoFillInProgressRef = useRef(false);

  // 搜索与排序
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<'category' | 'search'>('category');
  const [sortBy, setSortBy] = useState<
    'default' | 'title-asc' | 'title-desc' | 'year-asc' | 'year-desc'
  >('default');
  const debounceIdRef = useRef<NodeJS.Timeout | null>(null);

  // 二级筛选（地区 / 年份 / 关键词）
  const [filterKeyword, setFilterKeyword] = useState('');
  const [filterYear, setFilterYear] = useState<string>('');
  const [availableYears, setAvailableYears] = useState<string[]>([]);

  // 详情预览
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<GlobalSearchResult | null>(
    null,
  );
  const [previewItem, setPreviewItem] = useState<Item | null>(null);
  const [previewDouban, setPreviewDouban] = useState<DoubanItem | null>(null);
  const [previewDoubanLoading, setPreviewDoubanLoading] = useState(false);
  const [previewDoubanId, setPreviewDoubanId] = useState<number | null>(null);
  type BangumiTag = { name: string };
  type BangumiInfoboxValue =
    | string
    | { v: string }
    | Array<string | { v: string }>;
  type BangumiInfoboxEntry = { key: string; value: BangumiInfoboxValue };
  type BangumiSubject = {
    name?: string;
    name_cn?: string;
    date?: string;
    rating?: { score?: number };
    tags?: BangumiTag[];
    infobox?: BangumiInfoboxEntry[];
    summary?: string;
  };
  const [previewBangumi, setPreviewBangumi] = useState<BangumiSubject | null>(
    null,
  );
  const [previewBangumiLoading, setPreviewBangumiLoading] = useState(false);
  const [previewSearchPick, setPreviewSearchPick] =
    useState<GlobalSearchResult | null>(null);

  const fetchSources = useCallback(async () => {
    setLoadingSources(true);
    setSourceError(null);
    const startTime = Date.now();
    try {
      const res = await fetch('/api/source-browser/sites', {
        cache: 'no-store',
      });
      if (res.status === 401) {
        throw new Error('登录状态已失效，请重新登录');
      }
      if (res.status === 403) {
        throw new Error('当前账号暂无可用资源站点');
      }
      if (!res.ok) throw new Error('获取源失败');
      const data = await res.json();
      const list: Source[] = data.sources || [];
      setSources(list);

      // 📊 分析埋点：源列表加载
      trackAnalyticsSafely(() =>
        analytics.handleSourceListLoad(
          list.length,
          Date.now() - startTime,
          list.map((s) => s.name),
        ),
      );

      if (list.length > 0) {
        setActiveSourceKey(list[0].key);
      }
    } catch (e: unknown) {
      const errorMessage = toErrorMessage(e, '获取源失败');
      setSourceError(errorMessage);

      // 📊 分析埋点：源列表加载错误
      trackAnalyticsSafely(() =>
        analytics.handleSourceError('network', errorMessage, ''),
      );
    } finally {
      setLoadingSources(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 刻意窄依赖：analytics 为每渲染重建的对象，加入依赖会使 fetchSources 每渲染重建并触发挂载 effect 重复请求；其内部 handler 均为稳定 useCallback
  }, []); // 移除 analytics 依赖

  const fetchCategories = useCallback(async (sourceKey: string) => {
    if (!sourceKey) return;
    setLoadingCategories(true);
    setCategoryError(null);
    try {
      const res = await fetch(
        `/api/source-browser/categories?source=${encodeURIComponent(sourceKey)}`,
      );
      if (!res.ok) throw new Error('获取分类失败');
      const data = await res.json();
      const list: Category[] = data.categories || [];
      setCategories(list);
      if (list.length > 0) {
        setActiveCategory(list[0].type_id);
      } else {
        setActiveCategory('');
      }
    } catch (e: unknown) {
      setCategoryError(toErrorMessage(e, '获取分类失败'));
      setCategories([]);
      setActiveCategory('');
    } finally {
      setLoadingCategories(false);
    }
  }, []);

  const fetchItems = useCallback(
    async (
      sourceKey: string,
      typeId: string | number,
      p = 1,
      append = false,
    ) => {
      if (!sourceKey || !typeId) return;
      if (append) setLoadingMore(true);
      else setLoadingItems(true);
      setItemsError(null);
      try {
        const res = await fetch(
          `/api/source-browser/list?source=${encodeURIComponent(
            sourceKey,
          )}&type_id=${encodeURIComponent(String(typeId))}&page=${p}`,
        );
        if (!res.ok) throw new Error('获取列表失败');
        const data = (await res.json()) as {
          items?: Item[];
          meta?: { page?: number; pagecount?: number };
        };
        const list: Item[] = data.items || [];
        setItems((prev) => (append ? [...prev, ...list] : list));
        setPage(Number(data.meta?.page || p));
        setPageCount(Number(data.meta?.pagecount || 1));
        // 更新可选年份
        const years = Array.from(
          new Set(list.map((i) => (i.year || '').trim()).filter(Boolean)),
        );
        years.sort((a, b) => (parseInt(b) || 0) - (parseInt(a) || 0));
        setAvailableYears(years);
      } catch (e: unknown) {
        setItemsError(toErrorMessage(e, '获取列表失败'));
        if (!append) setItems([]);
        setPage(1);
        setPageCount(1);
        setAvailableYears([]);
      } finally {
        if (append) setLoadingMore(false);
        else setLoadingItems(false);
      }
    },
    [],
  );

  useEffect(() => {
    fetchSources();
  }, [fetchSources]);
  useEffect(() => {
    if (activeSourceKey) fetchCategories(activeSourceKey);
  }, [activeSourceKey, fetchCategories]);
  useEffect(() => {
    if (activeSourceKey && activeCategory && mode === 'category') {
      // 重置列表并加载第一页
      setItems([]);
      setPage(1);
      setPageCount(1);
      fetchItems(activeSourceKey, activeCategory, 1, false);
    }
  }, [activeSourceKey, activeCategory, mode, fetchItems]);

  const fetchSearch = useCallback(
    async (sourceKey: string, q: string, p = 1, append = false) => {
      if (!sourceKey || !q) return;
      if (append) setLoadingMore(true);
      else setLoadingItems(true);
      setItemsError(null);
      try {
        const res = await fetch(
          `/api/source-browser/search?source=${encodeURIComponent(
            sourceKey,
          )}&q=${encodeURIComponent(q)}&page=${p}`,
        );
        if (!res.ok) throw new Error('搜索失败');
        const data = (await res.json()) as {
          items?: Item[];
          meta?: { page?: number; pagecount?: number };
        };
        const list: Item[] = data.items || [];
        setItems((prev) => (append ? [...prev, ...list] : list));
        setPage(Number(data.meta?.page || p));
        setPageCount(Number(data.meta?.pagecount || 1));
        const years = Array.from(
          new Set(list.map((i) => (i.year || '').trim()).filter(Boolean)),
        );
        years.sort((a, b) => (parseInt(b) || 0) - (parseInt(a) || 0));
        setAvailableYears(years);
      } catch (e: unknown) {
        setItemsError(toErrorMessage(e, '搜索失败'));
        if (!append) setItems([]);
        setPage(1);
        setPageCount(1);
        setAvailableYears([]);
      } finally {
        if (append) setLoadingMore(false);
        else setLoadingItems(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (activeSourceKey && mode === 'search' && query.trim()) {
      // 重置列表并加载第一页
      setItems([]);
      setPage(1);
      setPageCount(1);
      fetchSearch(activeSourceKey, query.trim(), 1, false);
    }
  }, [activeSourceKey, mode, query, fetchSearch]);

  // IntersectionObserver 处理自动翻页（含简单节流）
  useEffect(() => {
    if (!loadMoreRef.current) return;
    const el = loadMoreRef.current;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting) {
          const now = Date.now();
          const intervalOk = now - lastFetchAtRef.current > 700; // 700ms 节流
          if (
            !loadingItems &&
            !loadingMore &&
            hasMore &&
            activeSourceKey &&
            intervalOk
          ) {
            lastFetchAtRef.current = now;
            const next = page + 1;
            if (mode === 'search' && query.trim()) {
              fetchSearch(activeSourceKey, query.trim(), next, true);
            } else if (mode === 'category' && activeCategory) {
              fetchItems(activeSourceKey, activeCategory, next, true);
            }
          }
        }
      },
      { root: null, rootMargin: '200px', threshold: 0 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [
    loadingItems,
    loadingMore,
    hasMore,
    page,
    mode,
    activeSourceKey,
    activeCategory,
    query,
    fetchItems,
    fetchSearch,
  ]);

  // 首屏填充：若列表高度不足以产生滚动且仍有更多，则自动连续翻页尝试填满视口
  useEffect(() => {
    const tryAutoFill = async () => {
      if (autoFillInProgressRef.current) return;
      if (!loadMoreRef.current) return;
      if (loadingItems || loadingMore || !hasMore) return;
      const sentinel = loadMoreRef.current.getBoundingClientRect();
      const inViewport = sentinel.top <= window.innerHeight + 100;
      if (!inViewport) return;

      autoFillInProgressRef.current = true;
      try {
        let iterations = 0;
        while (iterations < 5) {
          // 最多连续加载5页以防过载
          if (!hasMore) break;
          const now = Date.now();
          if (now - lastFetchAtRef.current <= 400) break; // 避免过于频繁
          lastFetchAtRef.current = now;
          const next = page + iterations + 1;
          if (mode === 'search' && query.trim()) {
            await fetchSearch(activeSourceKey, query.trim(), next, true);
          } else if (mode === 'category' && activeCategory) {
            await fetchItems(activeSourceKey, activeCategory, next, true);
          } else {
            break;
          }
          iterations++;

          // 重新检测是否还在视口之内（内容增长可能已挤出视口）
          if (!loadMoreRef.current) break;
          const rect = loadMoreRef.current.getBoundingClientRect();
          if (rect.top > window.innerHeight + 100) break;
        }
      } finally {
        autoFillInProgressRef.current = false;
      }
    };

    // 异步执行以等待布局更新
    const id = setTimeout(tryAutoFill, 50);
    return () => clearTimeout(id);
  }, [
    items,
    page,
    pageCount,
    hasMore,
    loadingItems,
    loadingMore,
    mode,
    activeSourceKey,
    activeCategory,
    query,
    fetchItems,
    fetchSearch,
  ]);

  const filteredAndSorted = useMemo(() => {
    let arr = [...items];
    // 关键词/地区筛选（包含于标题或备注）
    if (filterKeyword.trim()) {
      const kw = filterKeyword.trim().toLowerCase();
      arr = arr.filter(
        (i) =>
          (i.title || '').toLowerCase().includes(kw) ||
          (i.remarks || '').toLowerCase().includes(kw),
      );
    }
    // 年份筛选（精确匹配）
    if (filterYear) {
      arr = arr.filter((i) => (i.year || '').trim() === filterYear);
    }
    switch (sortBy) {
      case 'title-asc':
        return arr.sort((a, b) => a.title.localeCompare(b.title));
      case 'title-desc':
        return arr.sort((a, b) => b.title.localeCompare(a.title));
      case 'year-asc':
        return arr.sort(
          (a, b) => (parseInt(a.year) || 0) - (parseInt(b.year) || 0),
        );
      case 'year-desc':
        return arr.sort(
          (a, b) => (parseInt(b.year) || 0) - (parseInt(a.year) || 0),
        );
      default:
        return arr; // 保持上游顺序
    }
  }, [items, sortBy, filterKeyword, filterYear]);

  const fetchDoubanDetails = async (doubanId: number) => {
    try {
      setPreviewDoubanLoading(true);
      setPreviewDouban(null);
      const keyRaw = `douban-details-id=${doubanId}`;
      // 1) 先查缓存（与全站一致的 ClientCache）
      const cached = (await ClientCache.get(keyRaw)) as DoubanItem | null;
      if (cached) {
        setPreviewDouban(cached);
        return;
      }

      // 2) 缓存未命中，回源请求 /api/douban/details
      const fallback = await fetch(
        `/api/douban/details?id=${encodeURIComponent(String(doubanId))}`,
      );
      if (fallback.ok) {
        const dbData = (await fallback.json()) as
          | { code: number; message: string; data?: DoubanItem }
          | DoubanItem;
        const normalized =
          (dbData as { data?: DoubanItem }).data || (dbData as DoubanItem);
        setPreviewDouban(normalized);
        // 3) 回写缓存（4小时）
        try {
          await ClientCache.set(keyRaw, normalized, 14400);
        } catch (err) {
          void err; // ignore cache write failure
        }
      } else {
        setPreviewDouban(null);
      }
    } catch (e) {
      // ignore
    } finally {
      setPreviewDoubanLoading(false);
    }
  };

  // bangumi工具
  const isBangumiId = (id: number): boolean =>
    id > 0 && id.toString().length === 6;
  const fetchBangumiDetails = async (bangumiId: number) => {
    try {
      setPreviewBangumiLoading(true);
      setPreviewBangumi(null);
      const res = await fetch(`https://api.bgm.tv/v0/subjects/${bangumiId}`);
      if (res.ok) {
        const data = (await res.json()) as {
          name?: string;
          name_cn?: string;
          date?: string;
          rating?: { score?: number };
          tags?: { name: string }[];
          infobox?: { key: string; value: BangumiInfoboxValue }[];
          summary?: string;
        };
        setPreviewBangumi(data);
      }
    } catch (e) {
      // ignore
    } finally {
      setPreviewBangumiLoading(false);
    }
  };

  const openPreview = async (item: Item) => {
    setPreviewItem(item);
    setPreviewOpen(true);
    setPreviewLoading(true);
    setPreviewError(null);
    setPreviewData(null);
    setPreviewDouban(null);
    setPreviewDoubanId(null);
    setPreviewBangumi(null);
    setPreviewSearchPick(null);
    try {
      const res = await fetch(
        `/api/detail?source=${encodeURIComponent(
          activeSourceKey,
        )}&id=${encodeURIComponent(item.id)}`,
      );
      if (!res.ok) throw new Error('获取详情失败');
      const data = (await res.json()) as GlobalSearchResult;
      setPreviewData(data);
      // 处理 douban_id：优先 /api/detail，其次通过 /api/search/one 指定站点精确匹配推断
      let dId: number | null = data?.douban_id ? Number(data.douban_id) : null;
      if (!dId) {
        // 在当前源内精确搜索标题以获取带有 douban_id 的条目
        const normalize = (s: string) =>
          (s || '').replace(/\s+/g, '').toLowerCase();
        const variants = Array.from(
          new Set([item.title, (item.title || '').replace(/\s+/g, '')]),
        ).filter(Boolean) as string[];

        for (const v of variants) {
          try {
            const res = await fetch(
              `/api/search/one?resourceId=${encodeURIComponent(
                activeSourceKey,
              )}&q=${encodeURIComponent(v)}`,
            );
            if (!res.ok) continue;
            const payload = (await res.json()) as {
              results?: GlobalSearchResult[];
            };
            const list: GlobalSearchResult[] = payload.results || [];
            // 优先标题+年份匹配
            const tNorm = normalize(item.title);
            const matchStrict = list.find(
              (r) =>
                normalize(r.title) === tNorm &&
                (!item.year ||
                  (r.year &&
                    String(r.year).toLowerCase() ===
                      String(item.year).toLowerCase())) &&
                r.douban_id,
            );
            const matchTitleOnly = list.find(
              (r) => normalize(r.title) === tNorm && r.douban_id,
            );
            const pick = matchStrict || matchTitleOnly || null;
            if (pick && pick.douban_id) {
              dId = Number(pick.douban_id);
              setPreviewSearchPick(pick);
              break;
            }
          } catch {
            // ignore
          }
        }
      }
      if (dId && dId > 0) {
        setPreviewDoubanId(dId);
        if (isBangumiId(dId)) {
          await fetchBangumiDetails(dId);
        } else {
          await fetchDoubanDetails(dId);
        }
      }
    } catch (e: unknown) {
      setPreviewError(toErrorMessage(e, '获取详情失败'));
    } finally {
      setPreviewLoading(false);
    }
  };

  const goPlay = (item: Item) => {
    const params = new URLSearchParams();
    params.set('source', activeSourceKey);
    params.set('id', item.id);
    const mergedTitle = (previewData?.title || item.title || '').toString();
    const mergedYear = (previewData?.year || item.year || '').toString();
    if (mergedTitle) params.set('title', mergedTitle);
    if (mergedYear) params.set('year', mergedYear);
    if (previewDoubanId) params.set('douban_id', String(previewDoubanId));
    params.set('prefer', 'true');
    router.push(`/play?${params.toString()}`);
  };

  return (
    <PageLayout activePath='/source-browser'>
      <div className='max-w-7xl mx-auto px-4 md:px-6 py-4 md:py-5 space-y-5'>
        {/* 来源站选择条：横向滚动 + 过滤 */}
        <section>
          <div className='flex items-center justify-between gap-3 mb-2.5'>
            <div className='flex items-center gap-2 text-sm font-semibold text-[#111111] dark:text-[#f5f5f5]'>
              <Server className='w-4 h-4 text-[#00a304] dark:text-[#1acd50]' />
              选择来源站
              {!loadingSources && sources.length > 0 && (
                <span className='text-xs px-2 py-0.5 rounded-full bg-[#00be06]/10 dark:bg-[#00be06]/15 text-[#00a304] dark:text-[#1acd50] font-medium'>
                  {sources.length}
                </span>
              )}
            </div>
            {!loadingSources && sources.length > 10 && (
              <div className='relative w-44 sm:w-56 shrink-0'>
                <input
                  type='text'
                  value={sourceFilter}
                  onChange={(e) => setSourceFilter(e.target.value)}
                  placeholder='筛选来源站...'
                  className='w-full pl-8 pr-3 py-1.5 text-sm rounded-lg border border-[#e8e8e8] dark:border-[#3a3a3a] bg-white dark:bg-[#2a2a2a] text-[#111111] dark:text-[#f5f5f5] placeholder:text-[#8f8f8f] focus:border-[#00be06] focus:ring-2 focus:ring-[#00be06]/20 outline-none transition-colors'
                />
                <Search className='absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#8f8f8f] pointer-events-none' />
              </div>
            )}
          </div>

          {loadingSources ? (
            <div className='flex items-center gap-2 text-sm text-[#5f5f5f] dark:text-[#a8a8a8] py-3'>
              <div className='w-4 h-4 border-2 border-[#00be06] border-t-transparent rounded-full animate-spin'></div>
              加载中...
            </div>
          ) : sourceError ? (
            <div className='px-4 py-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-600 dark:text-red-400'>
              {sourceError}
            </div>
          ) : sources.length === 0 ? (
            <div className='text-center py-8'>
              <div className='w-14 h-14 mx-auto mb-3 rounded-full bg-[#e8e8e8] dark:bg-[#2a2a2a] flex items-center justify-center'>
                <Server className='w-6 h-6 text-[#8f8f8f]' />
              </div>
              <p className='text-sm text-[#5f5f5f] dark:text-[#a8a8a8]'>
                暂无可用来源
              </p>
            </div>
          ) : (
            <div className='relative'>
              <div className='flex flex-wrap gap-2 pb-1.5'>
                {filteredSources.map((s) => (
                  <button
                    key={s.key}
                    onClick={() => {
                      // 📊 分析埋点：源切换
                      trackAnalyticsSafely(() =>
                        analytics.handleSourceClick(
                          {
                            id: s.key,
                            name: s.name,
                            url: s.api,
                            type: 'api',
                            status: 'active',
                            lastChecked: new Date(),
                            itemCount: 0,
                            category: 'unknown',
                            language: 'unknown',
                          },
                          filteredSources.findIndex((x) => x.key === s.key),
                          'all',
                        ),
                      );
                      setActiveSourceKey(s.key);
                    }}
                    className={`shrink-0 px-3.5 py-1.5 rounded-full text-sm font-medium border transition-colors whitespace-nowrap ${
                      activeSourceKey === s.key
                        ? 'bg-[#00be06] border-[#00be06] text-white'
                        : 'bg-transparent border-[#d9d9d9] dark:border-[#3a3a3a] text-[#5f5f5f] dark:text-[#a8a8a8] hover:border-[#00be06] hover:text-[#00a304] dark:hover:text-[#1acd50]'
                    }`}
                  >
                    {s.name}
                  </button>
                ))}
                {filteredSources.length === 0 && sourceFilter && (
                  <div className='text-sm text-[#5f5f5f] dark:text-[#a8a8a8] py-1.5 px-1'>
                    未找到匹配 &quot;{sourceFilter}&quot; 的来源
                  </div>
                )}
              </div>
            </div>
          )}
        </section>

        {/* 工具栏：搜索 + 排序/筛选 */}
        {activeSource && (
          <section className='flex flex-col sm:flex-row gap-2.5'>
            <div className='relative flex-1 min-w-0'>
              <Search className='absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8f8f8f] pointer-events-none' />
              <input
                value={query}
                onChange={(e) => {
                  const val = e.target.value;
                  setQuery(val);
                  if (debounceIdRef.current) {
                    clearTimeout(debounceIdRef.current);
                  }
                  debounceIdRef.current = setTimeout(() => {
                    setMode(val.trim() ? 'search' : 'category');
                    if (val.trim()) {
                      fetchSearch(activeSourceKey, val.trim(), 1);
                    } else if (activeCategory) {
                      fetchItems(activeSourceKey, activeCategory, 1);
                    }
                  }, 500);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    setMode(query.trim() ? 'search' : 'category');
                  }
                }}
                placeholder='输入关键词搜索当前源；清空回车恢复分类浏览'
                className='w-full pl-9 pr-9 py-2 rounded-lg border border-[#e8e8e8] dark:border-[#3a3a3a] bg-white dark:bg-[#2a2a2a] text-sm text-[#111111] dark:text-[#f5f5f5] placeholder:text-[#8f8f8f] focus:border-[#00be06] focus:ring-2 focus:ring-[#00be06]/20 outline-none transition-colors'
              />
              {query && (
                <button
                  onClick={() => {
                    setQuery('');
                    setMode('category');
                    if (activeCategory)
                      fetchItems(activeSourceKey, activeCategory, 1);
                  }}
                  className='absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-full text-[#8f8f8f] hover:text-[#111111] dark:hover:text-[#f5f5f5] hover:bg-[#e8e8e8] dark:hover:bg-[#3a3a3a] transition-colors'
                  title='清除搜索'
                  aria-label='清除搜索'
                >
                  <svg
                    className='w-3.5 h-3.5'
                    fill='none'
                    stroke='currentColor'
                    viewBox='0 0 24 24'
                  >
                    <path
                      strokeLinecap='round'
                      strokeLinejoin='round'
                      strokeWidth={2}
                      d='M6 18L18 6M6 6l12 12'
                    />
                  </svg>
                </button>
              )}
            </div>
            <div className='grid grid-cols-3 sm:flex gap-2 shrink-0'>
              <select
                value={sortBy}
                onChange={(e) =>
                  setSortBy(
                    e.target.value as
                      | 'default'
                      | 'title-asc'
                      | 'title-desc'
                      | 'year-asc'
                      | 'year-desc',
                  )
                }
                className='px-2.5 py-2 rounded-lg border border-[#e8e8e8] dark:border-[#3a3a3a] bg-white dark:bg-[#2a2a2a] text-xs sm:text-sm text-[#111111] dark:text-[#f5f5f5] focus:border-[#00be06] outline-none transition-colors'
                title='排序'
              >
                <option value='default'>默认排序</option>
                <option value='title-asc'>标题 A→Z</option>
                <option value='title-desc'>标题 Z→A</option>
                <option value='year-asc'>年份 ↑</option>
                <option value='year-desc'>年份 ↓</option>
              </select>
              <select
                value={filterYear}
                onChange={(e) => setFilterYear(e.target.value)}
                className='px-2.5 py-2 rounded-lg border border-[#e8e8e8] dark:border-[#3a3a3a] bg-white dark:bg-[#2a2a2a] text-xs sm:text-sm text-[#111111] dark:text-[#f5f5f5] focus:border-[#00be06] outline-none transition-colors'
                title='年份'
              >
                <option value=''>全部年份</option>
                {availableYears.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
              <input
                value={filterKeyword}
                onChange={(e) => {
                  setFilterKeyword(e.target.value);
                  // 📊 分析埋点：关键词筛选
                  if (e.target.value.trim()) {
                    trackAnalyticsSafely(() =>
                      analytics.handleSearch(e.target.value.trim(), 0, 0),
                    );
                  }
                }}
                placeholder='地区/关键词'
                className='px-2.5 py-2 rounded-lg border border-[#e8e8e8] dark:border-[#3a3a3a] bg-white dark:bg-[#2a2a2a] text-xs sm:text-sm text-[#111111] dark:text-[#f5f5f5] placeholder:text-[#8f8f8f] focus:border-[#00be06] focus:ring-2 focus:ring-[#00be06]/20 outline-none transition-colors min-w-0'
              />
            </div>
          </section>
        )}

        {/* 内容区：分类行 + 海报网格 */}
        {activeSource && (
          <section>
            {/* 分类 chips */}
            {mode === 'category' && (
              <div className='flex flex-wrap gap-2 pb-1 mb-4'>
                {loadingCategories ? (
                  <div className='flex items-center gap-2 text-sm text-[#5f5f5f] dark:text-[#a8a8a8] py-1'>
                    <div className='w-4 h-4 border-2 border-[#00be06] border-t-transparent rounded-full animate-spin'></div>
                    加载分类...
                  </div>
                ) : categoryError ? (
                  <div className='px-4 py-2.5 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-600 dark:text-red-400'>
                    {categoryError}
                  </div>
                ) : categories.length === 0 ? (
                  <p className='text-sm text-[#5f5f5f] dark:text-[#a8a8a8] py-1'>
                    暂无分类
                  </p>
                ) : (
                  categories.map((c) => (
                    <button
                      key={String(c.type_id)}
                      onClick={() => {
                        // 📊 分析埋点：分类切换
                        trackAnalyticsSafely(() =>
                          analytics.handleFilterChange(
                            'category',
                            c.type_name || String(c.type_id),
                          ),
                        );
                        setActiveCategory(c.type_id);
                      }}
                      className={`shrink-0 px-3.5 py-1.5 rounded-full text-sm font-medium border transition-colors whitespace-nowrap ${
                        activeCategory === c.type_id
                          ? 'bg-[#00be06] border-[#00be06] text-white'
                          : 'bg-transparent border-[#d9d9d9] dark:border-[#3a3a3a] text-[#5f5f5f] dark:text-[#a8a8a8] hover:border-[#00be06] hover:text-[#00a304] dark:hover:text-[#1acd50]'
                      }`}
                    >
                      {c.type_name}
                    </button>
                  ))
                )}
              </div>
            )}

            {/* 内容网格 */}
            {loadingItems ? (
              <div className='grid gap-x-3 gap-y-5 grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6'>
                {Array.from({ length: 12 }).map((_, i) => (
                  <div key={i}>
                    <div className='aspect-[2/3] rounded-lg bg-[#e8e8e8] dark:bg-[#2a2a2a] animate-pulse' />
                    <div className='mt-2 h-3.5 rounded bg-[#e8e8e8] dark:bg-[#2a2a2a] animate-pulse' />
                  </div>
                ))}
              </div>
            ) : itemsError ? (
              <div className='px-4 py-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-600 dark:text-red-400'>
                {itemsError}
              </div>
            ) : items.length === 0 ? (
              <div className='text-center py-12'>
                <div className='w-16 h-16 mx-auto mb-3 rounded-full bg-[#e8e8e8] dark:bg-[#2a2a2a] flex items-center justify-center'>
                  <Tv className='w-7 h-7 text-[#8f8f8f]' />
                </div>
                <p className='text-sm text-[#5f5f5f] dark:text-[#a8a8a8]'>
                  暂无内容
                </p>
              </div>
            ) : (
              <>
                <div className='grid gap-x-3 gap-y-5 grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6'>
                  {filteredAndSorted.map((item) => (
                    <div
                      key={item.id}
                      className='group cursor-pointer'
                      onClick={() => {
                        // 📊 分析埋点：内容点击
                        trackAnalyticsSafely(() =>
                          analytics.handleSourceClick(
                            {
                              id: item.id,
                              name: item.title,
                              url: '',
                              type: 'api',
                              status: 'active',
                              lastChecked: new Date(),
                              itemCount: 0,
                              category: activeSourceKey,
                              language: 'unknown',
                            },
                            filteredAndSorted.findIndex(
                              (x) => x.id === item.id,
                            ),
                            'category',
                          ),
                        );
                        openPreview(item);
                      }}
                      role='button'
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          trackAnalyticsSafely(() =>
                            analytics.handleSourceClick(
                              {
                                id: item.id,
                                name: item.title,
                                url: '',
                                type: 'api',
                                status: 'active',
                                lastChecked: new Date(),
                                itemCount: 0,
                                category: activeSourceKey,
                                language: 'unknown',
                              },
                              filteredAndSorted.findIndex(
                                (x) => x.id === item.id,
                              ),
                              'category',
                            ),
                          );
                          openPreview(item);
                        }
                      }}
                    >
                      <div className='relative aspect-[2/3] rounded-lg overflow-hidden bg-[#e8e8e8] dark:bg-[#2a2a2a] transition-transform duration-300 group-hover:scale-[1.02]'>
                        {item.poster ? (
                          <img
                            src={item.poster}
                            alt={item.title}
                            className='w-full h-full object-cover'
                            loading='lazy'
                          />
                        ) : (
                          <div className='w-full h-full flex flex-col items-center justify-center text-[#8f8f8f]'>
                            <Tv className='w-8 h-8 opacity-50 mb-1' />
                            <span className='text-xs'>无封面</span>
                          </div>
                        )}
                        {/* 备注角标（集数/状态） */}
                        {item.remarks && (
                          <span className='absolute top-1.5 left-1.5 max-w-[85%] px-1.5 py-0.5 rounded bg-[#00be06] text-white text-[10px] font-medium truncate'>
                            {item.remarks}
                          </span>
                        )}
                        {/* 年份角标 */}
                        {item.year && (
                          <span className='absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded bg-black/60 backdrop-blur-sm text-white text-[10px]'>
                            {item.year}
                          </span>
                        )}
                      </div>
                      <p className='mt-1.5 text-sm font-medium text-[#111111] dark:text-[#f5f5f5] line-clamp-1 group-hover:text-[#00a304] dark:group-hover:text-[#57e07a] transition-colors'>
                        {item.title}
                      </p>
                      <p className='text-xs text-[#8f8f8f] truncate mt-0.5'>
                        {item.type_name || ' '}
                      </p>
                    </div>
                  ))}
                </div>
                {/* 无限滚动哨兵 */}
                <div
                  ref={loadMoreRef}
                  className='mt-6 flex items-center justify-center py-3'
                >
                  {loadingMore ? (
                    <div className='w-5 h-5 border-2 border-[#00be06] border-t-transparent rounded-full animate-spin'></div>
                  ) : hasMore ? (
                    <div className='text-xs text-[#8f8f8f]'>下拉加载更多</div>
                  ) : (
                    <div className='text-xs text-[#8f8f8f]'>没有更多了</div>
                  )}
                </div>
              </>
            )}
          </section>
        )}

        {/* 详情预览弹层 */}
        {previewOpen && (
          <div
            className='fixed inset-0 z-[1000] flex items-center justify-center bg-black/70 backdrop-blur-sm px-3 py-6 sm:p-4 pb-20 md:pb-4 animate-fadeIn'
            role='dialog'
            aria-modal='true'
            onClick={() => setPreviewOpen(false)}
          >
            <div
              className='w-full max-w-4xl bg-white dark:bg-[#141414] rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] md:max-h-[88vh] border border-[#e8e8e8] dark:border-[#3a3a3a] animate-scaleIn'
              onClick={(e) => e.stopPropagation()}
            >
              {/* 头部：标题 + 关闭 */}
              <div className='flex items-center justify-between px-5 sm:px-6 py-3.5 border-b border-[#e8e8e8] dark:border-[#3a3a3a] shrink-0'>
                <h3 className='text-lg font-bold text-[#111111] dark:text-[#f5f5f5] truncate'>
                  详情预览
                </h3>
                <button
                  className='w-8 h-8 flex items-center justify-center rounded-lg text-[#8f8f8f] hover:text-[#111111] dark:hover:text-[#f5f5f5] hover:bg-[#e8e8e8] dark:hover:bg-[#2a2a2a] transition-colors'
                  onClick={() => setPreviewOpen(false)}
                  title='关闭'
                  aria-label='关闭'
                >
                  <svg
                    className='w-5 h-5'
                    fill='none'
                    stroke='currentColor'
                    viewBox='0 0 24 24'
                  >
                    <path
                      strokeLinecap='round'
                      strokeLinejoin='round'
                      strokeWidth={2}
                      d='M6 18L18 6M6 6l12 12'
                    />
                  </svg>
                </button>
              </div>

              {/* 内容区 */}
              <div className='p-5 sm:p-6 overflow-auto flex-1'>
                {previewLoading ? (
                  <div className='flex flex-col items-center justify-center py-12'>
                    <div className='w-10 h-10 border-[3px] border-[#00be06] border-t-transparent rounded-full animate-spin mb-3'></div>
                    <div className='text-sm text-[#5f5f5f] dark:text-[#a8a8a8]'>
                      加载详情...
                    </div>
                  </div>
                ) : previewError ? (
                  <div className='px-4 py-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-600 dark:text-red-400'>
                    {previewError}
                  </div>
                ) : !previewData ? (
                  <div className='text-center py-12'>
                    <div className='w-16 h-16 mx-auto mb-3 rounded-full bg-[#e8e8e8] dark:bg-[#2a2a2a] flex items-center justify-center'>
                      <Tv className='w-7 h-7 text-[#8f8f8f]' />
                    </div>
                    <div className='text-sm text-[#5f5f5f] dark:text-[#a8a8a8]'>
                      暂无详情
                    </div>
                  </div>
                ) : (
                  <div className='flex flex-col md:flex-row gap-5'>
                    {/* 左侧海报 */}
                    <div className='shrink-0 md:w-[200px]'>
                      {previewItem?.poster ? (
                        <div className='relative w-[132px] md:w-full aspect-[2/3] rounded-lg overflow-hidden bg-[#e8e8e8] dark:bg-[#2a2a2a]'>
                          <img
                            src={previewItem.poster}
                            alt={previewItem.title}
                            className='w-full h-full object-cover'
                          />
                        </div>
                      ) : (
                        <div className='w-[132px] md:w-full aspect-[2/3] bg-[#e8e8e8] dark:bg-[#2a2a2a] rounded-lg flex flex-col items-center justify-center text-[#8f8f8f]'>
                          <Tv className='w-10 h-10 opacity-50 mb-1.5' />
                          <span className='text-xs'>暂无封面</span>
                        </div>
                      )}
                    </div>

                    {/* 右侧信息 */}
                    <div className='flex-1 min-w-0'>
                      <div className='flex items-center gap-2.5 flex-wrap'>
                        <span className='text-lg font-bold text-[#111111] dark:text-[#f5f5f5]'>
                          {previewData.title || previewItem?.title}
                        </span>
                        {previewDouban?.rate && (
                          <span className='px-2 py-0.5 rounded bg-[#00be06] text-white text-xs font-bold'>
                            豆瓣 {previewDouban.rate}
                          </span>
                        )}
                        {!previewDouban?.rate &&
                          previewBangumi?.rating?.score && (
                            <span className='px-2 py-0.5 rounded bg-[#00be06] text-white text-xs font-bold'>
                              Bangumi {previewBangumi.rating.score}
                            </span>
                          )}
                      </div>

                      {/* 元信息行 */}
                      <div className='mt-2 text-sm text-[#5f5f5f] dark:text-[#a8a8a8] space-y-1'>
                        <div>
                          <span className='text-[#8f8f8f]'>年份 </span>
                          {previewData.year || previewItem?.year || '—'}
                        </div>
                        <div>
                          <span className='text-[#8f8f8f]'>来源 </span>
                          {activeSource?.name}
                        </div>
                      </div>

                      {/* 分类标签 */}
                      {(previewItem?.type_name || previewData?.class) && (
                        <div className='mt-2.5 flex flex-wrap gap-2'>
                          {previewItem?.type_name && (
                            <span className='px-2 py-0.5 rounded border border-[#d9d9d9] dark:border-[#3a3a3a] text-xs text-[#5f5f5f] dark:text-[#a8a8a8]'>
                              {previewItem.type_name}
                            </span>
                          )}
                          {previewData?.class && (
                            <span className='px-2 py-0.5 rounded border border-[#d9d9d9] dark:border-[#3a3a3a] text-xs text-[#5f5f5f] dark:text-[#a8a8a8]'>
                              {previewData.class}
                            </span>
                          )}
                        </div>
                      )}

                      {/* 简介 */}
                      {(() => {
                        const desc =
                          (previewData?.desc && previewData.desc.trim()) ||
                          (previewSearchPick?.desc &&
                            String(previewSearchPick.desc).trim()) ||
                          (previewItem?.remarks && previewItem.remarks.trim());
                        return desc ? (
                          <p className='mt-3.5 text-sm leading-6 text-[#5f5f5f] dark:text-[#a8a8a8] max-h-36 overflow-auto whitespace-pre-line'>
                            {desc}
                          </p>
                        ) : null;
                      })()}

                      {/* 豆瓣 / Bangumi 扩展信息 */}
                      <div className='mt-4 space-y-3'>
                        {previewDoubanLoading && !previewBangumiLoading && (
                          <div className='text-sm text-[#5f5f5f] dark:text-[#a8a8a8]'>
                            加载豆瓣信息...
                          </div>
                        )}
                        {previewDouban &&
                          (() => {
                            const d = previewDouban;
                            return (
                              <div className='text-sm space-y-1'>
                                {d.directors && d.directors.length > 0 && (
                                  <div className='flex'>
                                    <span className='w-11 shrink-0 text-[#8f8f8f]'>
                                      导演
                                    </span>
                                    <span className='flex-1 min-w-0 text-[#5f5f5f] dark:text-[#a8a8a8] line-clamp-1'>
                                      {d.directors.join(' / ')}
                                    </span>
                                  </div>
                                )}
                                {d.cast && d.cast.length > 0 && (
                                  <div className='flex'>
                                    <span className='w-11 shrink-0 text-[#8f8f8f]'>
                                      主演
                                    </span>
                                    <span className='flex-1 min-w-0 text-[#5f5f5f] dark:text-[#a8a8a8] line-clamp-2'>
                                      {d.cast.slice(0, 8).join(' / ')}
                                    </span>
                                  </div>
                                )}
                                {d.genres && d.genres.length > 0 && (
                                  <div className='flex flex-wrap gap-2 pt-0.5'>
                                    {d.genres.map((g: string) => (
                                      <span
                                        key={g}
                                        className='px-2 py-0.5 rounded border border-[#d9d9d9] dark:border-[#3a3a3a] text-xs text-[#5f5f5f] dark:text-[#a8a8a8]'
                                      >
                                        {g}
                                      </span>
                                    ))}
                                  </div>
                                )}
                                {d.plot_summary && (
                                  <p className='text-xs leading-6 text-[#5f5f5f] dark:text-[#a8a8a8] pt-1'>
                                    {d.plot_summary}
                                  </p>
                                )}
                              </div>
                            );
                          })()}

                        {previewBangumiLoading && (
                          <div className='text-sm text-[#5f5f5f] dark:text-[#a8a8a8]'>
                            加载 Bangumi 信息...
                          </div>
                        )}
                        {previewBangumi && (
                          <div className='text-sm space-y-1'>
                            {previewBangumi.date && (
                              <div className='flex'>
                                <span className='w-11 shrink-0 text-[#8f8f8f]'>
                                  首播
                                </span>
                                <span className='flex-1 min-w-0 text-[#5f5f5f] dark:text-[#a8a8a8]'>
                                  {previewBangumi.date}
                                </span>
                              </div>
                            )}
                            {Array.isArray(previewBangumi.tags) &&
                              previewBangumi.tags.length > 0 && (
                                <div className='flex flex-wrap gap-2 pt-0.5'>
                                  {previewBangumi.tags.slice(0, 10).map((t) => (
                                    <span
                                      key={t.name}
                                      className='px-2 py-0.5 rounded border border-[#d9d9d9] dark:border-[#3a3a3a] text-xs text-[#5f5f5f] dark:text-[#a8a8a8]'
                                    >
                                      {t.name}
                                    </span>
                                  ))}
                                </div>
                              )}
                            {previewBangumi.summary && (
                              <p className='text-xs leading-6 text-[#5f5f5f] dark:text-[#a8a8a8] pt-1'>
                                {previewBangumi.summary}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* 底部操作栏 */}
              <div className='px-5 sm:px-6 py-3.5 border-t border-[#e8e8e8] dark:border-[#3a3a3a] flex items-center justify-between gap-3 shrink-0'>
                <div className='text-xs sm:text-sm text-[#5f5f5f] dark:text-[#a8a8a8] truncate'>
                  {previewData?.class || previewItem?.type_name}
                </div>
                <div className='flex items-center gap-2.5 shrink-0'>
                  <button
                    onClick={() => setPreviewOpen(false)}
                    className='px-4 py-2 rounded-lg border border-[#d9d9d9] dark:border-[#3a3a3a] text-[#5f5f5f] dark:text-[#a8a8a8] hover:bg-[#e8e8e8] dark:hover:bg-[#2a2a2a] text-sm font-medium transition-colors'
                  >
                    取消
                  </button>
                  <button
                    onClick={() => {
                      if (previewItem) goPlay(previewItem);
                    }}
                    className='inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-[#00be06] hover:bg-[#00a304] text-white text-sm font-semibold transition-colors'
                  >
                    <svg
                      className='w-4 h-4'
                      fill='currentColor'
                      viewBox='0 0 20 20'
                    >
                      <path d='M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z' />
                    </svg>
                    立即播放
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </PageLayout>
  );
}
