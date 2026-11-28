'use client';

import { ChevronRight, Clock, Loader2, Play, Trash2, X } from 'lucide-react';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import Image from 'next/image';
import {
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  HOME_SECTION_ACTION_CLASS,
  SKELETON_CONFIG,
} from '@/lib/constants/home';
import {
  type ContinueWatchingDisplayItem,
  buildContinueWatchingDisplayState,
} from '@/lib/continue-watching-display';
import {
  fetchTMDBHeroInfoBatch,
  peekCachedTMDBHeroInfo,
} from '@/lib/tmdb-hero.client';
import type { PlayRecord } from '@/lib/types';
import { getImageFallbackUrls, processImageUrl } from '@/lib/utils';
import {
  navigateVideoCardPlayUrl,
  shouldUseUnoptimizedImage,
} from '@/lib/video-card-utils';
import type { WatchingUpdatesCache } from '@/lib/watching-updates';
import type { PlayRecordsLoadError } from '@/hooks/useContinueWatchingData';

import HomeSectionHeader from '@/components/HomeSectionHeader';
import ScrollableRow from '@/components/ScrollableRow';

/** 16:9 横版续播卡片统一响应式宽度（与下方 2:3 竖版推荐海报形成清晰层级区分） */
export const CONTINUE_WATCHING_CARD_WIDTH_CLASS =
  'flex-shrink-0 min-w-[15rem] w-[15rem] sm:min-w-[17.5rem] sm:w-[17.5rem] md:min-w-[19rem] md:w-[19rem] lg:min-w-[20.5rem] lg:w-[20.5rem]';

const CONTINUE_WATCHING_CARD_SIZES =
  '(max-width: 640px) 240px, (max-width: 768px) 280px, (max-width: 1024px) 304px, 328px';

type FilterMode = 'all' | 'new' | 'unfinished';

interface ContinueWatchingProps {
  className?: string;
  playRecords: Record<string, PlayRecord> | null;
  watchingUpdates?: WatchingUpdatesCache | null;
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  loadError: PlayRecordsLoadError;
  onDeleteRecord: (key: string) => void;
  onClearAll: () => void;
  onLoadMore: () => Promise<void>;
  onRetry: () => Promise<void>;
}

export function ContinueWatchingSkeletonRow({
  count = SKELETON_CONFIG.CONTINUE_WATCHING_COUNT,
}: {
  count?: number;
}) {
  return (
    <>
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className={CONTINUE_WATCHING_CARD_WIDTH_CLASS}>
          <div className='relative aspect-video w-full overflow-hidden rounded-xl border border-[#e8e8e8] bg-[#ececec] dark:border-[#2e2e2e] dark:bg-[#242424]'>
            <div
              className='absolute inset-0 -translate-x-full motion-safe:animate-shimmer bg-gradient-to-r from-transparent via-white/25 to-transparent'
              style={{
                animationDuration: '1.5s',
                animationIterationCount: 'infinite',
              }}
            />
          </div>
        </div>
      ))}
    </>
  );
}

const ContinueWatchingCard = memo(function ContinueWatchingCard({
  item,
  backdropUrl,
  priority,
  onDeleteRecord,
}: {
  item: ContinueWatchingDisplayItem;
  backdropUrl?: string;
  priority: boolean;
  onDeleteRecord: (key: string) => void;
}) {
  const { record } = item;
  const title = record.title || record.search_title || '未命名影片';
  const appRouter = useContext(AppRouterContext);

  const fallbackUrls = useMemo(
    () => getImageFallbackUrls(record.cover || ''),
    [record.cover],
  );
  const [posterFallbackIndex, setPosterFallbackIndex] = useState(0);
  const [backdropFailed, setBackdropFailed] = useState(false);

  useEffect(() => {
    setPosterFallbackIndex(0);
  }, [record.cover]);

  useEffect(() => {
    setBackdropFailed(false);
  }, [backdropUrl]);

  const posterSrc =
    fallbackUrls[posterFallbackIndex] ||
    processImageUrl(record.cover || '') ||
    '/logo.svg';
  const posterUnoptimized = shouldUseUnoptimizedImage(posterSrc);
  const effectiveBackdrop =
    backdropUrl && !backdropFailed ? backdropUrl : undefined;
  const backdropUnoptimized = effectiveBackdrop
    ? shouldUseUnoptimizedImage(effectiveBackdrop)
    : false;

  const handlePosterError = useCallback(() => {
    if (posterFallbackIndex < fallbackUrls.length - 1) {
      setPosterFallbackIndex((idx) => idx + 1);
    }
  }, [fallbackUrls.length, posterFallbackIndex]);

  const handleNavigate = useCallback(() => {
    if (!item.playHref) return;
    if (appRouter) {
      navigateVideoCardPlayUrl(item.playHref, appRouter);
    } else {
      navigateVideoCardPlayUrl(item.playHref);
    }
  }, [appRouter, item.playHref]);

  const handlePrimaryLinkClick = useCallback(
    (event: React.MouseEvent<HTMLAnchorElement>) => {
      event.stopPropagation();
      if (
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }
      event.preventDefault();
      handleNavigate();
    },
    [handleNavigate],
  );

  const handleDeleteClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      onDeleteRecord(record.key);
    },
    [onDeleteRecord, record.key],
  );

  const barWidthPercent = item.isFinished
    ? 100
    : item.progress > 0
      ? Math.max(4, item.progress)
      : 0;

  return (
    <div
      className={`${CONTINUE_WATCHING_CARD_WIDTH_CLASS} group/cw relative select-none`}
    >
      <div className='relative aspect-video w-full overflow-hidden rounded-xl border border-[#e5e5e5] bg-[#181818] shadow-sm transition-all duration-300 ease-out group-hover/cw:-translate-y-0.5 group-hover/cw:border-[#00be06]/60 group-hover/cw:shadow-[0_14px_34px_rgba(0,0,0,0.22)] dark:border-[#303030] dark:bg-[#161616] dark:group-hover/cw:border-[#1acd50]/60 dark:group-hover/cw:shadow-[0_14px_34px_rgba(0,0,0,0.48)]'>
        {/* 主导航覆盖层：支持左键路由跳转、中键/Cmd 新标签页打开与键盘聚焦 */}
        {item.playHref && (
          <a
            href={item.playHref}
            aria-label={`继续播放 ${title}`}
            onClick={handlePrimaryLinkClick}
            className='absolute inset-0 z-20 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00be06] focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[#141414]'
          />
        )}

        {/* 背景层 1：即时高斯模糊海报氛围底（零等待，无横图时与 HeroCarousel 保持统一视觉语言） */}
        <Image
          src={posterSrc}
          alt=''
          fill
          priority={priority}
          unoptimized={posterUnoptimized}
          referrerPolicy='no-referrer'
          sizes='180px'
          onError={handlePosterError}
          className='pointer-events-none scale-110 object-cover blur-xl brightness-[0.5] saturate-125'
          aria-hidden
        />

        {/* 背景层 2：TMDB 16:9 高清剧照就绪后平滑叠入 */}
        {effectiveBackdrop && (
          <Image
            src={effectiveBackdrop}
            alt=''
            fill
            priority={priority}
            unoptimized={backdropUnoptimized}
            referrerPolicy='no-referrer'
            sizes={CONTINUE_WATCHING_CARD_SIZES}
            onError={() => setBackdropFailed(true)}
            className='pointer-events-none object-cover brightness-[0.82] transition-transform duration-500 ease-out motion-safe:group-hover/cw:scale-105'
            aria-hidden
          />
        )}

        {/* 层次遮罩：顶部轻压暗保证角标可读，底部渐变承托片名与进度 */}
        <div
          className='pointer-events-none absolute inset-0 bg-gradient-to-t from-black/90 via-black/35 to-black/25'
          aria-hidden
        />

        {/* 顶部栏：左侧来源/集数胶囊 + 右侧新集提醒与快捷移除按钮 */}
        <div className='pointer-events-none absolute inset-x-2.5 top-2.5 z-30 flex items-center justify-between gap-2'>
          <div className='flex min-w-0 items-center gap-1.5'>
            {record.source_name && (
              <span className='truncate rounded-md bg-black/55 px-2 py-0.5 text-[11px] font-medium text-white/90 ring-1 ring-white/15 backdrop-blur-md'>
                {record.source_name}
              </span>
            )}
            {item.episodeBadgeText && (
              <span className='shrink-0 rounded-md bg-white/15 px-1.5 py-0.5 text-[11px] font-medium text-white/90 backdrop-blur-md'>
                {item.episodeBadgeText}
              </span>
            )}
          </div>

          <div className='flex shrink-0 items-center gap-1.5'>
            {item.newEpisodesCount > 0 && (
              <span className='pointer-events-none rounded-full bg-gradient-to-r from-[#ff4d4f] to-[#ff7a45] px-2 py-0.5 text-[11px] font-semibold text-white shadow-sm'>
                +{item.newEpisodesCount}集
              </span>
            )}

            <button
              type='button'
              aria-label={`删除 ${title} 的播放记录`}
              title='移除记录'
              onClick={handleDeleteClick}
              className='pointer-events-auto inline-flex h-6 w-6 items-center justify-center rounded-full bg-black/55 text-white/80 ring-1 ring-white/15 backdrop-blur-md transition-all duration-200 hover:bg-red-500/90 hover:text-white focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:opacity-0 sm:group-hover/cw:opacity-100 sm:group-focus-within/cw:opacity-100'
            >
              <X className='h-3.5 w-3.5' aria-hidden='true' />
            </button>
          </div>
        </div>

        {/* 中央悬浮续播按钮（桌面端 hover / 聚焦浮现） */}
        <div
          className='pointer-events-none absolute inset-0 z-10 flex items-center justify-center opacity-0 transition-opacity duration-200 group-hover/cw:opacity-100 group-focus-within/cw:opacity-100'
          aria-hidden
        >
          <span className='flex h-10 w-10 items-center justify-center rounded-full bg-[#00be06]/95 text-white shadow-lg ring-2 ring-white/30'>
            <Play className='ml-0.5 h-4 w-4 fill-current' />
          </span>
        </div>

        {/* 底部信息区：左侧片名与剩余时间，无 TMDB 横图时右侧展示精致小竖版海报 */}
        <div className='pointer-events-none absolute inset-x-3 bottom-3 z-10 flex items-end justify-between gap-2.5'>
          <div className='min-w-0 flex-1'>
            <h3
              title={title}
              className='truncate text-sm font-bold text-white transition-colors duration-200 group-hover/cw:text-[#57e07a] sm:text-[15px]'
            >
              {title}
            </h3>
            <p className='mt-0.5 truncate text-xs text-white/80'>
              {item.progressText}
            </p>
          </div>

          {!effectiveBackdrop && record.cover && (
            <div className='relative hidden aspect-[2/3] w-11 shrink-0 overflow-hidden rounded-md shadow-md ring-1 ring-white/25 sm:block'>
              <Image
                src={posterSrc}
                alt={title}
                fill
                unoptimized={posterUnoptimized}
                referrerPolicy='no-referrer'
                sizes='64px'
                onError={handlePosterError}
                className='object-cover'
              />
            </div>
          )}
        </div>

        {/* 底部内嵌高对比度播放进度条 */}
        {barWidthPercent > 0 && (
          <div
            className='pointer-events-none absolute inset-x-0 bottom-0 z-20 h-1 bg-white/25'
            aria-hidden
          >
            <div
              className={`h-full transition-all duration-300 ${
                item.isFinished ? 'bg-white/60' : 'bg-[#00be06]'
              }`}
              style={{ width: `${barWidthPercent}%` }}
            />
          </div>
        )}
      </div>
    </div>
  );
});

export default function ContinueWatching({
  className,
  playRecords,
  watchingUpdates,
  loading,
  loadingMore,
  hasMore,
  loadError,
  onDeleteRecord,
  onClearAll,
  onLoadMore,
  onRetry,
}: ContinueWatchingProps) {
  const [retryingFirstPage, setRetryingFirstPage] = useState(false);
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [isPointerInside, setIsPointerInside] = useState(false);
  const [backdropsByTitle, setBackdropsByTitle] = useState<
    Record<string, string>
  >({});
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const rawDisplayState = useMemo(
    () => buildContinueWatchingDisplayState(playRecords, watchingUpdates),
    [playRecords, watchingUpdates],
  );

  // 防光标下跳：当鼠标悬停在继续观看区域内时，若后台追更快照刚到达，保持当前已渲染卡片的相对顺序，
  // 仅原位更新集数与 +N集 角标，离开悬停后再应用新顺序。
  const frozenOrderKeysRef = useRef<string[] | null>(null);
  const displayItems = useMemo(() => {
    const incoming = rawDisplayState.displayItems;
    if (!isPointerInside) {
      frozenOrderKeysRef.current = incoming.map((item) => item.record.key);
      return incoming;
    }

    const frozenKeys = frozenOrderKeysRef.current;
    if (!frozenKeys || frozenKeys.length === 0) {
      frozenOrderKeysRef.current = incoming.map((item) => item.record.key);
      return incoming;
    }

    const byKey = new Map(incoming.map((item) => [item.record.key, item]));
    const ordered: ContinueWatchingDisplayItem[] = [];
    for (const key of frozenKeys) {
      const matched = byKey.get(key);
      if (matched) {
        ordered.push(matched);
        byKey.delete(key);
      }
    }
    byKey.forEach((item) => ordered.push(item));
    return ordered;
  }, [isPointerInside, rawDisplayState.displayItems]);

  const { records, newEpisodeItemCount, unfinishedItemCount } = rawDisplayState;
  const hasRecords = records.length > 0;

  // 若筛选命中的条目被全部删空，自动回退到「全部」，避免误现空行
  const effectiveFilter: FilterMode = useMemo(() => {
    if (filterMode === 'new' && newEpisodeItemCount === 0) return 'all';
    if (filterMode === 'unfinished' && unfinishedItemCount === 0) return 'all';
    return filterMode;
  }, [filterMode, newEpisodeItemCount, unfinishedItemCount]);

  const visibleItems = useMemo(() => {
    if (effectiveFilter === 'new') {
      return displayItems.filter((item) => item.newEpisodesCount > 0);
    }
    if (effectiveFilter === 'unfinished') {
      return displayItems.filter(
        (item) => item.isUnfinished || item.newEpisodesCount > 0,
      );
    }
    return displayItems;
  }, [displayItems, effectiveFilter]);

  // 清理二次确认自动超时
  useEffect(() => {
    if (!confirmingClear) return undefined;
    confirmTimerRef.current = setTimeout(() => {
      setConfirmingClear(false);
    }, 5000);
    return () => {
      if (confirmTimerRef.current) {
        clearTimeout(confirmTimerRef.current);
        confirmTimerRef.current = null;
      }
    };
  }, [confirmingClear]);

  // 批量获取首屏可见卡片的 TMDB 横图（与 HeroCarousel 共享内存缓存，同名零重复请求）
  const lookupSignature = useMemo(
    () =>
      displayItems
        .slice(0, 12)
        .map(
          (item) =>
            `${(item.record.title || item.record.search_title || '').trim()}|${(item.record.year || '').trim()}`,
        )
        .join('\0'),
    [displayItems],
  );

  useEffect(() => {
    if (loading || displayItems.length === 0) return undefined;

    const candidates = displayItems.slice(0, 12).map((item) => ({
      title: (item.record.title || item.record.search_title || '').trim(),
      year: item.record.year,
    }));

    // 先同步回填已在 HeroCarousel 缓存命中的横图
    const immediate: Record<string, string> = {};
    for (const candidate of candidates) {
      if (!candidate.title) continue;
      const cached = peekCachedTMDBHeroInfo(candidate.title, candidate.year);
      if (cached?.backdrop) {
        immediate[candidate.title] = cached.backdrop;
      }
    }
    if (Object.keys(immediate).length > 0) {
      setBackdropsByTitle((prev) => ({ ...prev, ...immediate }));
    }

    const controller = new AbortController();
    fetchTMDBHeroInfoBatch(candidates, controller.signal)
      .then((infoMap) => {
        if (controller.signal.aborted) return;
        const next: Record<string, string> = {};
        for (const [title, info] of Object.entries(infoMap)) {
          if (info.backdrop) {
            next[title] = info.backdrop;
          }
        }
        if (Object.keys(next).length > 0) {
          setBackdropsByTitle((prev) => ({ ...prev, ...next }));
        }
      })
      .catch(() => {
        // TMDB 未配置或失败时静默保持模糊海报氛围底
      });

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, lookupSignature]);

  const firstPageRetry = loadError === 'initial' || loadError === 'refresh';
  const hasRetryAction = firstPageRetry || loadError === 'append';
  const loadControlBusy = loadingMore || retryingFirstPage;

  const handleLoadControl = () => {
    if (!firstPageRetry) {
      void onLoadMore();
      return;
    }

    if (retryingFirstPage) return;

    setRetryingFirstPage(true);
    void onRetry().then(
      () => setRetryingFirstPage(false),
      () => setRetryingFirstPage(false),
    );
  };

  const handleConfirmClear = () => {
    setConfirmingClear(false);
    onClearAll();
  };

  // 真实空态不渲染；分页入口或首屏失败重试仍需保留。
  if (!loading && !hasRecords && !hasMore && !firstPageRetry) {
    return null;
  }

  const showFilterPills =
    !loading &&
    displayItems.length > 1 &&
    (newEpisodeItemCount > 0 ||
      (unfinishedItemCount > 0 && unfinishedItemCount < displayItems.length));

  return (
    <section
      className={`mb-8 ${className || ''}`}
      onMouseEnter={() => setIsPointerInside(true)}
      onMouseLeave={() => setIsPointerInside(false)}
    >
      <HomeSectionHeader
        title='继续观看'
        icon={Clock}
        action={
          !loading && hasRecords ? (
            confirmingClear ? (
              <div
                className='flex items-center gap-2'
                role='group'
                aria-label='确认清空播放记录'
              >
                <span className='hidden text-xs text-[#8f8f8f] sm:inline'>
                  清空全部记录？
                </span>
                <button
                  type='button'
                  onClick={handleConfirmClear}
                  className='inline-flex items-center gap-1 rounded-full bg-red-500 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-red-600'
                >
                  <Trash2 className='h-3 w-3' />
                  确认清空
                </button>
                <button
                  type='button'
                  onClick={() => setConfirmingClear(false)}
                  className='rounded-full bg-[#f2f2f2] px-2.5 py-1 text-xs text-[#5f5f5f] transition-colors hover:bg-[#e5e5e5] dark:bg-[#2a2a2a] dark:text-[#a8a8a8] dark:hover:bg-[#383838]'
                >
                  取消
                </button>
              </div>
            ) : (
              <button
                type='button'
                className={HOME_SECTION_ACTION_CLASS}
                onClick={() => setConfirmingClear(true)}
              >
                清空
              </button>
            )
          ) : null
        }
      />

      {showFilterPills && (
        <div
          className='mb-3 flex flex-wrap items-center gap-2'
          role='tablist'
          aria-label='继续观看筛选'
        >
          <button
            type='button'
            role='tab'
            aria-selected={effectiveFilter === 'all'}
            onClick={() => setFilterMode('all')}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              effectiveFilter === 'all'
                ? 'bg-[#00be06] text-white shadow-sm shadow-[#00be06]/25'
                : 'bg-[#f2f2f2] text-[#5f5f5f] hover:bg-[#e8e8e8] dark:bg-[#262626] dark:text-[#a8a8a8] dark:hover:bg-[#333333]'
            }`}
          >
            全部 {displayItems.length}
          </button>

          {newEpisodeItemCount > 0 && (
            <button
              type='button'
              role='tab'
              aria-selected={effectiveFilter === 'new'}
              onClick={() => setFilterMode('new')}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                effectiveFilter === 'new'
                  ? 'bg-gradient-to-r from-[#ff4d4f] to-[#ff7a45] text-white shadow-sm'
                  : 'bg-[#fff1f0] text-[#cf1322] hover:bg-[#ffccc7] dark:bg-[#3a1d1f] dark:text-[#ff7875] dark:hover:bg-[#4d2326]'
              }`}
            >
              <span className='h-1.5 w-1.5 rounded-full bg-current' />
              新剧集 {newEpisodeItemCount}
            </button>
          )}

          {unfinishedItemCount > 0 &&
            unfinishedItemCount < displayItems.length && (
              <button
                type='button'
                role='tab'
                aria-selected={effectiveFilter === 'unfinished'}
                onClick={() => setFilterMode('unfinished')}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  effectiveFilter === 'unfinished'
                    ? 'bg-[#00be06] text-white shadow-sm shadow-[#00be06]/25'
                    : 'bg-[#f2f2f2] text-[#5f5f5f] hover:bg-[#e8e8e8] dark:bg-[#262626] dark:text-[#a8a8a8] dark:hover:bg-[#333333]'
                }`}
              >
                未看完 {unfinishedItemCount}
              </button>
            )}
        </div>
      )}

      <ScrollableRow enableAnimation={!loading} compactBottomPadding>
        {loading ? (
          <ContinueWatchingSkeletonRow />
        ) : (
          visibleItems.map((item, index) => {
            const trimmedTitle = (
              item.record.title ||
              item.record.search_title ||
              ''
            ).trim();
            return (
              <ContinueWatchingCard
                key={item.record.key}
                item={item}
                backdropUrl={backdropsByTitle[trimmedTitle]}
                priority={index < 2}
                onDeleteRecord={onDeleteRecord}
              />
            );
          })
        )}

        {!loading &&
          effectiveFilter === 'all' &&
          (hasMore || firstPageRetry) && (
            <button
              type='button'
              onClick={handleLoadControl}
              disabled={loadControlBusy}
              className={`${CONTINUE_WATCHING_CARD_WIDTH_CLASS} aspect-video rounded-xl border border-dashed border-gray-300 bg-white/60 text-gray-600 transition-colors hover:border-gray-400 hover:bg-white disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900/50 dark:text-gray-300 dark:hover:border-gray-500 dark:hover:bg-gray-800/70 flex flex-col items-center justify-center gap-1.5`}
              aria-label={
                hasRetryAction ? '重试加载继续观看' : '加载更多继续观看'
              }
            >
              {loadControlBusy ? (
                <Loader2 className='h-5 w-5 animate-spin' />
              ) : (
                <ChevronRight className='h-5 w-5' />
              )}
              <span className='text-xs sm:text-sm font-medium'>
                {loadControlBusy
                  ? '加载中'
                  : loadError === 'initial'
                    ? '加载失败'
                    : loadError === 'refresh'
                      ? '刷新失败'
                      : loadError === 'append'
                        ? '重试'
                        : '更多'}
              </span>
              {firstPageRetry && !loadControlBusy && (
                <span className='text-xs text-gray-500 dark:text-gray-400'>
                  重试
                </span>
              )}
            </button>
          )}
      </ScrollableRow>
    </section>
  );
}
