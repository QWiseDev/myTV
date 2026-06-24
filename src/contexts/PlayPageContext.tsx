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

const INIT_REF_DEFAULT =
  typeof window !== 'undefined'
    ? { playRecords: false, watchingUpdates: false }
    : { playRecords: false, watchingUpdates: false };

// 开发环境日志：仅在非生产环境输出
function debugLog(...args: unknown[]) {
  if (process.env.NODE_ENV !== 'production') {
    console.log(...args);
  }
}

function debugError(...args: unknown[]) {
  if (process.env.NODE_ENV !== 'production') {
    console.error(...args);
  }
}

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
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 🔧 防重复初始化标记
  const initRef = useRef(INIT_REF_DEFAULT);

  // 加载播放记录（只取最近 60 条，避免全量）
  const loadPlayRecords = async () => {
    // 🔧 修复：移除防重复加载机制，允许页面重新访问时重新加载播放记录
    // 这样可以确保从其他页面返回播放页面时能正确恢复播放进度
    try {
      setLoadingPlayRecords(true);
      const { getRecentPlayRecords } = await import('@/lib/db.client');
      const records = await getRecentPlayRecords(60);
      setPlayRecords(records);
      initRef.current.playRecords = true;
      debugLog('✅ 播放记录加载完成');
    } catch (error) {
      debugError('加载播放记录失败:', error);
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
      debugLog('📦 观看更新已加载，跳过重复加载');
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
        debugLog('📦 从缓存获取观看更新');
      } else {
        debugLog('📦 暂无缓存的观看更新');
        setWatchingUpdates(null);
      }

      initRef.current.watchingUpdates = true;
      debugLog('✅ 观看更新加载完成');
    } catch (error) {
      debugError('加载观看更新失败:', error);
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

  // 初始化加载 - 🚀 优化：延迟非关键数据加载，让首屏先渲染
  // 播放记录和追更数据对首页而言在首屏可见区域下方（继续观看区块），无需阻塞首次渲染
  useEffect(() => {
    const idleCallback =
      typeof window !== 'undefined' &&
      'requestIdleCallback' in window
        ? (window as Window & { requestIdleCallback: (cb: IdleRequestCallback, opts?: IdleRequestOptions) => number }).requestIdleCallback
        : null;

    if (idleCallback) {
      idleCallback(() => loadPlayRecords(), { timeout: 1000 });
    } else {
      // 降级：用 setTimeout 延迟到首次渲染之后
      setTimeout(() => loadPlayRecords(), 200);
    }
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
