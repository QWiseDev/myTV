import { useEffect, useState } from 'react';

import { scheduleIdleTask } from '@/lib/browser-scheduler';
import { DELAYS } from '@/lib/constants/home';
import {
  type HomeLoadingState,
  createHomeDataSnapshot,
  createHomeLoadingState,
  mergeHomeData,
  patchHomeData,
  patchHomeLoadingState,
} from '@/lib/home-data-client';
import {
  loadCriticalData,
  loadHomeDataFromApi,
  loadSecondaryData,
  loadTertiaryData,
} from '@/lib/home-data-loader';
import {
  type HomeData,
  getHomeDataAvailability,
  hasHomeData,
} from '@/lib/home-data-types';
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
  const [homeData, setHomeData] = useState<HomeData>(() =>
    createHomeDataSnapshot(initialData),
  );
  const [loading, setLoading] = useState<HomeLoadingState>(() =>
    createHomeLoadingState(initialData),
  );

  const { scheduleWatchingUpdatesCheck } = useWatchingUpdatesRefresh({
    activeTab,
    refreshWatchingUpdates,
  });

  useEffect(() => {
    let cancelled = false;
    let cancelTertiaryLoad: (() => void) | undefined;

    const applyHomeData = (nextData: HomeData) => {
      if (cancelled) return;

      const availability = getHomeDataAvailability(nextData);
      setHomeData(nextData);
      setLoading((prev) =>
        patchHomeLoadingState(prev, {
          criticalLoading: availability.hasCriticalData
            ? false
            : prev.criticalLoading,
          secondaryLoading: availability.hasSecondaryData
            ? false
            : prev.secondaryLoading,
          tertiaryLoading: availability.hasTertiaryData
            ? false
            : prev.tertiaryLoading,
        }),
      );
    };

    const loadMissingTertiaryData = () => {
      loadTertiaryData()
        .then((tertiaryData) => {
          if (cancelled) return;
          setHomeData((prev) =>
            patchHomeData(prev, {
              bangumiCalendarData: tertiaryData.bangumiCalendarData || [],
            }),
          );
        })
        .catch(ignoreAsyncError)
        .finally(() => {
          if (!cancelled) {
            setLoading((prev) =>
              patchHomeLoadingState(prev, { tertiaryLoading: false }),
            );
          }
        });
    };

    const scheduleTertiaryLoad = () => {
      cancelTertiaryLoad = scheduleIdleTask(loadMissingTertiaryData, {
        delayMs: DELAYS.TERTIARY_LOAD,
        timeoutMs: DELAYS.TERTIARY_LOAD + 1500,
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
                setHomeData((prev) =>
                  patchHomeData(prev, { hotMovies: moviesData.list }),
                );
              }
            } finally {
              if (!cancelled) {
                setLoading((prev) =>
                  patchHomeLoadingState(prev, { criticalLoading: false }),
                );
              }
            }
          }),
        );
      }

      if (!availability.hasSecondaryData) {
        loadingTasks.push(
          loadSecondaryData().then((secondaryData) => {
            try {
              if (!cancelled) {
                setHomeData((prev) =>
                  patchHomeData(prev, {
                    hotTvShows:
                      secondaryData.hotTvShows?.code === 200
                        ? secondaryData.hotTvShows.list
                        : undefined,
                    hotVarietyShows:
                      secondaryData.hotVarietyShows?.code === 200
                        ? secondaryData.hotVarietyShows.list
                        : undefined,
                  }),
                );
              }
            } finally {
              if (!cancelled) {
                setLoading((prev) =>
                  patchHomeLoadingState(prev, { secondaryLoading: false }),
                );
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
      let snapshot = createHomeDataSnapshot(initialData);
      let availability = getHomeDataAvailability(snapshot);

      if (availability.isComplete) {
        scheduleWatchingUpdatesCheck();
        return;
      }

      try {
        const apiHomeData = await loadHomeDataFromApi();
        if (hasHomeData(apiHomeData)) {
          snapshot = mergeHomeData(snapshot, apiHomeData);
          applyHomeData(snapshot);
          availability = getHomeDataAvailability(snapshot);
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
    homeData,
    loading,
  };
}
