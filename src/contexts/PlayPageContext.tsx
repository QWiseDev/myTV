'use client';

import {
  createContext,
  Dispatch,
  ReactNode,
  SetStateAction,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { scheduleIdleTask } from '@/lib/browser-scheduler';
import type { PlayRecord } from '@/lib/types';
import { type WatchingUpdate } from '@/lib/watching-updates';

function debugError(...args: unknown[]) {
  if (process.env.NODE_ENV !== 'production') {
    console.error(...args);
  }
}

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
  const [playRecords, setPlayRecords] = useState<Record<
    string,
    PlayRecord
  > | null>(null);
  const [loadingPlayRecords, setLoadingPlayRecords] = useState(true);

  const [watchingUpdates, setWatchingUpdates] = useState<WatchingUpdate | null>(
    null,
  );
  const [loadingWatchingUpdates, setLoadingWatchingUpdates] = useState(false);

  // 🔧 防抖定时器
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 🔧 防重复初始化标记
  const initRef = useRef({ playRecords: false, watchingUpdates: false });

  // 加载播放记录（只取最近 60 条，避免全量）
  const loadPlayRecords = useCallback(async () => {
    // 🔧 修复：移除防重复加载机制，允许页面重新访问时重新加载播放记录
    // 这样可以确保从其他页面返回播放页面时能正确恢复播放进度
    try {
      setLoadingPlayRecords(true);
      const { getRecentPlayRecords } = await import('@/lib/db.client');
      const records = await getRecentPlayRecords(60);
      setPlayRecords(records);
      initRef.current.playRecords = true;
    } catch (error) {
      debugError('加载播放记录失败:', error);
      setPlayRecords(null);
    } finally {
      setLoadingPlayRecords(false);
    }
  }, []);

  // 🚀 优化：只从缓存获取观看更新，不主动触发检查
  // 追番更新检查应该在专门的页面（如首页）进行，而不是在播放页面
  const loadWatchingUpdates = useCallback(async (force = false) => {
    if (typeof window === 'undefined') return;

    // 🔧 防重复：如果不是强制刷新且已经加载过，不再重复加载
    if (!force && initRef.current.watchingUpdates) {
      return;
    }

    try {
      setLoadingWatchingUpdates(true);

      const { getDetailedWatchingUpdates } =
        await import('@/lib/watching-updates');

      // 只从缓存获取，不主动调用 checkWatchingUpdates
      const updates = getDetailedWatchingUpdates();
      if (updates) {
        setWatchingUpdates(updates);
      } else {
        setWatchingUpdates(null);
      }

      initRef.current.watchingUpdates = true;
    } catch (error) {
      debugError('加载观看更新失败:', error);
      setWatchingUpdates(null);
    } finally {
      setLoadingWatchingUpdates(false);
    }
  }, []);

  // 🚀 性能优化：使用useCallback缓存刷新函数
  const refreshPlayRecords = useCallback(async () => {
    if (typeof window !== 'undefined' && refreshTimeoutRef.current) {
      clearTimeout(refreshTimeoutRef.current);
    }
    if (typeof window !== 'undefined') {
      refreshTimeoutRef.current = setTimeout(async () => {
        // 🔧 重置初始化标记，允许重新加载
        initRef.current.playRecords = false;
        initRef.current.watchingUpdates = false;

        await loadPlayRecords();
        // 同时刷新观看更新
        await loadWatchingUpdates(true);
      }, 500); // 500ms 防抖
    }
  }, [loadPlayRecords, loadWatchingUpdates]);

  // 🚀 性能优化：使用useCallback缓存刷新函数
  const refreshWatchingUpdates = useCallback(async () => {
    // 🔧 重置初始化标记，允许重新加载
    initRef.current.watchingUpdates = false;
    await loadWatchingUpdates(true);
  }, [loadWatchingUpdates]);

  // 初始化加载 - 🚀 优化：延迟非关键数据加载，让首屏先渲染
  // 播放记录和追更数据对首页而言在首屏可见区域下方（继续观看区块），无需阻塞首次渲染
  useEffect(() => {
    const cancelLoad = scheduleIdleTask(
      () => {
        void loadPlayRecords();
      },
      {
        delayMs: 200,
        timeoutMs: 1000,
      },
    );

    return () => {
      cancelLoad();
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
        refreshTimeoutRef.current = null;
      }
    };
  }, [loadPlayRecords]);

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
