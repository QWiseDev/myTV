'use client';

import { Clock } from 'lucide-react';
import { useMemo } from 'react';

import { buildContinueWatchingDisplayState } from '@/lib/continue-watching-display';
import type { PlayRecord } from '@/lib/types';
import type { WatchingUpdatesCache } from '@/lib/watching-updates';

import ScrollableRow from '@/components/ScrollableRow';
import SectionTitle from '@/components/SectionTitle';
import SkeletonCard from '@/components/SkeletonCard';
import VideoCard from '@/components/VideoCard';

interface ContinueWatchingProps {
  className?: string;
  playRecords: Record<string, PlayRecord> | null;
  watchingUpdates?: WatchingUpdatesCache | null;
  loading: boolean;
  onDeleteRecord: (key: string) => void;
  onClearAll: () => void;
}

export default function ContinueWatching({
  className,
  playRecords,
  watchingUpdates,
  loading,
  onDeleteRecord,
  onClearAll,
}: ContinueWatchingProps) {
  const {
    newEpisodeSeries,
    continueWatchingSeries,
    displayItems,
    records,
  } = useMemo(
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
      <div className='mb-4 flex items-center justify-between'>
        <SectionTitle title='继续观看' icon={Clock} />
        {!loading && hasRecords && (
          <button
            className='text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors'
            onClick={onClearAll}
          >
            清空
          </button>
        )}
      </div>

      {showSummaryBadges && (
        <div className='mb-4 flex flex-wrap gap-2'>
          {hasNewEpisodeSeries && (
            <div className='inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-red-500 to-pink-500 text-white text-xs px-3 py-1 shadow-lg shadow-red-500/30'>
              <span className='w-1.5 h-1.5 rounded-full bg-white/90 animate-pulse'></span>
              新剧集 {newEpisodeSeries.length}
            </div>
          )}

          {hasContinueWatchingSeries && (
            <div className='inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-blue-500 to-cyan-500 text-white text-xs px-3 py-1 shadow-lg shadow-blue-500/30'>
              <span className='w-1.5 h-1.5 rounded-full bg-white/90 animate-pulse'></span>
              继续观看 {continueWatchingSeries.length}
            </div>
          )}
        </div>
      )}

      <ScrollableRow enableAnimation={displayItems.length <= 12}>
        {loading
          ? // 加载状态显示灰色占位数据
            Array.from({ length: 6 }).map((_, index) => (
              <div
                key={index}
                className='min-w-[96px] w-24 sm:min-w-[180px] sm:w-44'
              >
                <SkeletonCard />
              </div>
            ))
          : // 显示真实数据
            displayItems.map((item, index) => {
              const { record } = item;
              return (
                <div
                  key={record.key}
                  className='min-w-[96px] w-24 sm:min-w-[180px] sm:w-44 relative group/card'
                >
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
                      sizes='(max-width: 640px) 96px, 180px'
                    />

                    {item.showContinueWatchingBadge && (
                      <div
                        className={`absolute inset-0 rounded-lg animate-pulse pointer-events-none z-[501] transition-transform duration-300 ease-in-out group-hover/card:scale-[1.05] ${
                          item.newEpisodesCount > 0
                            ? 'ring-2 ring-red-400/60'
                            : 'ring-2 ring-blue-400/60'
                        }`}
                      ></div>
                    )}
                  </div>
                  {/* 新集数徽章 */}
                  {item.newEpisodesCount > 0 && (
                    <div className='absolute -top-2 -right-2 bg-gradient-to-r from-red-500 to-pink-500 text-white text-xs px-2 py-1 rounded-full shadow-lg animate-pulse z-[502] font-semibold'>
                      +{item.newEpisodesCount}集
                    </div>
                  )}

                  {item.showContinueWatchingBadge &&
                    item.newEpisodesCount === 0 && (
                      <div className='absolute -top-2 -right-2 bg-gradient-to-r from-blue-500 to-cyan-500 text-white text-xs px-2 py-1 rounded-full shadow-lg animate-pulse z-[502] font-semibold'>
                        继续看
                      </div>
                    )}
                </div>
              );
            })}
      </ScrollableRow>
    </section>
  );
}
