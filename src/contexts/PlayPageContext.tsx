'use client';

import { createContext, ReactNode, useContext, useMemo } from 'react';

import { generateStorageKey } from '@/lib/storage-key';
import type { PlayRecord } from '@/lib/types';
import type { WatchingUpdate } from '@/lib/watching-updates';
import {
  type PlayRecordsLoadError,
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

// 创建自定义Hook用于在页面内部使用
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
}

const EMPTY_INCLUDE_PLAY_RECORD_KEYS: string[] = [];

export function PlaybackDataProvider({
  children,
  includePlayRecordKeys = EMPTY_INCLUDE_PLAY_RECORD_KEYS,
}: PlaybackDataProviderProps) {
  const {
    loadingWatchingUpdates,
    refreshWatchingUpdates,
    setWatchingUpdates,
    watchingUpdates,
  } = useWatchingUpdatesSnapshot();
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
  } = useContinueWatchingData(firstPagePlayRecordKeys);

  // 🚀 渲染性能优化：使用useMemo缓存Context值，防止不必要的重新渲染
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
