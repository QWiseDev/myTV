'use client';

import {
  createContext,
  Dispatch,
  ReactNode,
  SetStateAction,
  useContext,
  useMemo,
} from 'react';

import type { PlayRecord } from '@/lib/types';
import { type WatchingUpdate } from '@/lib/watching-updates';
import { usePlaybackRecords } from '@/hooks/usePlaybackRecords';
import { useWatchingUpdatesSnapshot } from '@/hooks/useWatchingUpdatesSnapshot';

interface PlaybackDataContextType {
  // 播放记录数据
  playRecords: Record<string, PlayRecord> | null;
  setPlayRecords: Dispatch<SetStateAction<Record<string, PlayRecord> | null>>;
  loadingPlayRecords: boolean;

  // 观看更新数据
  watchingUpdates: WatchingUpdate | null;
  setWatchingUpdates: (updates: WatchingUpdate | null) => void;
  loadingWatchingUpdates: boolean;

  // 手动刷新方法
  refreshPlayRecords: () => Promise<void>;
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
}

export function PlaybackDataProvider({ children }: PlaybackDataProviderProps) {
  const {
    loadingWatchingUpdates,
    refreshWatchingUpdates,
    setWatchingUpdates,
    watchingUpdates,
  } = useWatchingUpdatesSnapshot();
  const {
    loadingPlayRecords,
    playRecords,
    refreshPlayRecords,
    setPlayRecords,
  } = usePlaybackRecords(refreshWatchingUpdates);

  // 🚀 渲染性能优化：使用useMemo缓存Context值，防止不必要的重新渲染
  const value: PlaybackDataContextType = useMemo(
    () => ({
      playRecords,
      setPlayRecords,
      loadingPlayRecords,

      watchingUpdates,
      setWatchingUpdates,
      loadingWatchingUpdates,

      refreshPlayRecords,
      refreshWatchingUpdates,
    }),
    [
      playRecords,
      loadingPlayRecords,
      watchingUpdates,
      loadingWatchingUpdates,
      refreshPlayRecords,
      refreshWatchingUpdates,
    ],
  );

  return (
    <PlaybackDataContext.Provider value={value}>
      {children}
    </PlaybackDataContext.Provider>
  );
}
