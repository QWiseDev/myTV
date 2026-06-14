'use client';

import { Film, Sparkles, Tv } from 'lucide-react';
import { lazy, Suspense } from 'react';

import { BangumiCalendarData } from '@/lib/bangumi.client';
import type { PlayRecord } from '@/lib/types';
import { DoubanItem } from '@/lib/types';
import { WatchingUpdatesCache } from '@/lib/watching-updates';

import BangumiSection from './BangumiSection';
import LazyVideoSection from './LazyVideoSection';
import SectionSkeleton from './SectionSkeleton';

const ContinueWatching = lazy(() => import('./ContinueWatching'));
const VideoCard = lazy(() => import('./VideoCard'));

interface HomeTabContentProps {
  // 播放记录相关
  playRecords: Record<string, PlayRecord>;
  watchingUpdates: WatchingUpdatesCache | null;
  loadingPlayRecords: boolean;
  loadingWatchingUpdates: boolean;
  onDeleteRecord: (key: string) => void;
  onClearAll: () => void;
  // 内容数据
  hotMovies: DoubanItem[];
  hotTvShows: DoubanItem[];
  hotVarietyShows: DoubanItem[];
  bangumiCalendarData: BangumiCalendarData[];
  // 加载状态
  criticalLoading: boolean;
  secondaryLoading: boolean;
  tertiaryLoading: boolean;
}

/**
 * 首页内容区块组件 - 展示继续观看、热门内容等区块
 */
export default function HomeTabContent({
  playRecords,
  watchingUpdates,
  loadingPlayRecords,
  loadingWatchingUpdates,
  onDeleteRecord,
  onClearAll,
  hotMovies,
  hotTvShows,
  hotVarietyShows,
  bangumiCalendarData,
  criticalLoading,
  secondaryLoading,
  tertiaryLoading,
}: HomeTabContentProps) {
  const hasContinueWatching = Object.keys(playRecords).length > 0;

  return (
    <>
      {/* 继续观看 */}
      <Suspense fallback={<SectionSkeleton title='继续观看' />}>
        <ContinueWatching
          playRecords={playRecords}
          watchingUpdates={watchingUpdates}
          loading={loadingPlayRecords || loadingWatchingUpdates}
          onDeleteRecord={onDeleteRecord}
          onClearAll={onClearAll}
        />
      </Suspense>

      {/* 热门电影 */}
      <Suspense fallback={<SectionSkeleton title='热门电影' />}>
        <LazyVideoSection
          title='热门电影'
          icon={Film}
          iconColor='text-red-500'
          linkHref='/douban?type=movie'
          data={hotMovies}
          loading={criticalLoading}
          renderItem={(movie, index) => (
            <VideoCard
              from='douban'
              title={movie.title}
              poster={movie.poster}
              douban_id={Number(movie.id)}
              rate={movie.rate}
              year={movie.year}
              type='movie'
              priority={!hasContinueWatching && index < 3}
              sizes='(max-width: 640px) 96px, 180px'
            />
          )}
        />
      </Suspense>

      {/* 热门剧集 */}
      <Suspense fallback={<SectionSkeleton title='热门剧集' />}>
        <LazyVideoSection
          title='热门剧集'
          icon={Tv}
          iconColor='text-blue-500'
          linkHref='/douban?type=tv'
          data={hotTvShows}
          loading={secondaryLoading}
          enableAnimation={false}
          renderItem={(show) => (
            <VideoCard
              from='douban'
              title={show.title}
              poster={show.poster}
              douban_id={Number(show.id)}
              rate={show.rate}
              year={show.year}
              sizes='(max-width: 640px) 96px, 180px'
            />
          )}
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
          iconColor='text-pink-500'
          linkHref='/douban?type=show'
          data={hotVarietyShows}
          loading={secondaryLoading}
          enableAnimation={false}
          renderItem={(show) => (
            <VideoCard
              from='douban'
              title={show.title}
              poster={show.poster}
              douban_id={Number(show.id)}
              rate={show.rate}
              year={show.year}
              sizes='(max-width: 640px) 96px, 180px'
            />
          )}
        />
      </Suspense>
    </>
  );
}
