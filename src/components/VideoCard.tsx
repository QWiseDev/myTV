/* eslint-disable @typescript-eslint/no-explicit-any,react-hooks/exhaustive-deps,@typescript-eslint/no-empty-function */

import { Heart, Link, PlayCircleIcon, Radio, Trash2 } from 'lucide-react';
import Image from 'next/image';
import React, {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';

import {
  deleteFavorite,
  deletePlayRecord,
  generateStorageKey,
  isFavorited,
  saveFavorite,
  subscribeToDataUpdates,
} from '@/lib/db.client';
import { getImageFallbackUrls, processImageUrl } from '@/lib/utils';
import {
  type FavoriteStatusLoadParams,
  type SearchFavoriteStatusParams,
  buildPlayUrl,
  buildVideoCardSubjectUrl,
  canToggleVideoCardFavorite,
  cardContainerStyle,
  getVideoCardConfig,
  getVideoCardEntryPoster,
  getVideoCardSearchType,
  navigateVideoCardPlayUrl,
  noPointerStyle,
  noSelectStyle,
  preventContextMenu,
  preventDragStart,
  shouldCheckSearchFavoriteStatus,
  shouldLoadVideoCardFavoriteStatus,
  shouldUseUnoptimizedImage,
} from '@/lib/video-card-utils';
import { useLongPress } from '@/hooks/useLongPress';
import { useMobileActions } from '@/hooks/useMobileActions';

import AggregateSourceIndicator from '@/components/AggregateSourceIndicator';
import { ImagePlaceholder } from '@/components/ImagePlaceholder';
import MobileActionSheet from '@/components/MobileActionSheet';
import {
  CompletedBadge,
  EpisodeBadge,
  RatingBadge,
  YearBadge,
} from '@/components/VideoCardBadges';

export interface VideoCardProps {
  id?: string;
  source?: string;
  title?: string;
  query?: string;
  poster?: string;
  episodes?: number;
  source_name?: string;
  source_names?: string[];
  progress?: number;
  year?: string;
  from: 'playrecord' | 'favorite' | 'search' | 'douban';
  currentEpisode?: number;
  douban_id?: number;
  onDelete?: () => void | Promise<void>;
  rate?: string;
  type?: string;
  isBangumi?: boolean;
  isAggregate?: boolean;
  origin?: 'vod' | 'live';
  remarks?: string; // 备注信息（如"已完结"、"更新至20集"等）
  priority?: boolean; // 是否优先加载（用于LCP优化）
  sizes?: string;
}

export type VideoCardHandle = {
  setEpisodes: (episodes?: number) => void;
  setSourceNames: (names?: string[]) => void;
  setDoubanId: (id?: number) => void;
};

function useSyncedState<T>(
  value: T,
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [state, setState] = useState(value);

  useEffect(() => {
    setState(value);
  }, [value]);

  return [state, setState];
}

let imageProxyVersion = 0;
const imageProxyListeners = new Set<() => void>();
let detachImageProxyListeners: (() => void) | null = null;

function notifyImageProxyChange() {
  imageProxyVersion += 1;
  imageProxyListeners.forEach((listener) => listener());
}

function subscribeImageProxyVersion(listener: () => void) {
  imageProxyListeners.add(listener);

  if (!detachImageProxyListeners) {
    const handleStorageChange = (event: StorageEvent) => {
      if (
        event.key === 'doubanImageProxyType' ||
        event.key === 'doubanImageProxyUrl'
      ) {
        notifyImageProxyChange();
      }
    };

    window.addEventListener('doubanImageProxyChanged', notifyImageProxyChange);
    window.addEventListener('storage', handleStorageChange);
    detachImageProxyListeners = () => {
      window.removeEventListener(
        'doubanImageProxyChanged',
        notifyImageProxyChange,
      );
      window.removeEventListener('storage', handleStorageChange);
    };
  }

  return () => {
    imageProxyListeners.delete(listener);
    if (imageProxyListeners.size === 0 && detachImageProxyListeners) {
      detachImageProxyListeners();
      detachImageProxyListeners = null;
    }
  };
}

function useImageProxyVersion() {
  return useSyncExternalStore(
    subscribeImageProxyVersion,
    () => imageProxyVersion,
    () => 0,
  );
}

function scheduleFavoriteStatusFetch(fetchFavoriteStatus: () => void) {
  let delayTimer: ReturnType<typeof setTimeout> | null = null;
  let idleCallbackId: number | null = null;

  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    idleCallbackId = (
      window as Window & {
        requestIdleCallback: (
          callback: IdleRequestCallback,
          options?: IdleRequestOptions,
        ) => number;
      }
    ).requestIdleCallback(
      () => {
        delayTimer = setTimeout(fetchFavoriteStatus, 300);
      },
      { timeout: 1200 },
    );
  } else {
    delayTimer = setTimeout(fetchFavoriteStatus, 400);
  }

  return () => {
    if (delayTimer) {
      clearTimeout(delayTimer);
    }

    if (
      typeof window !== 'undefined' &&
      idleCallbackId !== null &&
      'cancelIdleCallback' in window
    ) {
      (
        window as Window & {
          cancelIdleCallback: (handle: number) => void;
        }
      ).cancelIdleCallback(idleCallbackId);
    }
  };
}

function useVideoCardFavoriteStatus({
  from,
  source,
  id,
}: FavoriteStatusLoadParams): [
  boolean,
  React.Dispatch<React.SetStateAction<boolean>>,
] {
  const [favorited, setFavorited] = useState(false);
  const favoriteRevisionRef = useRef(0);
  const updateFavorited = useCallback<
    React.Dispatch<React.SetStateAction<boolean>>
  >((nextFavorited) => {
    favoriteRevisionRef.current += 1;
    setFavorited(nextFavorited);
  }, []);

  useEffect(() => {
    const favoriteStatusParams = {
      from,
      source,
      id,
    };

    if (!shouldLoadVideoCardFavoriteStatus(favoriteStatusParams)) {
      return;
    }
    const { source: favoriteSource, id: favoriteId } = favoriteStatusParams;

    let cancelled = false;
    const requestRevision = ++favoriteRevisionRef.current;

    const fetchFavoriteStatus = async () => {
      try {
        const fav = await isFavorited(favoriteSource, favoriteId);
        if (!cancelled && favoriteRevisionRef.current === requestRevision) {
          setFavorited(fav);
        }
      } catch (err) {
        if (!cancelled) {
          console.error('检查收藏状态失败:', err);
        }
      }
    };

    const cancelFavoriteStatusFetch = scheduleFavoriteStatusFetch(() => {
      void fetchFavoriteStatus();
    });

    const storageKey = generateStorageKey(favoriteSource, favoriteId);
    const unsubscribe = subscribeToDataUpdates(
      'favoritesUpdated',
      (newFavorites: Record<string, any>) => {
        const isNowFavorited = !!newFavorites[storageKey];
        updateFavorited(isNowFavorited);
      },
    );

    return () => {
      cancelled = true;
      favoriteRevisionRef.current += 1;
      cancelFavoriteStatusFetch();
      unsubscribe();
    };
  }, [from, id, source, updateFavorited]);

  return [favorited, updateFavorited];
}

function useVideoCardSearchFavoriteStatus({
  from,
  isAggregate,
  source,
  id,
}: Omit<SearchFavoriteStatusParams, 'searchFavorited'>) {
  const [searchFavorited, setSearchFavorited] = useState<boolean | null>(null);

  const checkSearchFavoriteStatus = useCallback(async () => {
    const searchFavoriteStatusParams = {
      from,
      isAggregate,
      source,
      id,
      searchFavorited,
    };

    if (!shouldCheckSearchFavoriteStatus(searchFavoriteStatusParams)) {
      return;
    }

    if (!source || !id) {
      return;
    }

    try {
      const fav = await isFavorited(source, id);
      setSearchFavorited(fav);
    } catch (err) {
      setSearchFavorited(false);
    }
  }, [from, isAggregate, source, id, searchFavorited]);

  return {
    searchFavorited,
    setSearchFavorited,
    checkSearchFavoriteStatus,
  };
}

function useVideoCardImageState(poster: string) {
  const [isLoading, setIsLoading] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageFallbackIndex, setImageFallbackIndex] = useState(0);
  const imageProxyVersion = useImageProxyVersion();
  const imageFallbackUrls = useMemo(
    () => getImageFallbackUrls(poster),
    [poster, imageProxyVersion],
  );
  const imageSrc =
    imageFallbackUrls[imageFallbackIndex] || processImageUrl(poster);
  // 影视聚合站封面来自大量第三方域名，服务端图片优化容易触发限流、
  // 超时或请求放大；外部 http(s) 图改由浏览器直连并保留 fallback。
  const useUnoptimizedImage = shouldUseUnoptimizedImage(imageSrc);

  useEffect(() => {
    setImageFallbackIndex(0);
    setImageLoaded(false);
    setIsLoading(false);
  }, [poster, imageProxyVersion]);

  const handleImageLoad = useCallback(() => {
    setIsLoading(true);
    setImageLoaded(true);
  }, []);

  const handleImageError = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      e.currentTarget.dataset.failedSrc = imageSrc;
      if (imageFallbackIndex < imageFallbackUrls.length - 1) {
        setImageLoaded(false);
        setImageFallbackIndex((index) => index + 1);
        return;
      }

      setIsLoading(true);
      setImageLoaded(true);
    },
    [imageFallbackIndex, imageFallbackUrls.length, imageSrc],
  );

  return {
    isLoading,
    imageLoaded,
    imageSrc,
    useUnoptimizedImage,
    handleImageLoad,
    handleImageError,
  };
}

const VideoCard = forwardRef<VideoCardHandle, VideoCardProps>(
  function VideoCard(
    {
      id,
      title = '',
      query = '',
      poster = '',
      episodes,
      source,
      source_name,
      source_names,
      progress = 0,
      year,
      from,
      currentEpisode,
      douban_id,
      onDelete,
      rate,
      type = '',
      isBangumi = false,
      isAggregate = false,
      origin = 'vod',
      remarks,
      priority = false,
      sizes,
    }: VideoCardProps,
    ref,
  ) {
    const [showMobileActions, setShowMobileActions] = useState(false);
    const hasOpenedMobileActionsRef = useRef(false);

    // 可外部修改的可控字段
    const [dynamicEpisodes, setDynamicEpisodes] = useSyncedState(episodes);
    const [dynamicSourceNames, setDynamicSourceNames] =
      useSyncedState(source_names);
    const [dynamicDoubanId, setDynamicDoubanId] = useSyncedState(douban_id);

    useImperativeHandle(ref, () => ({
      setEpisodes: (eps?: number) => setDynamicEpisodes(eps),
      setSourceNames: (names?: string[]) => setDynamicSourceNames(names),
      setDoubanId: (id?: number) => setDynamicDoubanId(id),
    }));

    const actualTitle = title;
    const actualPoster = poster;
    const actualSource = source;
    const actualId = id;
    const actualDoubanId = dynamicDoubanId;
    const actualEpisodes = dynamicEpisodes;
    const actualYear = year;
    const actualQuery = query || '';
    const subjectUrl = buildVideoCardSubjectUrl(actualDoubanId, isBangumi);
    const actualSearchType = getVideoCardSearchType({
      isAggregate,
      episodes: actualEpisodes,
      type,
    });
    const entryPoster = getVideoCardEntryPoster(from, actualPoster);
    const {
      isLoading,
      imageLoaded,
      imageSrc,
      useUnoptimizedImage,
      handleImageLoad,
      handleImageError,
    } = useVideoCardImageState(actualPoster);

    const [favorited, setFavorited] = useVideoCardFavoriteStatus({
      from,
      source: actualSource,
      id: actualId,
    });
    const {
      searchFavorited,
      setSearchFavorited,
      checkSearchFavoriteStatus,
    } = useVideoCardSearchFavoriteStatus({
      from,
      isAggregate,
      source: actualSource,
      id: actualId,
    });

    const setCurrentFavoriteState = useCallback(
      (nextFavorited: boolean) => {
        if (from === 'search') {
          setSearchFavorited(nextFavorited);
        } else {
          setFavorited(nextFavorited);
        }
      },
      [from],
    );

    const handleToggleFavorite = useCallback(
      async (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const favoriteToggleParams = {
          from,
          source: actualSource,
          id: actualId,
        };

        if (!canToggleVideoCardFavorite(favoriteToggleParams)) {
          return;
        }
        const { source: favoriteSource, id: favoriteId } = favoriteToggleParams;

        try {
          // 确定当前收藏状态
          const currentFavorited =
            from === 'search' ? searchFavorited : favorited;

          if (currentFavorited) {
            // 如果已收藏，删除收藏
            await deleteFavorite(favoriteSource, favoriteId);
            setCurrentFavoriteState(false);
          } else {
            // 如果未收藏，添加收藏
            await saveFavorite(favoriteSource, favoriteId, {
              title: actualTitle,
              source_name: source_name || '',
              year: actualYear || '',
              cover: actualPoster,
              total_episodes: actualEpisodes ?? 1,
              save_time: Date.now(),
            });
            setCurrentFavoriteState(true);
          }
        } catch (err) {
          throw new Error('切换收藏状态失败');
        }
      },
      [
        from,
        actualSource,
        actualId,
        actualTitle,
        source_name,
        actualYear,
        actualPoster,
        actualEpisodes,
        favorited,
        searchFavorited,
        setCurrentFavoriteState,
      ],
    );

    const handleDeleteRecord = useCallback(
      async (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (from !== 'playrecord' || !actualSource || !actualId) return;
        try {
          if (onDelete) {
            await onDelete();
            return;
          }

          await deletePlayRecord(actualSource, actualId);
        } catch (err) {
          throw new Error('删除播放记录失败');
        }
      },
      [from, actualSource, actualId, onDelete],
    );

    const playUrl = useMemo(
      () =>
        buildPlayUrl({
          origin,
          from,
          source: actualSource,
          id: actualId,
          title: actualTitle,
          year: actualYear,
          doubanId: actualDoubanId,
          searchType: actualSearchType,
          isAggregate,
          query: actualQuery,
          poster: entryPoster,
        }),
      [
        origin,
        from,
        isAggregate,
        actualSource,
        actualId,
        actualTitle,
        actualYear,
        actualSearchType,
        actualQuery,
        actualDoubanId,
        entryPoster,
      ],
    );

    const handleClick = useCallback(() => {
      navigateVideoCardPlayUrl(playUrl);
    }, [playUrl]);

    // 新标签页播放处理函数
    const handlePlayInNewTab = useCallback(() => {
      if (playUrl) window.open(playUrl, '_blank');
    }, [playUrl]);

    const openMobileActions = useCallback(() => {
      hasOpenedMobileActionsRef.current = true;
      setShowMobileActions(true);

      // 异步检查收藏状态，不阻塞菜单显示
      void checkSearchFavoriteStatus();
    }, [checkSearchFavoriteStatus]);

    // 长按操作
    const handleLongPress = useCallback(() => {
      if (!showMobileActions) {
        // 防止重复触发
        // 立即显示菜单，避免等待数据加载导致动画卡顿
        openMobileActions();
      }
    }, [showMobileActions, openMobileActions]);

    const handleContextMenu = useCallback(
      (e: React.MouseEvent) => {
        // 阻止默认右键菜单
        e.preventDefault();
        e.stopPropagation();

        // 右键弹出操作菜单
        openMobileActions();

        return false;
      },
      [openMobileActions],
    );

    const closeMobileActions = useCallback(() => {
      setShowMobileActions(false);
    }, []);

    // 长按手势hook
    const longPressProps = useLongPress({
      onLongPress: handleLongPress,
      onClick: handleClick, // 保持点击播放功能
      longPressDelay: 500,
    });

    const config = useMemo(() => getVideoCardConfig(from, rate), [from, rate]);
    const isLiveCard = origin === 'live';
    const actionSheetPoster = useMemo(
      () => processImageUrl(actualPoster),
      [actualPoster],
    );
    const actionSheetSources = useMemo(
      () =>
        isAggregate && dynamicSourceNames
          ? Array.from(new Set(dynamicSourceNames))
          : undefined,
      [isAggregate, dynamicSourceNames],
    );

    // 移动端操作菜单配置
    const mobileActions = useMobileActions({
      config,
      from,
      origin,
      source: actualSource,
      id: actualId,
      doubanId: actualDoubanId,
      isBangumi,
      favorited,
      searchFavorited,
      onPlay: handleClick,
      onPlayNewTab: handlePlayInNewTab,
      onToggleFavorite: handleToggleFavorite,
      onDeleteRecord: handleDeleteRecord,
    });

    return (
      <>
        <div
          className='group relative w-full rounded-md bg-transparent cursor-pointer transition-all duration-300 ease-in-out hover:-translate-y-1 hover:z-[500]'
          onClick={handleClick}
          {...longPressProps}
          style={cardContainerStyle}
          onContextMenu={handleContextMenu}
          onDragStart={preventDragStart}
        >
          {/* 海报容器 */}
          <div
            className={`relative aspect-[2/3] overflow-hidden rounded-lg ${
              isLiveCard
                ? 'ring-1 ring-[#d8d3c7] dark:ring-[#4a463f]'
                : ''
            } border border-[#e8e6dc] bg-[#f0eee6] shadow-sm transition-all duration-300 group-hover:border-[#d8c0b4] group-hover:shadow-[0_18px_45px_rgba(48,48,46,0.16)] dark:border-[#3d3934] dark:bg-[#302d29] dark:group-hover:border-[#6a5044] dark:group-hover:shadow-[0_18px_45px_rgba(0,0,0,0.34)]`}
            style={noSelectStyle}
            onContextMenu={preventContextMenu}
          >
            {/* 渐变光泽动画层 */}
            <div
              className='absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none z-10'
              style={{
                background:
                  'linear-gradient(110deg, transparent 30%, rgba(250,249,245,0.12) 45%, rgba(250,249,245,0.34) 50%, rgba(250,249,245,0.12) 55%, transparent 70%)',
                backgroundSize: '200% 100%',
                animation: 'card-shimmer 2.5s ease-in-out infinite',
              }}
            />

            {/* 骨架屏 */}
            {!isLoading && <ImagePlaceholder aspectRatio='aspect-[2/3]' />}
            {/* 图片 */}
            <Image
              src={imageSrc}
              alt={actualTitle}
              fill
              className={`${
                isLiveCard ? 'object-contain' : 'object-cover'
              } transition-all duration-700 ease-out ${
                imageLoaded
                  ? 'opacity-100 blur-0 scale-100'
                  : 'opacity-0 blur-md scale-105'
              }`}
              referrerPolicy='no-referrer'
              loading={priority ? undefined : 'lazy'}
              priority={priority}
              unoptimized={useUnoptimizedImage}
              sizes={sizes || '(max-width: 640px) 120px, (max-width: 768px) 176px, (max-width: 1024px) 200px, 220px'}
              onLoad={handleImageLoad}
              onError={handleImageError}
              style={noPointerStyle}
              onContextMenu={preventContextMenu}
              onDragStart={preventDragStart}
            />

            {/* 悬浮遮罩 - 玻璃态效果 */}
            <div
              className='absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent transition-all duration-300 ease-in-out opacity-0 group-hover:opacity-100 backdrop-blur-[2px]'
              style={noSelectStyle}
              onContextMenu={preventContextMenu}
            />

            {/* 播放按钮 */}
            {config.showPlayButton && (
              <div
                data-button='true'
                className='absolute inset-0 flex items-center justify-center opacity-0 transition-all duration-300 ease-in-out delay-75 group-hover:opacity-100 group-hover:scale-100'
                style={noSelectStyle}
                onContextMenu={preventContextMenu}
              >
                <PlayCircleIcon
                  size={50}
                  strokeWidth={0.8}
                  className='text-white fill-transparent transition-all duration-300 ease-out hover:fill-[#d97757] hover:scale-[1.1]'
                  style={noSelectStyle}
                  onContextMenu={preventContextMenu}
                />
              </div>
            )}

            {/* 操作按钮 */}
            {(config.showHeart || config.showCheckCircle) && (
              <div
                data-button='true'
                className='absolute bottom-3 right-3 flex gap-3 opacity-0 translate-y-2 transition-all duration-300 ease-in-out sm:group-hover:opacity-100 sm:group-hover:translate-y-0'
                style={noSelectStyle}
                onContextMenu={preventContextMenu}
              >
                {config.showCheckCircle && (
                  <Trash2
                    onClick={handleDeleteRecord}
                    size={20}
                    className='text-white transition-all duration-300 ease-out hover:stroke-[#d97757] hover:scale-[1.1]'
                    style={noSelectStyle}
                    onContextMenu={preventContextMenu}
                  />
                )}
                {config.showHeart && from !== 'search' && (
                  <Heart
                    onClick={handleToggleFavorite}
                    size={20}
                    className={`transition-all duration-300 ease-out ${
                      favorited
                        ? 'fill-red-600 stroke-red-600'
                        : 'fill-transparent stroke-white hover:stroke-red-400'
                    } hover:scale-[1.1]`}
                    style={noSelectStyle}
                    onContextMenu={preventContextMenu}
                  />
                )}
              </div>
            )}

            {/* 徽章组件 */}
            <EpisodeBadge
              episodes={actualEpisodes || 0}
              currentEpisode={currentEpisode}
            />

            {config.showYear && (
              <YearBadge
                year={actualYear || ''}
                hasEpisodeBadge={!!(actualEpisodes && actualEpisodes > 1)}
              />
            )}

            <CompletedBadge remarks={remarks} />

            {config.showRating && rate && <RatingBadge rate={rate} />}

            {/* 豆瓣链接 */}
            {config.showDoubanLink && subjectUrl && (
              <a
                href={subjectUrl}
                target='_blank'
                rel='noopener noreferrer'
                onClick={(e) => e.stopPropagation()}
                className='absolute top-2 left-2 opacity-0 -translate-x-2 transition-all duration-300 ease-in-out delay-100 sm:group-hover:opacity-100 sm:group-hover:translate-x-0'
                style={noSelectStyle}
                onContextMenu={preventContextMenu}
              >
                <div
                  className='bg-[#d97757] text-white text-xs font-bold w-7 h-7 rounded-full flex items-center justify-center shadow-md hover:bg-[#b85c38] hover:scale-[1.1] transition-all duration-300 ease-out'
                  style={noSelectStyle}
                  onContextMenu={preventContextMenu}
                >
                  <Link size={16} style={noPointerStyle} />
                </div>
              </a>
            )}

            {/* 聚合播放源指示器 */}
            {isAggregate &&
              dynamicSourceNames &&
              dynamicSourceNames.length > 0 && (
                <AggregateSourceIndicator sourceNames={dynamicSourceNames} />
              )}
          </div>

          {/* 进度条 */}
          {config.showProgress && progress !== undefined && (
            <div
              className='mt-1 h-1 w-full bg-[#e8e6dc] rounded-full overflow-hidden dark:bg-[#3d3934]'
              style={noSelectStyle}
              onContextMenu={preventContextMenu}
            >
              <div
                className='h-full bg-[#d97757] transition-all duration-500 ease-out dark:bg-[#e09a7a]'
                style={{ ...noSelectStyle, width: `${progress}%` }}
                onContextMenu={preventContextMenu}
              />
            </div>
          )}

          {/* 标题与来源 */}
          <div
            className='mt-2 text-center'
            style={noSelectStyle}
            onContextMenu={preventContextMenu}
          >
            <div className='relative px-1' style={noSelectStyle}>
              {/* 背景高亮效果 */}
              <div className='absolute inset-0 bg-gradient-to-r from-transparent via-[#ead8cf]/0 to-transparent group-hover:via-[#ead8cf]/45 dark:via-[#4a332a]/0 dark:group-hover:via-[#4a332a]/45 transition-all duration-300 rounded-md'></div>

              <span
                className='block text-sm font-semibold line-clamp-2 text-[#141413] dark:text-[#f8f6f0] transition-all duration-300 ease-in-out group-hover:text-[#b85c38] dark:group-hover:text-[#f0b195] peer relative z-10'
                style={{
                  ...noSelectStyle,
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                  lineHeight: '1.4',
                }}
                onContextMenu={preventContextMenu}
              >
                {actualTitle}
              </span>
              {/* 增强的 tooltip */}
              <div
                className='absolute bottom-full left-0 mb-2 px-3 py-2 bg-gradient-to-br from-gray-800 to-gray-900 text-white text-xs rounded-lg shadow-xl border border-white/10 opacity-0 invisible peer-hover:opacity-100 peer-hover:visible transition-all duration-200 ease-out delay-100 pointer-events-none z-50 backdrop-blur-sm'
                style={{
                  ...noSelectStyle,
                  minWidth: '200px',
                  maxWidth: 'min(90vw, 400px)',
                  whiteSpace: 'normal',
                  wordBreak: 'break-word',
                  left: '50%',
                  transform: 'translateX(-50%)',
                }}
                onContextMenu={preventContextMenu}
              >
                <span className='font-medium leading-relaxed block text-center'>
                  {actualTitle}
                </span>
                <div
                  className='absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-[6px] border-r-[6px] border-t-[6px] border-transparent border-t-gray-800'
                  style={noSelectStyle}
                />
              </div>
            </div>
            {config.showSourceName && source_name && (
              <div
                className='flex items-center justify-center mt-2'
                style={noSelectStyle}
                onContextMenu={preventContextMenu}
              >
                <span
                  className='relative inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-full border border-[#d8d3c7] dark:border-[#4a463f] text-[#5e5d59] dark:text-[#b7b1a8] transition-all duration-300 ease-out overflow-hidden group-hover:border-[#d97757]/80 group-hover:text-[#b85c38] dark:group-hover:text-[#f0b195] group-hover:shadow-sm group-hover:scale-105'
                  style={noSelectStyle}
                  onContextMenu={preventContextMenu}
                >
                  {/* 背景渐变效果 */}
                  <span className='absolute inset-0 bg-gradient-to-r from-transparent via-[#ead8cf]/0 to-transparent group-hover:via-[#ead8cf]/60 dark:via-[#4a332a]/0 dark:group-hover:via-[#4a332a]/50 transition-all duration-300'></span>

                  {/* 左侧装饰点 */}
                  <span className='relative w-1.5 h-1.5 rounded-full bg-[#a7a199] dark:bg-[#6f685f] group-hover:bg-[#d97757] dark:group-hover:bg-[#e09a7a] transition-all duration-300'></span>

                  {isLiveCard && (
                    <Radio
                      size={12}
                      className='relative inline-block transition-all duration-300 group-hover:text-[#d97757] dark:group-hover:text-[#e09a7a]'
                    />
                  )}

                  <span className='relative font-semibold'>{source_name}</span>

                  {/* 右侧装饰点 */}
                  <span className='relative w-1.5 h-1.5 rounded-full bg-[#a7a199] dark:bg-[#6f685f] group-hover:bg-[#d97757] dark:group-hover:bg-[#e09a7a] transition-all duration-300'></span>
                </span>
              </div>
            )}
          </div>
        </div>

        {/* 操作菜单 - 支持右键和长按触发 */}
        {hasOpenedMobileActionsRef.current && (
          <MobileActionSheet
            isOpen={showMobileActions}
            onClose={closeMobileActions}
            title={actualTitle}
            poster={actionSheetPoster}
            actions={mobileActions}
            sources={actionSheetSources}
            isAggregate={isAggregate}
            sourceName={source_name}
            currentEpisode={currentEpisode}
            totalEpisodes={actualEpisodes}
            origin={origin}
          />
        )}
      </>
    );
  },
);

export default memo(VideoCard);
