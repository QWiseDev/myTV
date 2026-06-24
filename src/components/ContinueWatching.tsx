'use client';

import { Clock } from 'lucide-react';
import { useMemo } from 'react';

import {
  limitHomeRecords,
  sortHomeContinueWatchingRecords,
} from '@/lib/home-display';
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
  // 将播放记录转换为数组并根据 save_time 由近到远排序
  // 预截断到 60 条（最终展示 30 条，预留排序空间），避免全量记录遍历
  const recordsArray = useMemo(
    () =>
      playRecords
        ? Object.entries(playRecords)
            .map(([key, record]) => ({
              ...record,
              key,
            }))
            .sort((a, b) => b.save_time - a.save_time)
            .slice(0, 60)
        : [],
    [playRecords],
  );

  // 一次性处理 watchingUpdates 的所有派生数据，减少 useMemo 和遍历次数
  const {
    watchingUpdatesMap,
    newEpisodeSeries,
    continueWatchingSeries,
    continueWatchingMap,
    latestTotalEpisodesByKey,
  } = useMemo(() => {
    const seriesList = (watchingUpdates?.updatedSeries || []).filter((s) =>
      Boolean(s.videoId),
    );

    const updatesMap = new Map<
      string,
      WatchingUpdatesCache['updatedSeries'][number]
    >();
    const totalEpisodesMap = new Map<string, number>();

    watchingUpdates?.updatedSeries?.forEach((series) => {
      const key = `${series.sourceKey}+${series.videoId}`;
      updatesMap.set(key, series);
      if (series.totalEpisodes > 0) {
        totalEpisodesMap.set(key, series.totalEpisodes);
      }
    });

    const newEpisodes = seriesList.filter((s) => s.hasNewEpisode);
    const continueWatching = seriesList.filter(
      (s) => s.hasContinueWatching && !s.hasNewEpisode,
    );

    const cwMap = new Map<
      string,
      WatchingUpdatesCache['updatedSeries'][number]
    >();
    continueWatching.forEach((series) => {
      cwMap.set(`${series.sourceKey}+${series.videoId}`, series);
    });

    return {
      watchingUpdatesMap: updatesMap,
      newEpisodeSeries: newEpisodes,
      continueWatchingSeries: continueWatching,
      continueWatchingMap: cwMap,
      latestTotalEpisodesByKey: totalEpisodesMap,
    };
  }, [watchingUpdates]);

  const displayRecords = useMemo(
    () =>
      limitHomeRecords(
        sortHomeContinueWatchingRecords(recordsArray, latestTotalEpisodesByKey),
      ),
    [latestTotalEpisodesByKey, recordsArray],
  );

  // 如果没有播放记录，则不渲染组件
  if (!loading && recordsArray.length === 0) {
    return null;
  }

  // 计算播放进度百分比（限制在 0-100 范围内）
  const getProgress = (record: PlayRecord) => {
    if (record.total_time <= 0) return 0;
    return Math.min(100, Math.round((record.play_time / record.total_time) * 100));
  };

  // 从 key 中解析 source 和 id
  const parseKey = (key: string) => {
    const [source, id] = key.split('+');
    return { source, id };
  };

  // 检查播放记录是否有新集数更新
  const getNewEpisodesCount = (
    record: PlayRecord & { key: string },
  ): number => {
    const { source, id } = parseKey(record.key);
    const matchedSeries = watchingUpdatesMap.get(`${source}+${id}`);

    return matchedSeries?.hasNewEpisode ? matchedSeries.newEpisodes || 0 : 0;
  };

  // 获取最新的总集数（用于显示，不修改原始数据）
  const getLatestTotalEpisodes = (
    record: PlayRecord & { key: string },
  ): number => {
    const { source, id } = parseKey(record.key);
    const matchedSeries = watchingUpdatesMap.get(`${source}+${id}`);

    // 如果找到匹配的剧集且有最新集数信息，返回最新集数；否则返回原始集数
    return matchedSeries && matchedSeries.totalEpisodes
      ? matchedSeries.totalEpisodes
      : record.total_episodes;
  };

  const hasContinueWatchingTag = (
    record: PlayRecord & { key: string },
  ): boolean => {
    const { source, id } = parseKey(record.key);
    return continueWatchingMap.has(`${source}+${id}`);
  };

  return (
    <section className={`mb-8 ${className || ''}`}>
      <div className='mb-4 flex items-center justify-between'>
        <SectionTitle
          title='继续观看'
          icon={Clock}
          iconColor='text-green-500'
        />
        {!loading && recordsArray.length > 0 && (
          <button
            className='text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors'
            onClick={onClearAll}
          >
            清空
          </button>
        )}
      </div>

      {(newEpisodeSeries.length > 0 || continueWatchingSeries.length > 0) && (
        <div className='mb-4 flex flex-wrap gap-2'>
          {newEpisodeSeries.length > 0 && (
            <div className='inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-red-500 to-pink-500 text-white text-xs px-3 py-1 shadow-lg shadow-red-500/30'>
              <span className='w-1.5 h-1.5 rounded-full bg-white/90 animate-pulse'></span>
              新剧集 {newEpisodeSeries.length}
            </div>
          )}

          {continueWatchingSeries.length > 0 && (
            <div className='inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-blue-500 to-cyan-500 text-white text-xs px-3 py-1 shadow-lg shadow-blue-500/30'>
              <span className='w-1.5 h-1.5 rounded-full bg-white/90 animate-pulse'></span>
              继续观看 {continueWatchingSeries.length}
            </div>
          )}
        </div>
      )}

      <ScrollableRow enableAnimation={displayRecords.length <= 12}>
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
            displayRecords.map((record, index) => {
              const { source, id } = parseKey(record.key);
              const newEpisodesCount = getNewEpisodesCount(record);
              const latestTotalEpisodes = getLatestTotalEpisodes(record);
              const shouldShowContinueWatchingBadge =
                hasContinueWatchingTag(record);
              return (
                <div
                  key={record.key}
                  className='min-w-[96px] w-24 sm:min-w-[180px] sm:w-44 relative group/card'
                >
                  <div className='relative group-hover/card:z-[500] transition-all duration-300'>
                    <VideoCard
                      id={id}
                      title={record.title || record.search_title}
                      poster={record.cover}
                      year={record.year}
                      douban_id={record.douban_id}
                      source={source}
                      source_name={record.source_name}
                      progress={getProgress(record)}
                      episodes={latestTotalEpisodes}
                      currentEpisode={record.index}
                      query={record.search_title}
                      from='playrecord'
                      onDelete={() => onDeleteRecord(record.key)}
                      type={latestTotalEpisodes > 1 ? 'tv' : ''}
                      remarks={record.remarks}
                      priority={index < 3}
                      sizes='(max-width: 640px) 96px, 180px'
                    />

                    {shouldShowContinueWatchingBadge && (
                      <div
                        className={`absolute inset-0 rounded-lg animate-pulse pointer-events-none z-[501] transition-transform duration-300 ease-in-out group-hover/card:scale-[1.05] ${
                          newEpisodesCount > 0
                            ? 'ring-2 ring-red-400/60'
                            : 'ring-2 ring-blue-400/60'
                        }`}
                      ></div>
                    )}
                  </div>
                  {/* 新集数徽章 */}
                  {newEpisodesCount > 0 && (
                    <div className='absolute -top-2 -right-2 bg-gradient-to-r from-red-500 to-pink-500 text-white text-xs px-2 py-1 rounded-full shadow-lg animate-pulse z-[502] font-semibold'>
                      +{newEpisodesCount}集
                    </div>
                  )}

                  {shouldShowContinueWatchingBadge &&
                    newEpisodesCount === 0 && (
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
