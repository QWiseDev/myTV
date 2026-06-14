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

import type { PlayRecord } from '@/lib/types';
import { type WatchingUpdate } from '@/lib/watching-updates';

interface PlayPageContextType {
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

const PlayPageContext = createContext<PlayPageContextType | null>(null);

// 创建自定义Hook用于在页面内部使用
export function usePlayPageInternal() {
  const context = useContext(PlayPageContext);
  if (!context) {
    throw new Error('usePlayPageInternal must be used within PlayPageProvider');
  }
  return context;
}

// 用于子组件的Hook - 接收props而不是直接调用Context
export function usePlayPageData(
  playRecordsProp?: Record<string, PlayRecord> | null,
  watchingUpdatesProp?: WatchingUpdate | null
) {
  return {
    playRecords: playRecordsProp,
    watchingUpdates: watchingUpdatesProp,
  };
}

interface PlayPageProviderProps {
  children: ReactNode;
}

export function PlayPageProvider({ children }: PlayPageProviderProps) {
  const [playRecords, setPlayRecords] = useState<Record<
    string,
    PlayRecord
  > | null>(null);
  const [loadingPlayRecords, setLoadingPlayRecords] = useState(true);

  const [watchingUpdates, setWatchingUpdates] = useState<WatchingUpdate | null>(
    null
  );
  const [loadingWatchingUpdates, setLoadingWatchingUpdates] = useState(false);

  // 🔧 防抖定时器
  const refreshTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 🔧 防重复初始化标记
  const initRef = useRef(
    typeof window !== 'undefined'
      ? { playRecords: false, watchingUpdates: false }
      : { playRecords: false, watchingUpdates: false }
  );

  // 加载播放记录
  const loadPlayRecords = async () => {
    // 🔧 修复：移除防重复加载机制，允许页面重新访问时重新加载播放记录
    // 这样可以确保从其他页面返回播放页面时能正确恢复播放进度
    try {
      setLoadingPlayRecords(true);
      const { getAllPlayRecords } = await import('@/lib/db.client');
      const records = await getAllPlayRecords();
      setPlayRecords(records);
      initRef.current.playRecords = true;
      console.log('✅ 播放记录加载完成');
    } catch (error) {
      console.error('加载播放记录失败:', error);
      setPlayRecords(null);
    } finally {
      setLoadingPlayRecords(false);
    }
  };

  // 🚀 优化：只从缓存获取观看更新，不主动触发检查
  // 追番更新检查应该在专门的页面（如首页）进行，而不是在播放页面
  const loadWatchingUpdates = async (force = false) => {
    if (typeof window === 'undefined') return;

    // 🔧 防重复：如果不是强制刷新且已经加载过，不再重复加载
    if (!force && initRef.current.watchingUpdates) {
      console.log('📦 观看更新已加载，跳过重复加载');
      return;
    }

    try {
      setLoadingWatchingUpdates(true);

      const { getDetailedWatchingUpdates } = await import(
        '@/lib/watching-updates'
      );

      // 只从缓存获取，不主动调用 checkWatchingUpdates
      const updates = getDetailedWatchingUpdates();
      if (updates) {
        setWatchingUpdates(updates);
        console.log('📦 从缓存获取观看更新');
      } else {
        console.log('📦 暂无缓存的观看更新');
        setWatchingUpdates(null);
      }

      initRef.current.watchingUpdates = true;
      console.log('✅ 观看更新加载完成');
    } catch (error) {
      console.error('加载观看更新失败:', error);
      setWatchingUpdates(null);
    } finally {
      setLoadingWatchingUpdates(false);
    }
  };

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
  }, []);

  // 🚀 性能优化：使用useCallback缓存刷新函数
  const refreshWatchingUpdates = useCallback(async () => {
    // 🔧 重置初始化标记，允许重新加载
    initRef.current.watchingUpdates = false;
    await loadWatchingUpdates(true);
  }, []);

  // 初始化加载 - 🚀 优化：移除追番更新检查，避免在播放页面进行不必要的API调用
  // 追番更新检查应该在专门的追番页面或首页进行，而不是在播放页面
  useEffect(() => {
    loadPlayRecords();
    // 注意：移除了追番更新检查逻辑，因为：
    // 1. 播放页面应该专注于播放功能
    // 2. 对所有历史记录调用 /api/detail 是没必要的
    // 3. 追番更新检查应该在用户真正需要时进行（如追番页面）
  }, []);

  // 🚀 渲染性能优化：使用useMemo缓存Context值，防止不必要的重新渲染
  const value: PlayPageContextType = useMemo(
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
    ]
  );

  return (
    <PlayPageContext.Provider value={value}>
      {children}
    </PlayPageContext.Provider>
  );
}
