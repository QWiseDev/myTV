'use client';

import { ChevronRight, Clock, Loader2 } from 'lucide-react';
import { useMemo } from 'react';

import {
  HOME_CARD_WIDTH_CLASS,
  HOME_SECTION_ACTION_CLASS,
  HOME_VIDEO_CARD_SIZES,
  SKELETON_CONFIG,
} from '@/lib/constants/home';
import {
  type ContinueWatchingDisplayItem,
  buildContinueWatchingDisplayState,
} from '@/lib/continue-watching-display';
import type { PlayRecord } from '@/lib/types';
import type { WatchingUpdatesCache } from '@/lib/watching-updates';

import HomeCardShell from '@/components/HomeCardShell';
import HomeSectionHeader from '@/components/HomeSectionHeader';
import ScrollableRow from '@/components/ScrollableRow';
import SkeletonRow from '@/components/SkeletonRow';
import VideoCard from '@/components/VideoCard';

interface ContinueWatchingProps {
  className?: string;
  playRecords: Record<string, PlayRecord> | null;
  watchingUpdates?: WatchingUpdatesCache | null;
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  onDeleteRecord: (key: string) => void;
  onClearAll: () => void;
  onLoadMore: () => Promise<void>;
}

const SUMMARY_BADGE_STYLES = {
  new: 'bg-gradient-to-r from-red-500 to-pink-500 shadow-red-500/30',
  continue: 'bg-gradient-to-r from-blue-500 to-cyan-500 shadow-blue-500/30',
} as const;

const CORNER_BADGE_STYLES = {
  new: 'bg-gradient-to-r from-red-500 to-pink-500',
  continue: 'bg-gradient-to-r from-blue-500 to-cyan-500',
} as const;

const RING_STYLES = {
  new: 'ring-2 ring-red-400/60',
  continue: 'ring-2 ring-blue-400/60',
} as const;

function SummaryBadge({
  tone,
  label,
}: {
  tone: keyof typeof SUMMARY_BADGE_STYLES;
  label: string;
}) {
  return (
    <div
      className={`inline-flex items-center gap-1.5 rounded-full text-white text-xs px-3 py-1 shadow-lg ${SUMMARY_BADGE_STYLES[tone]}`}
    >
      <span className='w-1.5 h-1.5 rounded-full bg-white/90 animate-pulse'></span>
      {label}
    </div>
  );
}

function CornerBadge({
  tone,
  children,
}: {
  tone: keyof typeof CORNER_BADGE_STYLES;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`absolute -top-2 -right-2 text-white text-xs px-2 py-1 rounded-full shadow-lg animate-pulse z-[502] font-semibold ${CORNER_BADGE_STYLES[tone]}`}
    >
      {children}
    </div>
  );
}

function ContinueWatchingCard({
  item,
  index,
  onDeleteRecord,
}: {
  item: ContinueWatchingDisplayItem;
  index: number;
  onDeleteRecord: (key: string) => void;
}) {
  const { record } = item;
  const badgeTone = item.newEpisodesCount > 0 ? 'new' : 'continue';

  return (
    <HomeCardShell className='relative group/card'>
      <div className='relative group-hover/card:z-[500] transition-all duration-300'>
        <VideoCard
          id={item.id}
          title={record.title || record.search_title}
          poster={record.cover}
          year={record.year}
          douban_id={record.douban_id}
          source={item.source}
          source_name={record.source_name}
          progress={item.progress}
          episodes={item.latestTotalEpisodes}
          currentEpisode={record.index}
          query={record.search_title}
          from='playrecord'
          onDelete={() => onDeleteRecord(record.key)}
          type={item.latestTotalEpisodes > 1 ? 'tv' : ''}
          remarks={record.remarks}
          priority={index < 3}
          sizes={HOME_VIDEO_CARD_SIZES}
        />

        {item.showContinueWatchingBadge && (
          <div
            className={`absolute inset-0 rounded-lg animate-pulse pointer-events-none z-[501] transition-transform duration-300 ease-in-out group-hover/card:scale-[1.05] ${RING_STYLES[badgeTone]}`}
          ></div>
        )}
      </div>

      {item.newEpisodesCount > 0 && (
        <CornerBadge tone='new'>+{item.newEpisodesCount}集</CornerBadge>
      )}

      {item.showContinueWatchingBadge && item.newEpisodesCount === 0 && (
        <CornerBadge tone='continue'>继续看</CornerBadge>
      )}
    </HomeCardShell>
  );
}

export default function ContinueWatching({
  className,
  playRecords,
  watchingUpdates,
  loading,
  loadingMore,
  hasMore,
  onDeleteRecord,
  onClearAll,
  onLoadMore,
}: ContinueWatchingProps) {
  const { newEpisodeSeries, continueWatchingSeries, displayItems, records } =
    useMemo(
      () => buildContinueWatchingDisplayState(playRecords, watchingUpdates),
      [playRecords, watchingUpdates],
    );
  const hasRecords = records.length > 0;
  const hasNewEpisodeSeries = newEpisodeSeries.length > 0;
  const hasContinueWatchingSeries = continueWatchingSeries.length > 0;
  const showSummaryBadges = hasNewEpisodeSeries || hasContinueWatchingSeries;

  // 如果没有播放记录，则不渲染组件
  if (!loading && !hasRecords) {
    return null;
  }

  return (
    <section className={`mb-8 ${className || ''}`}>
      <HomeSectionHeader
        title='继续观看'
        icon={Clock}
        action={
          !loading && hasRecords ? (
            <button
              type='button'
              className={HOME_SECTION_ACTION_CLASS}
              onClick={onClearAll}
            >
              清空
            </button>
          ) : null
        }
      />

      {showSummaryBadges && (
        <div className='mb-4 flex flex-wrap gap-2'>
          {hasNewEpisodeSeries && (
            <SummaryBadge
              tone='new'
              label={`新剧集 ${newEpisodeSeries.length}`}
            />
          )}

          {hasContinueWatchingSeries && (
            <SummaryBadge
              tone='continue'
              label={`继续观看 ${continueWatchingSeries.length}`}
            />
          )}
        </div>
      )}

      <ScrollableRow>
        {loading ? (
          <SkeletonRow count={SKELETON_CONFIG.CONTINUE_WATCHING_COUNT} />
        ) : (
          displayItems.map((item, index) => (
            <ContinueWatchingCard
              key={item.record.key}
              item={item}
              index={index}
              onDeleteRecord={onDeleteRecord}
            />
          ))
        )}
        {!loading && hasMore && (
          <button
            type='button'
            onClick={() => {
              void onLoadMore();
            }}
            disabled={loadingMore}
            className={`${HOME_CARD_WIDTH_CLASS} aspect-[2/3] rounded-lg border border-dashed border-gray-300 bg-white/60 text-gray-600 transition-colors hover:border-gray-400 hover:bg-white disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900/50 dark:text-gray-300 dark:hover:border-gray-500 dark:hover:bg-gray-800/70 flex flex-col items-center justify-center gap-2`}
            aria-label='加载更多继续观看'
          >
            {loadingMore ? (
              <Loader2 className='h-5 w-5 animate-spin' />
            ) : (
              <ChevronRight className='h-5 w-5' />
            )}
            <span className='text-xs sm:text-sm font-medium'>
              {loadingMore ? '加载中' : '更多'}
            </span>
          </button>
        )}
      </ScrollableRow>
    </section>
  );
}
