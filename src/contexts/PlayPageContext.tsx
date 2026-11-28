'use client';

import { createContext, ReactNode, useContext, useMemo } from 'react';

import type { HomeInitialPlaybackData } from '@/lib/home-data-types';
import { generateStorageKey } from '@/lib/storage-key';
import type { PlayRecord } from '@/lib/types';
import type { WatchingUpdate } from '@/lib/watching-updates';
import {
  type PlayRecordsLoadError,
  type UseContinueWatchingDataOptions,
  useContinueWatchingData,
} from '@/hooks/useContinueWatchingData';
import { useWatchingUpdatesSnapshot } from '@/hooks/useWatchingUpdatesSnapshot';

interface PlaybackDataContextType {
  // 播放记录数据
  playRecords: Record<string, PlayRecord> | null;
  loadingPlayRecords: boolean;
  loadingMorePlayRecords: boolean;
  hasMorePlayRecords: boolean;
  playRecordsLoadError: PlayRecordsLoadError;
  loadMorePlayRecords: () => Promise<void>;
  retryPlayRecords: () => Promise<void>;
  deleteRecord: (key: string) => void;
  clearAll: () => void;

  // 观看更新数据
  watchingUpdates: WatchingUpdate | null;
  setWatchingUpdates: (updates: WatchingUpdate | null) => void;
  loadingWatchingUpdates: boolean;

  // 手动刷新方法
  refreshWatchingUpdates: () => Promise<void>;
}

const PlaybackDataContext = createContext<PlaybackDataContextType | null>(null);

export function usePlaybackData() {
  const context = useContext(PlaybackDataContext);
  if (!context) {
    throw new Error('usePlaybackData must be used within PlaybackDataProvider');
  }
  return context;
}

interface PlaybackDataProviderProps {
  children: ReactNode;
  includePlayRecordKeys?: string[];
  /** 立即加载首屏播放记录（播放页跳过 200ms idle 延迟，加快续播恢复） */
  eager?: boolean;
  /** SSR 首屏直出的播放记录与追更快照 */
  initialPlaybackData?: HomeInitialPlaybackData;
}

const EMPTY_INCLUDE_PLAY_RECORD_KEYS: string[] = [];

export function PlaybackDataProvider({
  children,
  includePlayRecordKeys = EMPTY_INCLUDE_PLAY_RECORD_KEYS,
  eager = false,
  initialPlaybackData,
}: PlaybackDataProviderProps) {
  const {
    loadingWatchingUpdates,
    refreshWatchingUpdates,
    setWatchingUpdates,
    watchingUpdates,
  } = useWatchingUpdatesSnapshot(initialPlaybackData?.watchingUpdates);
  const priorityPlayRecordKeys = useMemo(
    () =>
      (watchingUpdates?.updatedSeries || [])
        .filter((series) => series.hasNewEpisode)
        .map((series) => generateStorageKey(series.sourceKey, series.videoId)),
    [watchingUpdates?.updatedSeries],
  );
  const firstPagePlayRecordKeys = useMemo(
    () =>
      Array.from(
        new Set([...includePlayRecordKeys, ...priorityPlayRecordKeys]),
      ),
    [includePlayRecordKeys, priorityPlayRecordKeys],
  );
  const initialPage = initialPlaybackData?.playRecordsPage ?? null;
  const continueWatchingArgs: [string[], UseContinueWatchingDataOptions?] =
    eager || initialPage !== null
      ? [
          firstPagePlayRecordKeys,
          {
            ...(eager ? { eager: true } : {}),
            ...(initialPage !== null ? { initialPage } : {}),
          },
        ]
      : [firstPagePlayRecordKeys];
  const {
    loadingPlayRecords,
    loadingMorePlayRecords,
    hasMorePlayRecords,
    loadMorePlayRecords,
    playRecords,
    playRecordsLoadError,
    retryPlayRecords,
    deleteRecord,
    clearAll,
  } = useContinueWatchingData(...continueWatchingArgs);

  const value: PlaybackDataContextType = useMemo(
    () => ({
      playRecords,
      loadingPlayRecords,
      loadingMorePlayRecords,
      hasMorePlayRecords,
      playRecordsLoadError,
      loadMorePlayRecords,
      retryPlayRecords,
      deleteRecord,
      clearAll,

      watchingUpdates,
      setWatchingUpdates,
      loadingWatchingUpdates,

      refreshWatchingUpdates,
    }),
    [
      playRecords,
      loadingPlayRecords,
      loadingMorePlayRecords,
      hasMorePlayRecords,
      playRecordsLoadError,
      loadMorePlayRecords,
      retryPlayRecords,
      deleteRecord,
      clearAll,
      watchingUpdates,
      loadingWatchingUpdates,
      setWatchingUpdates,
      refreshWatchingUpdates,
    ],
  );

  return (
    <PlaybackDataContext.Provider value={value}>
      {children}
    </PlaybackDataContext.Provider>
  );
}
