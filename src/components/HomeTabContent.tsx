'use client';

import { Film, Sparkles, Tv } from 'lucide-react';
import { lazy, Suspense } from 'react';

import { HOME_VIDEO_CARD_SIZES } from '@/lib/constants/home';
import type { HomeLoadingState } from '@/lib/home-data-client';
import type { HomeData } from '@/lib/home-data-types';
import type { DoubanItem, PlayRecord } from '@/lib/types';
import type { WatchingUpdatesCache } from '@/lib/watching-updates';

import BangumiSection from './BangumiSection';
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
  onDeleteRecord: (key: string) => void;
  onClearAll: () => void;
  onLoadMore: () => Promise<void>;
}

interface HomeTabContentProps {
  continueWatching: HomeContinueWatchingState;
  homeData: HomeData;
  loading: HomeLoadingState;
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
  homeData,
  loading,
}: HomeTabContentProps) {
  const hasContinueWatching =
    Object.keys(continueWatching.playRecords).length > 0;
  const { hotMovies, hotTvShows, hotVarietyShows, bangumiCalendarData } =
    homeData;
  const { criticalLoading, secondaryLoading, tertiaryLoading } = loading;

  return (
    <>
      {/* 继续观看 */}
      <Suspense fallback={<SectionSkeleton title='继续观看' />}>
        <ContinueWatching
          playRecords={continueWatching.playRecords}
          watchingUpdates={continueWatching.watchingUpdates}
          loading={continueWatching.loading}
          loadingMore={continueWatching.loadingMore}
          hasMore={continueWatching.hasMore}
          onDeleteRecord={continueWatching.onDeleteRecord}
          onClearAll={continueWatching.onClearAll}
          onLoadMore={continueWatching.onLoadMore}
        />
      </Suspense>

      {/* 热门电影：首屏关键路径，VideoCard 静态导入减少瀑布 */}
      <Suspense fallback={<SectionSkeleton title='热门电影' />}>
        <LazyVideoSection
          title='热门电影'
          icon={Film}
          linkHref='/douban?type=movie'
          data={hotMovies}
          loading={criticalLoading}
          renderItem={(movie, index) =>
            renderDoubanCard(movie, {
              type: 'movie',
              priority: !hasContinueWatching && index < 3,
            })
          }
        />
      </Suspense>

      {/* 热门剧集 */}
      <Suspense fallback={<SectionSkeleton title='热门剧集' />}>
        <LazyVideoSection
          title='热门剧集'
          icon={Tv}
          linkHref='/douban?type=tv'
          data={hotTvShows}
          loading={secondaryLoading}
          enableAnimation={false}
          renderItem={(show) => renderDoubanCard(show)}
        />
      </Suspense>

      {/* 每日新番放送 */}
      <Suspense fallback={<SectionSkeleton title='新番放送' />}>
        <BangumiSection
          bangumiCalendarData={bangumiCalendarData}
          loading={tertiaryLoading}
        />
      </Suspense>

      {/* 热门综艺 */}
      <Suspense fallback={<SectionSkeleton title='热门综艺' />}>
        <LazyVideoSection
          title='热门综艺'
          icon={Sparkles}
          linkHref='/douban?type=show'
          data={hotVarietyShows}
          loading={secondaryLoading}
          enableAnimation={false}
          renderItem={(show) => renderDoubanCard(show)}
        />
      </Suspense>
    </>
  );
}
