import { useCallback, useEffect, useRef, useState } from 'react';

import { scheduleIdleTask } from '@/lib/browser-scheduler';
import { DELAYS } from '@/lib/constants/home';
import {
  type HomeErrorState,
  type HomeLoadingState,
  type HomeSectionKey,
  createHomeDataSnapshot,
  createHomeErrorState,
  createHomeLoadingState,
  mergeHomeData,
  patchHomeData,
  patchHomeLoadingState,
} from '@/lib/home-data-client';
import {
  type HomeLoadResult,
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

type HomeSectionData = HomeData[keyof HomeData];
type HomeRetryRequest = {
  controller: AbortController;
  promise: Promise<void>;
};

const HOME_DATA_KEYS: Record<HomeSectionKey, keyof HomeData> = {
  critical: 'hotMovies',
  tertiary: 'bangumiCalendarData',
  tv: 'hotTvShows',
  variety: 'hotVarietyShows',
};

const HOME_LOADING_KEYS: Record<HomeSectionKey, keyof HomeLoadingState> = {
  critical: 'criticalLoading',
  tertiary: 'tertiaryLoading',
  tv: 'tvLoading',
  variety: 'varietyLoading',
};

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
  const [errors, setErrors] = useState<HomeErrorState>(() =>
    createHomeErrorState(),
  );
  const previousInitialDataRef = useRef(initialData);
  const loadGenerationRef = useRef(0);
  const retryRequestsRef = useRef<
    Partial<Record<HomeSectionKey, HomeRetryRequest>>
  >({});

  const { scheduleWatchingUpdatesCheck } = useWatchingUpdatesRefresh({
    activeTab,
    refreshWatchingUpdates,
  });

  const beginSectionLoad = useCallback((section: HomeSectionKey) => {
    const loadingKey = HOME_LOADING_KEYS[section];
    setLoading((current) =>
      patchHomeLoadingState(current, { [loadingKey]: true }),
    );
    setErrors((current) => ({ ...current, [section]: false }));
  }, []);

  const applySectionResult = useCallback(
    (
      section: HomeSectionKey,
      result: HomeLoadResult<HomeSectionData>,
      isCurrent: () => boolean,
    ) => {
      if (!isCurrent()) return;

      if (result.ok) {
        const dataKey = HOME_DATA_KEYS[section];
        setHomeData((current) =>
          patchHomeData(current, {
            [dataKey]: result.data,
          } as Partial<HomeData>),
        );
      }

      const loadingKey = HOME_LOADING_KEYS[section];
      setErrors((current) => ({ ...current, [section]: !result.ok }));
      setLoading((current) =>
        patchHomeLoadingState(current, { [loadingKey]: false }),
      );
    },
    [],
  );

  const loadSingleSection = useCallback(
    async (
      section: HomeSectionKey,
      signal: AbortSignal,
    ): Promise<HomeLoadResult<HomeSectionData>> => {
      if (section === 'critical') {
        return loadCriticalData(signal);
      }
      if (section === 'tertiary') {
        return loadTertiaryData(signal);
      }

      const secondaryData = await loadSecondaryData({
        loadTvShows: section === 'tv',
        loadVarietyShows: section === 'variety',
        signal,
      });
      const result =
        section === 'tv'
          ? secondaryData.hotTvShows
          : secondaryData.hotVarietyShows;

      return (
        result || {
          ok: false,
          error: new Error(`首页 ${section} loader 未返回结果`),
        }
      );
    },
    [],
  );

  const abortRetryRequests = useCallback(() => {
    Object.values(retryRequestsRef.current).forEach((request) =>
      request?.controller.abort(),
    );
    retryRequestsRef.current = {};
  }, []);

  const retrySection = useCallback(
    (section: HomeSectionKey): Promise<void> => {
      const existingRetry = retryRequestsRef.current[section];
      if (existingRetry) return existingRetry.promise;

      const controller = new AbortController();
      const generation = loadGenerationRef.current;
      beginSectionLoad(section);

      const isCurrent = () =>
        loadGenerationRef.current === generation && !controller.signal.aborted;
      const retryPromise = loadSingleSection(section, controller.signal)
        .then((result) => applySectionResult(section, result, isCurrent))
        .catch((error) =>
          applySectionResult(section, { ok: false, error }, isCurrent),
        )
        .finally(() => {
          if (retryRequestsRef.current[section]?.promise === retryPromise) {
            delete retryRequestsRef.current[section];
          }
        });

      retryRequestsRef.current[section] = {
        controller,
        promise: retryPromise,
      };
      return retryPromise;
    },
    [applySectionResult, beginSectionLoad, loadSingleSection],
  );

  useEffect(() => {
    const initialDataChanged = previousInitialDataRef.current !== initialData;
    previousInitialDataRef.current = initialData;

    const generation = ++loadGenerationRef.current;
    const controller = new AbortController();
    let cancelled = false;
    let cancelTertiaryLoad: (() => void) | undefined;
    let cancelWatchingUpdatesCheck: (() => void) | undefined;
    abortRetryRequests();

    const isCurrent = () =>
      !cancelled &&
      loadGenerationRef.current === generation &&
      !controller.signal.aborted;

    const applyHomeData = (nextData: HomeData) => {
      if (!isCurrent()) return;

      const availability = getHomeDataAvailability(nextData);
      setHomeData(nextData);
      setLoading((prev) =>
        patchHomeLoadingState(prev, {
          criticalLoading: availability.hasCriticalData
            ? false
            : prev.criticalLoading,
          tertiaryLoading: availability.hasTertiaryData
            ? false
            : prev.tertiaryLoading,
          tvLoading: availability.hasTvData ? false : prev.tvLoading,
          varietyLoading: availability.hasVarietyData
            ? false
            : prev.varietyLoading,
        }),
      );
      setErrors((current) => ({
        critical: availability.hasCriticalData ? false : current.critical,
        tertiary: availability.hasTertiaryData ? false : current.tertiary,
        tv: availability.hasTvData ? false : current.tv,
        variety: availability.hasVarietyData ? false : current.variety,
      }));
    };

    const loadMissingTertiaryData = () => {
      beginSectionLoad('tertiary');
      void loadTertiaryData(controller.signal)
        .then((result) => applySectionResult('tertiary', result, isCurrent))
        .catch((error) =>
          applySectionResult('tertiary', { ok: false, error }, isCurrent),
        );
    };

    const scheduleTertiaryLoad = () => {
      cancelTertiaryLoad = scheduleIdleTask(loadMissingTertiaryData, {
        delayMs: DELAYS.TERTIARY_LOAD,
        timeoutMs: DELAYS.TERTIARY_LOAD + 1500,
      });
    };

    const loadFallbackBatches = async (availability: {
      hasCriticalData: boolean;
      hasTertiaryData: boolean;
      hasTvData: boolean;
      hasVarietyData: boolean;
    }) => {
      const loadingTasks: Promise<void>[] = [];

      if (!availability.hasCriticalData) {
        beginSectionLoad('critical');
        loadingTasks.push(
          loadCriticalData(controller.signal)
            .then((result) => applySectionResult('critical', result, isCurrent))
            .catch((error) =>
              applySectionResult('critical', { ok: false, error }, isCurrent),
            ),
        );
      }

      if (!availability.hasTvData || !availability.hasVarietyData) {
        const loadTvShows = !availability.hasTvData;
        const loadVarietyShows = !availability.hasVarietyData;

        if (loadTvShows) beginSectionLoad('tv');
        if (loadVarietyShows) beginSectionLoad('variety');

        loadingTasks.push(
          loadSecondaryData({
            loadTvShows,
            loadVarietyShows,
            signal: controller.signal,
          })
            .then((secondaryData) => {
              if (loadTvShows) {
                applySectionResult(
                  'tv',
                  secondaryData.hotTvShows || {
                    ok: false,
                    error: new Error('首页 tv loader 未返回结果'),
                  },
                  isCurrent,
                );
              }
              if (loadVarietyShows) {
                applySectionResult(
                  'variety',
                  secondaryData.hotVarietyShows || {
                    ok: false,
                    error: new Error('首页 variety loader 未返回结果'),
                  },
                  isCurrent,
                );
              }
            })
            .catch((error) => {
              if (loadTvShows) {
                applySectionResult('tv', { ok: false, error }, isCurrent);
              }
              if (loadVarietyShows) {
                applySectionResult('variety', { ok: false, error }, isCurrent);
              }
            }),
        );
      }

      if (!availability.hasTertiaryData) {
        scheduleTertiaryLoad();
      }

      await Promise.all(loadingTasks);
    };

    const loadAllData = async () => {
      let snapshot = createHomeDataSnapshot(initialData);
      let availability = getHomeDataAvailability(snapshot);

      if (availability.isComplete) {
        if (initialDataChanged) {
          applyHomeData(snapshot);
        }
        cancelWatchingUpdatesCheck = scheduleWatchingUpdatesCheck();
        return;
      }

      if (!availability.hasCriticalData) {
        const apiHomeData = await loadHomeDataFromApi();
        if (cancelled) return;

        if (hasHomeData(apiHomeData)) {
          snapshot = mergeHomeData(snapshot, apiHomeData);
          applyHomeData(snapshot);
          availability = getHomeDataAvailability(snapshot);
        }
      } else {
        // 给 StrictMode cleanup 留出取消点，避免首轮 effect 启动重复分项请求
        await Promise.resolve();
      }

      if (cancelled) return;

      if (!availability.isComplete) {
        await loadFallbackBatches(availability);
      }

      if (cancelled) return;
      cancelWatchingUpdatesCheck = scheduleWatchingUpdatesCheck();
    };

    loadAllData();

    return () => {
      cancelled = true;
      controller.abort();
      if (loadGenerationRef.current === generation) {
        loadGenerationRef.current += 1;
      }
      abortRetryRequests();
      cancelTertiaryLoad?.();
      cancelWatchingUpdatesCheck?.();
    };
  }, [
    abortRetryRequests,
    applySectionResult,
    beginSectionLoad,
    initialData,
    scheduleWatchingUpdatesCheck,
  ]);

  return {
    errors,
    homeData,
    loading,
    retrySection,
  };
}
