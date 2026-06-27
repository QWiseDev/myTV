import { useEffect, useState } from 'react';

import { BangumiCalendarData } from '@/lib/bangumi.client';
import { scheduleIdleTask } from '@/lib/browser-scheduler';
import {
  createHomeDataSnapshot,
  createHomeLoadingState,
  mergeHomeData,
} from '@/lib/home-data-client';
import {
  loadCriticalData,
  loadHomeDataFromApi,
  loadSecondaryData,
  loadTertiaryData,
} from '@/lib/home-data-loader';
import { getHomeDataAvailability, hasHomeData, HomeData } from '@/lib/home-data-types';
import { DoubanItem } from '@/lib/types';
import { useWatchingUpdatesRefresh } from '@/hooks/useWatchingUpdatesRefresh';

interface UseHomeDataOptions {
  activeTab: 'home' | 'favorites';
  refreshWatchingUpdates: () => void;
  initialData?: HomeData;
}

const ignoreAsyncError = () => undefined;

function reportHomeDataError(message: string, error: unknown) {
  if (process.env.NODE_ENV !== 'production') {
    console.error(message, error);
  }
}

export function useHomeData({
  activeTab,
  refreshWatchingUpdates,
  initialData,
}: UseHomeDataOptions) {
  const initialLoadingState = createHomeLoadingState(initialData);
  const [hotMovies, setHotMovies] = useState<DoubanItem[]>(
    initialData?.hotMovies || [],
  );
  const [hotTvShows, setHotTvShows] = useState<DoubanItem[]>(
    initialData?.hotTvShows || [],
  );
  const [hotVarietyShows, setHotVarietyShows] = useState<DoubanItem[]>(
    initialData?.hotVarietyShows || [],
  );
  const [bangumiCalendarData, setBangumiCalendarData] = useState<
    BangumiCalendarData[]
  >(initialData?.bangumiCalendarData || []);

  const [criticalLoading, setCriticalLoading] = useState(
    initialLoadingState.criticalLoading,
  );
  const [secondaryLoading, setSecondaryLoading] = useState(
    initialLoadingState.secondaryLoading,
  );
  const [tertiaryLoading, setTertiaryLoading] = useState(
    initialLoadingState.tertiaryLoading,
  );

  const { scheduleWatchingUpdatesCheck } = useWatchingUpdatesRefresh({
    activeTab,
    refreshWatchingUpdates,
  });

  useEffect(() => {
    let cancelled = false;
    let cancelTertiaryLoad: (() => void) | undefined;

    const applyHomeData = (homeData: HomeData) => {
      if (cancelled) return;

      const availability = getHomeDataAvailability(homeData);
      setHotMovies(homeData.hotMovies);
      setHotTvShows(homeData.hotTvShows);
      setHotVarietyShows(homeData.hotVarietyShows);
      setBangumiCalendarData(homeData.bangumiCalendarData);

      if (availability.hasCriticalData) {
        setCriticalLoading(false);
      }
      if (availability.hasSecondaryData) {
        setSecondaryLoading(false);
      }
      if (availability.hasTertiaryData) {
        setTertiaryLoading(false);
      }
    };

    const loadMissingTertiaryData = () => {
      loadTertiaryData()
        .then((tertiaryData) => {
          if (cancelled) return;
          setBangumiCalendarData(tertiaryData.bangumiCalendarData || []);
        })
        .catch(ignoreAsyncError)
        .finally(() => {
          if (!cancelled) {
            setTertiaryLoading(false);
          }
        });
    };

    const scheduleTertiaryLoad = () => {
      cancelTertiaryLoad = scheduleIdleTask(loadMissingTertiaryData, {
        delayMs: 600,
        timeoutMs: 1500,
      });
    };

    const loadFallbackBatches = async (availability: {
      hasCriticalData: boolean;
      hasSecondaryData: boolean;
      hasTertiaryData: boolean;
    }) => {
      const loadingTasks: Promise<void>[] = [];

      if (!availability.hasCriticalData) {
        loadingTasks.push(
          loadCriticalData().then(async ({ hotMoviesPromise }) => {
            try {
              const moviesData = await hotMoviesPromise;
              if (!cancelled && moviesData?.code === 200) {
                setHotMovies(moviesData.list);
              }
            } finally {
              if (!cancelled) {
                setCriticalLoading(false);
              }
            }
          }),
        );
      }

      if (!availability.hasSecondaryData) {
        loadingTasks.push(
          loadSecondaryData().then((secondaryData) => {
            try {
              if (!cancelled && secondaryData.hotTvShows?.code === 200) {
                setHotTvShows(secondaryData.hotTvShows.list);
              }
              if (!cancelled && secondaryData.hotVarietyShows?.code === 200) {
                setHotVarietyShows(secondaryData.hotVarietyShows.list);
              }
            } finally {
              if (!cancelled) {
                setSecondaryLoading(false);
              }
            }
          }),
        );
      }

      if (!availability.hasTertiaryData) {
        scheduleTertiaryLoad();
      }

      await Promise.allSettled(loadingTasks);
    };

    const loadAllData = async () => {
      let homeData = createHomeDataSnapshot(initialData);
      let availability = getHomeDataAvailability(homeData);

      if (availability.isComplete) {
        scheduleWatchingUpdatesCheck();
        return;
      }

      try {
        const apiHomeData = await loadHomeDataFromApi();
        if (hasHomeData(apiHomeData)) {
          homeData = mergeHomeData(homeData, apiHomeData);
          applyHomeData(homeData);
          availability = getHomeDataAvailability(homeData);
        }
      } catch (error) {
        reportHomeDataError('首页聚合数据加载失败，回退分批加载:', error);
      }

      if (!availability.isComplete) {
        try {
          await loadFallbackBatches(availability);
        } catch (error) {
          reportHomeDataError('加载首页分批数据失败:', error);
        }
      }

      scheduleWatchingUpdatesCheck();
    };

    loadAllData();

    return () => {
      cancelled = true;
      cancelTertiaryLoad?.();
    };
  }, [initialData, scheduleWatchingUpdatesCheck]);

  return {
    hotMovies,
    hotTvShows,
    hotVarietyShows,
    bangumiCalendarData,
    criticalLoading,
    secondaryLoading,
    tertiaryLoading,
  };
}
