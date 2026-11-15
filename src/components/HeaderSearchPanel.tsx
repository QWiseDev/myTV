'use client';

import { ChevronRight, Search, Trash2 } from 'lucide-react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { processImageUrl } from '@/lib/utils';

interface SourceCategory {
  type_id: string | number;
  type_name: string;
}

interface SourceItem {
  id: string;
  title: string;
  poster: string;
  year: string;
  type_name: string;
  remarks: string;
}

interface HeaderSearchPanelProps {
  open: boolean;
  onClose: () => void;
}

/** 榜单条目数量（爱奇艺热搜式两列各 3 条） */
const LIST_LIMIT = 6;

/** 序号角标配色：1-3 暖色，4+ 冷色（爱奇艺式） */
function rankBadgeClass(rank: number): string {
  if (rank === 1) return 'bg-gradient-to-br from-[#ff5f6d] to-[#ff2d55]';
  if (rank === 2) return 'bg-gradient-to-br from-[#ffb03a] to-[#ff7a1a]';
  if (rank === 3) return 'bg-gradient-to-br from-[#ffd93d] to-[#ffb01f]';
  return 'bg-gradient-to-br from-[#6aa5ff] to-[#4d7dff]';
}

/**
 * 顶部搜索框聚焦弹层（爱奇艺式）：
 * 上半区为搜索历史（可清空），下半区为片源库第一个片源的分类榜单
 * （分类 tab + 两列影片条目：序号角标 + 海报 + 标题/备注/元信息）。
 * 仅桌面端搜索框挂载。
 */
export default function HeaderSearchPanel({
  open,
  onClose,
}: HeaderSearchPanelProps) {
  const router = useRouter();
  const listAbortRef = useRef<AbortController | null>(null);
  const listCacheRef = useRef(new Map<string, SourceItem[]>());
  const activeSourceRef = useRef<string | null>(null);

  const [history, setHistory] = useState<string[]>([]);
  const [sourceName, setSourceName] = useState('');
  const [categories, setCategories] = useState<SourceCategory[]>([]);
  const [categoriesFailed, setCategoriesFailed] = useState(false);
  const [activeTypeId, setActiveTypeId] = useState<string | number | null>(
    null,
  );
  const [items, setItems] = useState<SourceItem[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState(false);

  // 点击面板外部 / Esc 关闭（表单容器带 data-search-panel-root）
  useEffect(() => {
    if (!open) return;
    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest?.('[data-search-panel-root]')) onClose();
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onClose]);

  // 打开时拉取搜索历史
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetch('/api/searchhistory')
      .then((res) => (res.ok ? res.json() : []))
      .then((list: string[]) => {
        if (!cancelled)
          setHistory(Array.isArray(list) ? list.slice(0, 12) : []);
      })
      .catch(() => {
        // 历史获取失败时静默保持为空
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  // 打开时定位片源库第一个片源并加载其分类
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setCategoriesFailed(false);
    (async () => {
      try {
        const res = await fetch('/api/source-browser/sites');
        if (!res.ok) throw new Error('sites');
        const data = await res.json();
        const first = data.sources?.[0];
        if (!first || cancelled) return;
        activeSourceRef.current = first.key;
        setSourceName(first.name || '');
        const cRes = await fetch(
          `/api/source-browser/categories?source=${encodeURIComponent(first.key)}`,
        );
        if (!cRes.ok) throw new Error('categories');
        const cData = await cRes.json();
        if (cancelled) return;
        const cats: SourceCategory[] = Array.isArray(cData.categories)
          ? cData.categories
          : [];
        setCategories(cats);
        setActiveTypeId(cats[0]?.type_id ?? null);
      } catch {
        if (!cancelled) {
          setCategories([]);
          setCategoriesFailed(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  // 切换分类加载影片列表（带缓存 + abort）
  useEffect(() => {
    if (!open || activeTypeId == null || !activeSourceRef.current) return;
    const cacheKey = `${activeSourceRef.current}:${activeTypeId}`;
    const cached = listCacheRef.current.get(cacheKey);
    if (cached) {
      setItems(cached);
      setListError(false);
      return;
    }
    listAbortRef.current?.abort();
    const controller = new AbortController();
    listAbortRef.current = controller;
    setListLoading(true);
    setListError(false);
    fetch(
      `/api/source-browser/list?source=${encodeURIComponent(
        activeSourceRef.current,
      )}&type_id=${encodeURIComponent(String(activeTypeId))}&page=1`,
      { signal: controller.signal },
    )
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('list'))))
      .then((data) => {
        const list: SourceItem[] = (data.items || []).slice(0, LIST_LIMIT);
        listCacheRef.current.set(cacheKey, list);
        setItems(list);
      })
      .catch((err: unknown) => {
        if ((err as Error)?.name !== 'AbortError') {
          setItems([]);
          setListError(true);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setListLoading(false);
      });
    return () => controller.abort();
  }, [open, activeTypeId]);

  // 卸载时中止未完成请求
  useEffect(() => {
    const controller = listAbortRef.current;
    return () => controller?.abort();
  }, []);

  const clearHistory = async () => {
    try {
      await fetch('/api/searchhistory', { method: 'DELETE' });
      setHistory([]);
    } catch {
      // 静默失败
    }
  };

  const goSearch = (keyword: string) => {
    onClose();
    router.push(`/search?q=${encodeURIComponent(keyword)}`);
  };

  const goPlay = (item: SourceItem) => {
    onClose();
    const params = new URLSearchParams();
    params.set('source', activeSourceRef.current || '');
    params.set('id', item.id);
    params.set('title', item.title);
    if (item.year) params.set('year', item.year);
    params.set('prefer', 'true');
    router.push(`/play?${params.toString()}`);
  };

  if (!open) return null;

  return (
    <div
      className='absolute left-1/2 top-full z-[600] mt-2 w-[640px] max-w-[calc(100vw-3rem)] -translate-x-1/2 rounded-2xl border border-[#e8e8e8] bg-[#ffffff] shadow-2xl shadow-black/10 dark:border-[#3a3a3a] dark:bg-[#181818] dark:shadow-black/50'
      role='dialog'
      aria-label='搜索面板'
    >
      <div className='max-h-[calc(100vh-7rem)] overflow-y-auto scrollbar-hide rounded-2xl'>
        {/* 搜索历史 */}
        <div className='px-5 pt-4 pb-3'>
          <div className='mb-2.5 flex items-center justify-between'>
            <span className='text-sm font-semibold text-[#111111] dark:text-[#f5f5f5]'>
              搜索历史
            </span>
            {history.length > 0 && (
              <button
                type='button'
                onClick={clearHistory}
                title='清空搜索历史'
                aria-label='清空搜索历史'
                className='flex h-7 w-7 items-center justify-center rounded-md text-[#9a9a9a] transition-colors hover:bg-[#f2f2f2] hover:text-[#00a304] dark:hover:bg-[#2a2a2a] dark:hover:text-[#1acd50]'
              >
                <Trash2 className='h-4 w-4' />
              </button>
            )}
          </div>

          {history.length > 0 ? (
            <div className='flex flex-wrap gap-2'>
              {history.map((word) => (
                <button
                  key={word}
                  type='button'
                  onClick={() => goSearch(word)}
                  className='max-w-[220px] truncate rounded-md bg-[#f2f2f2] px-3 py-1.5 text-sm text-[#5f5f5f] transition-colors hover:bg-[#e3f8e3] hover:text-[#008602] dark:bg-[#232323] dark:text-[#a8a8a8] dark:hover:bg-[#123a18] dark:hover:text-[#57e07a]'
                >
                  {word}
                </button>
              ))}
            </div>
          ) : (
            <p className='py-1 text-sm text-[#9a9a9a] dark:text-[#6f6f6f]'>
              暂无搜索历史
            </p>
          )}
        </div>

        <div className='mx-5 h-px bg-[#f0f0f0] dark:bg-[#2a2a2a]' />

        {/* 片源分类榜单 */}
        <div className='px-5 pb-4 pt-3'>
          {categories.length > 0 ? (
            <>
              <div className='mb-3 flex items-center gap-3'>
                <div className='flex min-w-0 flex-1 items-center gap-5 overflow-x-auto scrollbar-hide'>
                  {categories.map((cat) => {
                    const isActive = cat.type_id === activeTypeId;
                    return (
                      <button
                        key={String(cat.type_id)}
                        type='button'
                        onClick={() => setActiveTypeId(cat.type_id)}
                        className={`relative shrink-0 whitespace-nowrap pb-1.5 text-[15px] transition-colors ${
                          isActive
                            ? 'font-semibold text-[#111111] dark:text-white'
                            : 'text-[#7a7a7a] hover:text-[#111111] dark:text-[#9a9a9a] dark:hover:text-white'
                        }`}
                      >
                        {cat.type_name}
                        {isActive && (
                          <span className='absolute bottom-0 left-1/2 h-[3px] w-5 -translate-x-1/2 rounded-full bg-[#00be06]' />
                        )}
                      </button>
                    );
                  })}
                </div>
                <button
                  type='button'
                  onClick={() => {
                    onClose();
                    router.push('/source-browser');
                  }}
                  title={`进入片源库${sourceName ? `（${sourceName}）` : ''}`}
                  className='flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#e8e8e8] text-[#7a7a7a] transition-colors hover:border-[#00a304]/50 hover:text-[#00a304] dark:border-[#3a3a3a] dark:text-[#9a9a9a] dark:hover:border-[#1acd50]/50 dark:hover:text-[#1acd50]'
                >
                  <ChevronRight className='h-4 w-4' />
                </button>
              </div>

              {listLoading ? (
                <div className='grid grid-cols-2 gap-x-6 gap-y-3'>
                  {Array.from({ length: LIST_LIMIT }).map((_, i) => (
                    <div key={i} className='flex items-center gap-3'>
                      <div className='h-[84px] w-14 shrink-0 animate-pulse rounded-md bg-[#f0f0f0] dark:bg-[#232323]' />
                      <div className='flex-1 space-y-2'>
                        <div className='h-3.5 w-3/4 animate-pulse rounded bg-[#f0f0f0] dark:bg-[#232323]' />
                        <div className='h-3 w-1/2 animate-pulse rounded bg-[#f0f0f0] dark:bg-[#232323]' />
                      </div>
                    </div>
                  ))}
                </div>
              ) : listError ? (
                <p className='py-6 text-center text-sm text-[#9a9a9a] dark:text-[#6f6f6f]'>
                  榜单加载失败，请稍后重试
                </p>
              ) : (
                <div className='grid grid-cols-2 gap-x-6 gap-y-3'>
                  {items.map((item, index) => (
                    <button
                      key={item.id}
                      type='button'
                      onClick={() => goPlay(item)}
                      className='group flex items-center gap-3 rounded-lg p-1 text-left transition-colors hover:bg-[#f7f7f7] dark:hover:bg-[#232323]'
                    >
                      <div className='relative h-[84px] w-14 shrink-0 overflow-hidden rounded-md bg-[#f0f0f0] dark:bg-[#232323]'>
                        {/* 占位图标垫底：海报为空或加载失败时露出 */}
                        <div className='flex h-full w-full items-center justify-center text-[#c0c0c0] dark:text-[#4a4a4a]'>
                          <Search className='h-4 w-4' />
                        </div>
                        {item.poster && (
                          <Image
                            src={processImageUrl(item.poster)}
                            alt={item.title}
                            fill
                            sizes='56px'
                            className='object-cover'
                            onError={(e) => {
                              // 加载失败时隐藏图片，露出占位图标
                              (
                                e.currentTarget as HTMLImageElement
                              ).style.display = 'none';
                            }}
                          />
                        )}
                        <span
                          className={`absolute left-0 top-0 flex h-5 w-5 items-center justify-center rounded-br-md rounded-tl-md text-xs font-bold text-white ${rankBadgeClass(
                            index + 1,
                          )}`}
                        >
                          {index + 1}
                        </span>
                      </div>
                      <div className='min-w-0 flex-1'>
                        <div className='flex items-center gap-1.5'>
                          <span className='truncate text-sm font-medium text-[#111111] transition-colors group-hover:text-[#00a304] dark:text-[#f5f5f5] dark:group-hover:text-[#57e07a]'>
                            {item.title}
                          </span>
                          {item.remarks && (
                            <span className='shrink-0 rounded border border-[#00a304]/40 px-1 py-px text-[10px] leading-tight text-[#00a304] dark:border-[#1acd50]/50 dark:text-[#1acd50]'>
                              {item.remarks}
                            </span>
                          )}
                        </div>
                        <p className='mt-1 truncate text-xs text-[#9a9a9a] dark:text-[#8a8a8a]'>
                          {[item.type_name, item.year]
                            .filter(Boolean)
                            .join(' / ')}
                        </p>
                      </div>
                    </button>
                  ))}
                  {!listLoading && items.length === 0 && !listError && (
                    <p className='col-span-2 py-6 text-center text-sm text-[#9a9a9a] dark:text-[#6f6f6f]'>
                      该分类暂无内容
                    </p>
                  )}
                </div>
              )}
            </>
          ) : (
            <p className='py-6 text-center text-sm text-[#9a9a9a] dark:text-[#6f6f6f]'>
              {categoriesFailed
                ? '片源分类加载失败，请稍后重试'
                : '正在加载片源分类…'}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
