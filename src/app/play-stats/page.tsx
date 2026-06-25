'use client';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import { logAccess } from '@/lib/access-log';
import { getAuthInfoFromBrowserCookie } from '@/lib/auth';
import { PlayRecord, ReleaseCalendarItem } from '@/lib/types';
import {
  type WatchingUpdate,
  checkWatchingUpdates,
  forceClearWatchingUpdatesCache,
  getCachedWatchingUpdates,
  getDetailedWatchingUpdates,
} from '@/lib/watching-updates';

import PageLayout from '@/components/PageLayout';

import { PlayStatsResult } from '@/app/api/admin/play-stats/route';

const SectionSkeleton = () => (
  <div className='rounded-xl border border-dashed border-gray-200 dark:border-gray-700 bg-white/60 dark:bg-gray-800/40 p-6 text-center text-sm text-gray-500 dark:text-gray-400'>
    <div className='animate-pulse'>模块加载中...</div>
  </div>
);

const AdminStatsPanel = dynamic(() => import('./_components/AdminStatsPanel'), {
  loading: () => <SectionSkeleton />,
  ssr: false,
});

const PersonalStatsPanel = dynamic(
  () => import('./_components/PersonalStatsPanel'),
  {
    loading: () => <SectionSkeleton />,
    ssr: false,
  }
);

const LocalStorageNotice = dynamic(
  () => import('./_components/LocalStorageNotice'),
  {
    loading: () => <SectionSkeleton />,
    ssr: false,
  }
);

const PlayStatsPage = () => {
  const router = useRouter();
  const [statsData, setStatsData] = useState<PlayStatsResult | null>(null);

  // 📊 记录播放统计页面访问 (必须在组件顶层调用)
  useEffect(() => {
    logAccess('play_stats_page', {
      loadTime: Date.now(),
    });
  }, []); // 只在组件挂载时记录一次
  const [userStats, setUserStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set());
  const [authInfo, setAuthInfo] = useState<{
    username?: string;
    role?: string;
  } | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [watchingUpdates, setWatchingUpdates] = useState<WatchingUpdate | null>(
    null
  );
  const [activeTab, setActiveTab] = useState<'admin' | 'personal'>('admin');
  const [upcomingReleases, setUpcomingReleases] = useState<
    ReleaseCalendarItem[]
  >([]);
  const [upcomingLoading, setUpcomingLoading] = useState(false);
  const [upcomingInitialized, setUpcomingInitialized] = useState(false);

  // 🔧 防抖机制：防止 watch-update 检查重复调用
  const checkTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isCheckingRef = useRef(false);

  const safeCheckWatchingUpdates = useCallback((force = false) => {
    // 如果正在检查中，等待检查完成
    if (isCheckingRef.current) {
      return;
    }

    // 清除之前的定时器
    if (checkTimeoutRef.current) {
      clearTimeout(checkTimeoutRef.current);
    }

    // 设置防抖延迟
    const debounceDelay = force ? 0 : 300; // 强制刷新不延迟，普通检查延迟300ms

    checkTimeoutRef.current = setTimeout(async () => {
      if (isCheckingRef.current) {
        return;
      }

      try {
        isCheckingRef.current = true;
        await checkWatchingUpdates(force);
        const details = getDetailedWatchingUpdates();
        setWatchingUpdates(details);
      } catch (error) {
        console.error('watching-update 检查失败:', error);
      } finally {
        isCheckingRef.current = false;
      }
    }, debounceDelay);
  }, []);

  const fetchAdminStats = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/play-stats');

      if (response.status === 401) {
        router.push('/login');
        return;
      }

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data = await response.json();
      setStatsData(data);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : '获取播放统计失败';
      setError(errorMessage);
    }
  }, [router]);

  const fetchUserStats = useCallback(async () => {
    try {
      const response = await fetch('/api/user/my-stats');

      if (response.status === 401) {
        router.push('/login');
        return;
      }

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data = await response.json();
      setUserStats(data);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : '获取个人统计失败';
      setError(errorMessage);
    }
  }, [router]);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      if (isAdmin) {
        await Promise.all([fetchAdminStats(), fetchUserStats()]);
      } else {
        await fetchUserStats();
      }
    } finally {
      setLoading(false);
    }
  }, [isAdmin, fetchAdminStats, fetchUserStats]);

  const cleanExpiredCache = useCallback(() => {
    const CACHE_DURATION = 2 * 60 * 60 * 1000;
    const now = Date.now();

    const cacheTimeKey = 'upcoming_releases_cache_time';
    const cachedTime = localStorage.getItem(cacheTimeKey);

    if (cachedTime) {
      const age = now - parseInt(cachedTime);
      if (age >= CACHE_DURATION) {
        localStorage.removeItem('upcoming_releases_cache');
        localStorage.removeItem(cacheTimeKey);
      }
    }

    const keysToCheck = [
      'moontv_watching_updates',
      'moontv_last_update_check',
      'release_calendar_all_data',
      'release_calendar_all_data_time',
    ];

    const watchingUpdateTime = localStorage.getItem('moontv_last_update_check');
    if (watchingUpdateTime) {
      const WATCHING_CACHE_DURATION = 30 * 60 * 1000;
      const age = now - parseInt(watchingUpdateTime);
      if (age >= WATCHING_CACHE_DURATION) {
        localStorage.removeItem('moontv_watching_updates');
        localStorage.removeItem('moontv_last_update_check');
      }
    }

    keysToCheck.forEach((key) => {
      if (key.endsWith('_time')) {
        const timeStr = localStorage.getItem(key);
        if (timeStr) {
          const age = now - parseInt(timeStr);
          if (age >= CACHE_DURATION) {
            const dataKey = key.replace('_time', '');
            localStorage.removeItem(dataKey);
            localStorage.removeItem(key);
          }
        }
      }
    });
  }, []);

  const fetchUpcomingReleases = useCallback(async () => {
    try {
      setUpcomingLoading(true);
      cleanExpiredCache();

      const today = new Date();
      const twoWeeks = new Date(today);
      twoWeeks.setDate(today.getDate() + 14);

      const response = await fetch(
        `/api/release-calendar?dateFrom=${
          today.toISOString().split('T')[0]
        }&dateTo=${twoWeeks.toISOString().split('T')[0]}`
      );

      if (response.ok) {
        const data = await response.json();
        setUpcomingReleases(data.items || []);
      } else {
        setUpcomingReleases([]);
      }
    } catch (error) {
      setUpcomingReleases([]);
    } finally {
      setUpcomingLoading(false);
      setUpcomingInitialized(true);
    }
  }, [cleanExpiredCache]);

  const handleRefreshClick = useCallback(async () => {
    setLoading(true);
    try {
      localStorage.removeItem('moontv_watching_updates');
      localStorage.removeItem('moontv_last_update_check');
      localStorage.removeItem('upcoming_releases_cache');
      localStorage.removeItem('upcoming_releases_cache_time');

      safeCheckWatchingUpdates(true);
      await fetchStats();
      const details = getDetailedWatchingUpdates();
      setWatchingUpdates(details);
      await fetchUpcomingReleases();
    } catch (error) {
      console.error('刷新数据失败:', error);
    } finally {
      setLoading(false);
    }
  }, [fetchStats, fetchUpcomingReleases]);

  const toggleUserExpanded = useCallback((username: string) => {
    setExpandedUsers((prev) => {
      const next = new Set(prev);
      if (next.has(username)) {
        next.delete(username);
      } else {
        next.add(username);
      }
      return next;
    });
  }, []);

  const handlePlayRecord = useCallback(
    (record: PlayRecord) => {
      const searchTitle = record.search_title || record.title;
      const params = new URLSearchParams({
        title: record.title,
        year: record.year,
        stitle: searchTitle,
        stype: record.total_episodes > 1 ? 'tv' : 'movie',
      });

      router.push(`/play?${params.toString()}`);
    },
    [router]
  );

  const navigateToReleaseCalendar = useCallback(() => {
    router.push('/release-calendar');
  }, [router]);

  const storageType =
    typeof window !== 'undefined' &&
    (window as any).RUNTIME_CONFIG?.STORAGE_TYPE
      ? (window as any).RUNTIME_CONFIG.STORAGE_TYPE
      : 'localstorage';

  useEffect(() => {
    const auth = getAuthInfoFromBrowserCookie();
    if (!auth || !auth.username) {
      router.push('/login');
      return;
    }

    
    setAuthInfo(auth);
    setIsAdmin(auth.role === 'admin' || auth.role === 'owner');
  }, [router, storageType]);

  useEffect(() => {
    if (authInfo) {
      fetchStats();
    }
  }, [authInfo, fetchStats]);

  useEffect(() => {
    if (authInfo) {
      fetchUpcomingReleases();
    }
  }, [authInfo, fetchUpcomingReleases]);

  useEffect(() => {
    if (authInfo) {
      const cached = getCachedWatchingUpdates();
      if (cached) {
        const details = getDetailedWatchingUpdates();
        setWatchingUpdates(details);
      } else {
        safeCheckWatchingUpdates();
      }

      const handlePlayRecordsUpdate = () => {
        forceClearWatchingUpdatesCache();
        safeCheckWatchingUpdates(true);
      };

      window.addEventListener('playRecordsUpdated', handlePlayRecordsUpdate);
      return () => {
        window.removeEventListener(
          'playRecordsUpdated',
          handlePlayRecordsUpdate
        );
        // 清理防抖定时器
        if (checkTimeoutRef.current) {
          clearTimeout(checkTimeoutRef.current);
        }
      };
    }
    return undefined;
  }, [authInfo, safeCheckWatchingUpdates]);

  useEffect(() => {
    const getScrollTop = () =>
      document.body.scrollTop || document.documentElement.scrollTop || 0;

    const handleScroll = () => {
      const scrollTop = getScrollTop();
      setShowBackToTop(scrollTop > 300);
    };

    document.body.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      document.body.removeEventListener('scroll', handleScroll);
    };
  }, []);

  const scrollToTop = useCallback(() => {
    try {
      document.body.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      document.body.scrollTop = 0;
    }
  }, []);

  if (!authInfo) {
    return (
      <PageLayout activePath='/play-stats'>
        <div className='text-center py-12'>
          <div className='inline-flex items-center space-x-2 text-gray-600 dark:text-gray-400'>
            <svg
              className='w-6 h-6 animate-spin'
              fill='none'
              stroke='currentColor'
              viewBox='0 0 24 24'
            >
              <path
                strokeLinecap='round'
                strokeLinejoin='round'
                strokeWidth='2'
                d='M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15'
              />
            </svg>
            <span>检查权限中...</span>
          </div>
        </div>
      </PageLayout>
    );
  }

  if (loading) {
    return (
      <PageLayout activePath='/play-stats'>
        <div className='text-center py-12'>
          <div className='inline-flex items-center space-x-2 text-gray-600 dark:text-gray-400'>
            <svg
              className='w-6 h-6 animate-spin'
              fill='none'
              stroke='currentColor'
              viewBox='0 0 24 24'
            >
              <path
                strokeLinecap='round'
                strokeLinejoin='round'
                strokeWidth='2'
                d='M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15'
              />
            </svg>
            <span>正在加载{isAdmin ? '播放统计' : '个人统计'}...</span>
          </div>
        </div>
      </PageLayout>
    );
  }

  if (storageType === 'localstorage') {
    return (
      <PageLayout activePath='/play-stats'>
        <LocalStorageNotice isAdmin={isAdmin} />
      </PageLayout>
    );
  }

  if (isAdmin && statsData && userStats) {
    return (
      <PageLayout activePath='/play-stats'>
        <AdminStatsPanel
          activeTab={activeTab}
          onTabChange={setActiveTab}
          onRefresh={handleRefreshClick}
          loading={loading}
          error={error}
          statsData={statsData}
          userStats={userStats}
          watchingUpdates={watchingUpdates}
          expandedUsers={expandedUsers}
          toggleUserExpanded={toggleUserExpanded}
          handlePlayRecord={handlePlayRecord}
          upcomingReleases={upcomingReleases}
          upcomingLoading={upcomingLoading}
          upcomingInitialized={upcomingInitialized}
          onNavigateReleaseCalendar={navigateToReleaseCalendar}
          showBackToTop={showBackToTop}
          scrollToTop={scrollToTop}
        />
      </PageLayout>
    );
  }

  if (!isAdmin && userStats) {
    return (
      <PageLayout activePath='/play-stats'>
        <PersonalStatsPanel
          userStats={userStats}
          loading={loading}
          error={error}
          onRefresh={handleRefreshClick}
          watchingUpdates={watchingUpdates}
          upcomingReleases={upcomingReleases}
          upcomingLoading={upcomingLoading}
          upcomingInitialized={upcomingInitialized}
          onNavigateReleaseCalendar={navigateToReleaseCalendar}
          handlePlayRecord={handlePlayRecord}
          showBackToTop={showBackToTop}
          scrollToTop={scrollToTop}
        />
      </PageLayout>
    );
  }

  return (
    <PageLayout activePath='/play-stats'>
      <div className='text-center py-12 text-gray-600 dark:text-gray-400'>
        暂无可显示的数据
      </div>
    </PageLayout>
  );
};

export default PlayStatsPage;
