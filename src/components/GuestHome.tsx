'use client';

import { Film, Loader, LogIn, Search, Tv } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import { processImageUrl } from '@/lib/utils';

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

/**
 * 访客版首页：未登录用户可见，仅展示访客源（爱奇艺）的片源目录，
 * 点击直达 /play 播放。登录后由 src/app/page.tsx 切换回常规首页。
 */
export default function GuestHome() {
  const router = useRouter();
  const [source, setSource] = useState<Source | null>(null);
  const [sourceError, setSourceError] = useState<string | null>(null);

  const [categories, setCategories] = useState<Category[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | number>('');

  const [items, setItems] = useState<Item[]>([]);
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [loadingItems, setLoadingItems] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [itemsError, setItemsError] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [searchKeyword, setSearchKeyword] = useState('');

  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const lastFetchAtRef = useRef(0);

  // 源列表：访客模式下接口只返回访客源
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/source-browser/sites', {
          cache: 'no-store',
        });
        if (!res.ok) throw new Error('获取片源失败');
        const data = await res.json();
        const list: Source[] = data.sources || [];
        if (cancelled) return;
        if (list.length === 0) {
          setSourceError('访客片源暂不可用，请登录后使用完整功能');
          return;
        }
        setSource(list[0]);
      } catch (e) {
        if (!cancelled) {
          setSourceError(e instanceof Error ? e.message : '获取片源失败');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 分类
  useEffect(() => {
    if (!source) return;
    let cancelled = false;
    setCategories([]);
    setActiveCategory('');
    (async () => {
      try {
        const res = await fetch(
          `/api/source-browser/categories?source=${encodeURIComponent(source.key)}`,
        );
        if (!res.ok) throw new Error('获取分类失败');
        const data = await res.json();
        if (cancelled) return;
        const list: Category[] = data.categories || [];
        setCategories(list);
        setActiveCategory(list[0]?.type_id ?? '');
      } catch {
        if (!cancelled) setCategories([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [source]);

  const fetchPage = useCallback(
    async (p: number, append: boolean) => {
      if (!source) return;
      if (append) setLoadingMore(true);
      else setLoadingItems(true);
      setItemsError(null);
      try {
        let url: string;
        if (searchKeyword.trim()) {
          url = `/api/source-browser/search?source=${encodeURIComponent(
            source.key,
          )}&q=${encodeURIComponent(searchKeyword.trim())}&page=${p}`;
        } else {
          if (!activeCategory) {
            setItems([]);
            setPageCount(1);
            return;
          }
          url = `/api/source-browser/list?source=${encodeURIComponent(
            source.key,
          )}&type_id=${encodeURIComponent(String(activeCategory))}&page=${p}`;
        }
        const res = await fetch(url);
        if (!res.ok) throw new Error('获取列表失败');
        const data = (await res.json()) as {
          items?: Item[];
          meta?: { page?: number; pagecount?: number };
        };
        const list: Item[] = data.items || [];
        setItems((prev) => (append ? [...prev, ...list] : list));
        setPage(Number(data.meta?.page || p));
        setPageCount(Number(data.meta?.pagecount || 1));
      } catch (e) {
        setItemsError(e instanceof Error ? e.message : '获取列表失败');
        if (!append) setItems([]);
      } finally {
        setLoadingMore(false);
        setLoadingItems(false);
      }
    },
    [source, activeCategory, searchKeyword],
  );

  // 源 / 分类 / 关键词变化时拉第一页
  useEffect(() => {
    if (!source) return;
    fetchPage(1, false);
  }, [source, activeCategory, searchKeyword, fetchPage]);

  const hasMore = page < pageCount;

  // IntersectionObserver 自动翻页（节流 700ms）
  useEffect(() => {
    if (!loadMoreRef.current) return;
    const el = loadMoreRef.current;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (
          entry.isIntersecting &&
          !loadingItems &&
          !loadingMore &&
          hasMore &&
          Date.now() - lastFetchAtRef.current > 700
        ) {
          lastFetchAtRef.current = Date.now();
          fetchPage(page + 1, true);
        }
      },
      { root: null, rootMargin: '200px', threshold: 0 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadingItems, loadingMore, hasMore, page, fetchPage]);

  const goPlay = (item: Item) => {
    const params = new URLSearchParams();
    if (source) params.set('source', source.key);
    params.set('id', item.id);
    if (item.title) params.set('title', item.title);
    if (item.year) params.set('year', item.year);
    router.push(`/play?${params.toString()}`);
  };

  return (
    <PageLayout activePath='/'>
      <div className='mx-auto max-w-[1500px] px-4 pt-2 pb-10 md:px-8'>
        {sourceError ? (
          <div className='mt-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400'>
            {sourceError}
          </div>
        ) : !source ? (
          <div className='flex items-center justify-center py-24 text-[#8f8f8f]'>
            <Loader className='h-6 w-6 animate-spin text-[#00be06]' />
          </div>
        ) : (
          <>
            {/* 分类 chips：单行横向滚动 */}
            {categories.length > 0 && !searchKeyword.trim() && (
              <div className='mt-2 flex items-center justify-between gap-4'>
                <h2 className='shrink-0 text-base font-bold text-[#111111] dark:text-[#f5f5f5]'>
                  分类
                </h2>
                <div className='min-w-0 flex-1 overflow-x-auto scrollbar-hide'>
                  <div className='flex gap-2 px-1 pb-1'>
                    {categories.map((cat) => (
                      <button
                        key={String(cat.type_id)}
                        onClick={() => setActiveCategory(cat.type_id)}
                        className={`shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm transition-colors ${
                          activeCategory === cat.type_id
                            ? 'bg-[#00be06] font-medium text-white shadow-sm shadow-[#00be06]/30'
                            : 'bg-[#f2f2f2] text-[#5f5f5f] hover:bg-[#e8e8e8] dark:bg-[#2a2a2a] dark:text-[#a8a8a8] dark:hover:bg-[#3d3d3d]'
                        }`}
                      >
                        {cat.type_name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* 小节标题 + 搜索 */}
            <div className='mb-3 mt-5 flex items-center justify-between gap-4'>
              <div className='flex min-w-0 items-center gap-2'>
                <span className='h-4 w-1 shrink-0 rounded-full bg-[#00be06]' />
                <h2 className='truncate text-lg font-bold text-[#111111] dark:text-[#f5f5f5]'>
                  {searchKeyword.trim()
                    ? `「${searchKeyword.trim()}」的搜索结果`
                    : '精选内容'}
                </h2>
              </div>
              <form
                className='relative w-full max-w-64 shrink-0'
                onSubmit={(e) => {
                  e.preventDefault();
                  setSearchKeyword(query);
                }}
              >
                <input
                  type='text'
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder='搜索片名…'
                  className='h-9 w-full rounded-full border border-[#e5e5e5] bg-white py-2 pl-9 pr-4 text-sm text-[#111111] outline-none transition-colors placeholder:text-[#9a9a9a] focus:border-[#00be06] dark:border-[#3d3d3d] dark:bg-[#2a2a2a] dark:text-[#f5f5f5] dark:placeholder:text-[#6f6f6f]'
                />
                <Search className='pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8f8f8f]' />
              </form>
            </div>

            {/* 内容网格 */}
            {loadingItems ? (
              <div className='grid grid-cols-3 gap-x-3 gap-y-5 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8'>
                {Array.from({ length: 16 }).map((_, i) => (
                  <div key={i}>
                    <div className='aspect-[2/3] animate-pulse rounded-lg bg-[#e8e8e8] dark:bg-[#2a2a2a]' />
                    <div className='mt-2 h-3.5 animate-pulse rounded bg-[#e8e8e8] dark:bg-[#2a2a2a]' />
                  </div>
                ))}
              </div>
            ) : itemsError ? (
              <div className='rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400'>
                {itemsError}
              </div>
            ) : items.length === 0 ? (
              <div className='py-12 text-center'>
                <div className='mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-[#e8e8e8] dark:bg-[#2a2a2a]'>
                  <Tv className='h-7 w-7 text-[#8f8f8f]' />
                </div>
                <p className='text-sm text-[#5f5f5f] dark:text-[#a8a8a8]'>
                  {searchKeyword.trim() ? '没有找到相关影片' : '暂无内容'}
                </p>
              </div>
            ) : (
              <>
                <div className='grid grid-cols-3 gap-x-3 gap-y-5 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8'>
                  {items.map((item) => (
                    <div
                      key={item.id}
                      className='group cursor-pointer'
                      onClick={() => goPlay(item)}
                      role='button'
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') goPlay(item);
                      }}
                    >
                      <div className='relative aspect-[2/3] overflow-hidden rounded-lg bg-[#e8e8e8] shadow-sm transition-all duration-300 group-hover:scale-[1.03] group-hover:shadow-lg group-hover:shadow-black/15 dark:bg-[#2a2a2a]'>
                        {item.poster ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={processImageUrl(item.poster)}
                            alt={item.title}
                            className='h-full w-full object-cover'
                            loading='lazy'
                            referrerPolicy='no-referrer'
                          />
                        ) : (
                          <div className='flex h-full w-full flex-col items-center justify-center text-[#8f8f8f]'>
                            <Tv className='mb-1 h-8 w-8 opacity-50' />
                            <span className='text-xs'>无封面</span>
                          </div>
                        )}
                        {item.remarks && (
                          <span className='absolute left-1.5 top-1.5 max-w-[85%] truncate rounded bg-[#00be06] px-1.5 py-0.5 text-[10px] font-medium text-white'>
                            {item.remarks}
                          </span>
                        )}
                        {item.year && (
                          <span className='absolute right-1.5 top-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white backdrop-blur-sm'>
                            {item.year}
                          </span>
                        )}
                        {/* hover 播放遮罩 */}
                        <div className='absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-all duration-300 group-hover:bg-black/30 group-hover:opacity-100'>
                          <span className='flex h-11 w-11 items-center justify-center rounded-full bg-white/90 text-[#0b3a10]'>
                            <Film className='h-5 w-5' />
                          </span>
                        </div>
                      </div>
                      <p className='mt-1.5 line-clamp-1 text-sm font-medium text-[#111111] transition-colors group-hover:text-[#00a304] dark:text-[#f5f5f5] dark:group-hover:text-[#57e07a]'>
                        {item.title}
                      </p>
                      <p className='mt-0.5 truncate text-xs text-[#8f8f8f]'>
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
                    <div className='h-5 w-5 animate-spin rounded-full border-2 border-[#00be06] border-t-transparent'></div>
                  ) : hasMore ? (
                    <div className='text-xs text-[#8f8f8f]'>下拉加载更多</div>
                  ) : (
                    <div className='text-xs text-[#8f8f8f]'>没有更多了</div>
                  )}
                </div>
              </>
            )}

            {/* 底部登录引导条 */}
            <div className='mt-8 flex flex-col items-center justify-between gap-4 rounded-2xl border border-[#00be06]/20 bg-[#00be06]/[0.06] px-6 py-5 sm:flex-row dark:border-[#1acd50]/20 dark:bg-[#1acd50]/[0.06]'>
              <div className='text-center sm:text-left'>
                <p className='text-sm font-semibold text-[#111111] dark:text-[#f5f5f5]'>
                  想要播放记录、收藏夹和全部片源？
                </p>
                <p className='mt-0.5 text-xs text-[#8f8f8f]'>
                  登录后自动同步观看进度，解锁完整功能
                </p>
              </div>
              <a
                href='/login'
                className='inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[#00be06] px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#00a304] active:scale-95'
              >
                <LogIn className='h-4 w-4' />
                立即登录
              </a>
            </div>
          </>
        )}
      </div>
    </PageLayout>
  );
}
