'use client';

import { Film, Sparkles, Tv } from 'lucide-react';
import { lazy, Suspense, useMemo } from 'react';

import {
  HOME_RENDER_LIMITS,
  HOME_VIDEO_CARD_SIZES,
} from '@/lib/constants/home';
import type {
  HomeErrorState,
  HomeLoadingState,
  HomeSectionKey,
} from '@/lib/home-data-client';
import type { HomeData } from '@/lib/home-data-types';
import { parseStorageKey } from '@/lib/storage-key';
import type { DoubanItem, PlayRecord } from '@/lib/types';
import { buildPlayUrl } from '@/lib/video-card-utils';
import type { WatchingUpdatesCache } from '@/lib/watching-updates';
import type { PlayRecordsLoadError } from '@/hooks/useContinueWatchingData';

import BangumiSection from './BangumiSection';
import HeroCarousel, { type HeroContinueItem } from './HeroCarousel';
import LazyVideoSection from './LazyVideoSection';
import SectionSkeleton from './SectionSkeleton';
import VideoCard from './VideoCard';

const ContinueWatching = lazy(() => import('./ContinueWatching'));

/** 继续观看区块所需的播放态与操作 */
export interface HomeContinueWatchingState {
  playRecords: Record<string, PlayRecord>;
  watchingUpdates: WatchingUpdatesCache | null;
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  loadError: PlayRecordsLoadError;
  onDeleteRecord: (key: string) => void;
  onClearAll: () => void;
  onLoadMore: () => Promise<void>;
  onRetry: () => Promise<void>;
}

interface HomeTabContentProps {
  continueWatching: HomeContinueWatchingState;
  errors: HomeErrorState;
  homeData: HomeData;
  loading: HomeLoadingState;
  retrySection: (section: HomeSectionKey) => Promise<void>;
}

function renderDoubanCard(
  item: DoubanItem,
  options?: {
    type?: string;
    priority?: boolean;
  },
) {
  return (
    <VideoCard
      from='douban'
      title={item.title}
      poster={item.poster}
      douban_id={Number(item.id)}
      rate={item.rate}
      year={item.year}
      type={options?.type}
      priority={options?.priority}
      sizes={HOME_VIDEO_CARD_SIZES}
    />
  );
}

/**
 * 首页内容区块组件 - 展示继续观看、热门内容等区块
 */
export default function HomeTabContent({
  continueWatching,
  errors,
  homeData,
  loading,
  retrySection,
}: HomeTabContentProps) {
  const hasContinueWatching =
    Object.keys(continueWatching.playRecords).length > 0;
  const { hotMovies, hotTvShows, hotVarietyShows, bangumiCalendarData } =
    homeData;
  const { criticalLoading, tertiaryLoading, tvLoading, varietyLoading } =
    loading;

  // 爱奇艺式首屏轮播：最近 4 条继续追记录作为前几帧（按最近观看排序，同名多源去重）
  const heroContinueItems = useMemo<HeroContinueItem[]>(() => {
    const entries = Object.entries(continueWatching.playRecords)
      .filter(([, record]) => record.title && record.cover)
      .sort((a, b) => b[1].save_time - a[1].save_time);

    const items: HeroContinueItem[] = [];
    const seenTitles = new Set<string>();
    for (const [key, record] of entries) {
      if (items.length >= HOME_RENDER_LIMITS.HERO_CONTINUE) break;
      if (seenTitles.has(record.title)) continue;

      const parsed = parseStorageKey(key);
      if (!parsed?.source || !parsed.id) continue;

      const href = buildPlayUrl({
        from: 'playrecord',
        source: parsed.source,
        id: parsed.id,
        title: record.title,
        year: record.year,
        // 与下方继续观看卡片保持一致，带上豆瓣 ID 与搜索标题
        doubanId: record.douban_id,
        query: record.search_title,
      });
      if (!href) continue;

      seenTitles.add(record.title);
      items.push({
        key,
        title: record.title,
        poster: record.cover,
        year: record.year,
        episodeLabel:
          record.total_episodes > 1
            ? `看到第 ${record.index} 集 / 共 ${record.total_episodes} 集`
            : undefined,
        href,
      });
    }
    return items;
  }, [continueWatching.playRecords]);

  return (
    <>
      {/* 爱奇艺式首屏大轮播 */}
      <HeroCarousel
        continueItems={heroContinueItems}
        movies={hotMovies}
        loading={criticalLoading || continueWatching.loading}
      />

      {/* 继续观看 */}
      <Suspense fallback={<SectionSkeleton title='继续观看' />}>
        <ContinueWatching
          playRecords={continueWatching.playRecords}
          watchingUpdates={continueWatching.watchingUpdates}
          loading={continueWatching.loading}
          loadingMore={continueWatching.loadingMore}
          hasMore={continueWatching.hasMore}
          loadError={continueWatching.loadError}
          onDeleteRecord={continueWatching.onDeleteRecord}
          onClearAll={continueWatching.onClearAll}
          onLoadMore={continueWatching.onLoadMore}
          onRetry={continueWatching.onRetry}
        />
      </Suspense>

      {/* 热门电影：首屏关键路径，VideoCard 静态导入减少瀑布 */}
      <LazyVideoSection
        title='热门电影'
        icon={Film}
        linkHref='/douban?type=movie'
        data={hotMovies}
        loading={criticalLoading}
        loadError={errors.critical}
        onRetry={() => retrySection('critical')}
        renderItem={(movie, index) =>
          renderDoubanCard(movie, {
            type: 'movie',
            priority:
              !continueWatching.loading && !hasContinueWatching && index < 3,
          })
        }
      />

      {/* 热门剧集 */}
      <LazyVideoSection
        title='热门剧集'
        icon={Tv}
        linkHref='/douban?type=tv'
        data={hotTvShows}
        loading={tvLoading}
        loadError={errors.tv}
        onRetry={() => retrySection('tv')}
        enableAnimation={false}
        renderItem={(show) => renderDoubanCard(show)}
      />

      {/* 每日新番放送 */}
      <BangumiSection
        bangumiCalendarData={bangumiCalendarData}
        loading={tertiaryLoading}
        loadError={errors.tertiary}
        onRetry={() => retrySection('tertiary')}
      />

      {/* 热门综艺 */}
      <LazyVideoSection
        title='热门综艺'
        icon={Sparkles}
        linkHref='/douban?type=show'
        data={hotVarietyShows}
        loading={varietyLoading}
        loadError={errors.variety}
        onRetry={() => retrySection('variety')}
        enableAnimation={false}
        renderItem={(show) => renderDoubanCard(show)}
      />
    </>
  );
}
