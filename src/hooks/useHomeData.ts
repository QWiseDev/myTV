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
  patchHomeLoadingState,
} from '@/lib/home-data-client';
import {
  type HomeLoadResult,
  loadCriticalData,
  loadSecondaryData,
  loadTertiaryData,
} from '@/lib/home-data-loader';
import { type HomeData, getHomeDataAvailability } from '@/lib/home-data-types';
import { useWatchingUpdatesRefresh } from '@/hooks/useWatchingUpdatesRefresh';

interface UseHomeDataOptions {
  activeTab: 'home' | 'favorites';
  refreshWatchingUpdates: () => void;
  initialData?: HomeData;
}

type HomeSectionDataMap = {
  critical: HomeData['hotMovies'];
  tertiary: HomeData['bangumiCalendarData'];
  tv: HomeData['hotTvShows'];
  variety: HomeData['hotVarietyShows'];
};
type HomeSectionConfigMap = {
  [Section in HomeSectionKey]: {
    applyData: (
      current: HomeData,
      data: HomeSectionDataMap[Section],
    ) => HomeData;
    loadingKey: keyof HomeLoadingState;
  };
};
type HomeRetryRequest = {
  controller: AbortController;
  promise: Promise<void>;
};

const HOME_SECTION_CONFIG: HomeSectionConfigMap = {
  critical: {
    applyData: (current, data) => ({ ...current, hotMovies: data }),
    loadingKey: 'criticalLoading',
  },
  tertiary: {
    applyData: (current, data) => ({ ...current, bangumiCalendarData: data }),
    loadingKey: 'tertiaryLoading',
  },
  tv: {
    applyData: (current, data) => ({ ...current, hotTvShows: data }),
    loadingKey: 'tvLoading',
  },
  variety: {
    applyData: (current, data) => ({ ...current, hotVarietyShows: data }),
    loadingKey: 'varietyLoading',
  },
};

function reconcileHomeData(current: HomeData, incoming: HomeData): HomeData {
  return {
    hotMovies: incoming.hotMovies.length
      ? incoming.hotMovies
      : current.hotMovies,
    hotTvShows: incoming.hotTvShows.length
      ? incoming.hotTvShows
      : current.hotTvShows,
    hotVarietyShows: incoming.hotVarietyShows.length
      ? incoming.hotVarietyShows
      : current.hotVarietyShows,
    bangumiCalendarData: incoming.bangumiCalendarData.length
      ? incoming.bangumiCalendarData
      : current.bangumiCalendarData,
  };
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
  const [errors, setErrors] = useState<HomeErrorState>(() =>
    createHomeErrorState(),
  );
  const homeDataRef = useRef(homeData);
  homeDataRef.current = homeData;
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
    const loadingKey = HOME_SECTION_CONFIG[section].loadingKey;
    setLoading((current) =>
      patchHomeLoadingState(current, { [loadingKey]: true }),
    );
    setErrors((current) => ({ ...current, [section]: false }));
  }, []);

  const applySectionResult = useCallback(
    <Section extends HomeSectionKey>(
      section: Section,
      result: HomeLoadResult<HomeSectionDataMap[Section]>,
      isCurrent: () => boolean,
    ) => {
      if (!isCurrent()) return;

      if (result.ok) {
        setHomeData((current) => {
          const nextData = HOME_SECTION_CONFIG[section].applyData(
            current,
            result.data,
          );
          homeDataRef.current = nextData;
          return nextData;
        });
      }

      const loadingKey = HOME_SECTION_CONFIG[section].loadingKey;
      setErrors((current) => ({ ...current, [section]: !result.ok }));
      setLoading((current) =>
        patchHomeLoadingState(current, { [loadingKey]: false }),
      );
    },
    [],
  );

  const executeSections = useCallback(
    async (
      sections: readonly HomeSectionKey[],
      signal: AbortSignal,
      isCurrent: () => boolean,
    ): Promise<void> => {
      const requestedSections = new Set(sections);
      requestedSections.forEach(beginSectionLoad);
      const loadingTasks: Promise<void>[] = [];

      const settleSection = <Section extends HomeSectionKey>(
        section: Section,
        load: () => Promise<HomeLoadResult<HomeSectionDataMap[Section]>>,
      ) =>
        load()
          .then((result) => applySectionResult(section, result, isCurrent))
          .catch((error) =>
            applySectionResult(section, { ok: false, error }, isCurrent),
          );

      if (requestedSections.has('critical')) {
        loadingTasks.push(
          settleSection('critical', () => loadCriticalData(signal)),
        );
      }

      if (requestedSections.has('tertiary')) {
        loadingTasks.push(
          settleSection('tertiary', () => loadTertiaryData(signal)),
        );
      }

      const loadTvShows = requestedSections.has('tv');
      const loadVarietyShows = requestedSections.has('variety');
      if (loadTvShows || loadVarietyShows) {
        loadingTasks.push(
          loadSecondaryData({
            loadTvShows,
            loadVarietyShows,
            signal,
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

      await Promise.all(loadingTasks);
    },
    [applySectionResult, beginSectionLoad],
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

      const isCurrent = () =>
        loadGenerationRef.current === generation && !controller.signal.aborted;
      const retryPromise = executeSections(
        [section],
        controller.signal,
        isCurrent,
      ).finally(() => {
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
    [executeSections],
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
      homeDataRef.current = nextData;
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

    const scheduleTertiaryLoad = () => {
      cancelTertiaryLoad = scheduleIdleTask(
        () => {
          void executeSections(['tertiary'], controller.signal, isCurrent);
        },
        {
          delayMs: DELAYS.TERTIARY_LOAD,
          timeoutMs: DELAYS.TERTIARY_LOAD + 1500,
        },
      );
    };

    const loadFallbackBatches = async (availability: {
      hasCriticalData: boolean;
      hasTertiaryData: boolean;
      hasTvData: boolean;
      hasVarietyData: boolean;
    }) => {
      const immediateSections: HomeSectionKey[] = [];

      if (!availability.hasCriticalData) {
        immediateSections.push('critical');
      }

      if (!availability.hasTvData) {
        immediateSections.push('tv');
      }
      if (!availability.hasVarietyData) {
        immediateSections.push('variety');
      }

      if (!availability.hasTertiaryData) {
        scheduleTertiaryLoad();
      }

      await executeSections(immediateSections, controller.signal, isCurrent);
    };

    const loadAllData = async () => {
      const incomingSnapshot = createHomeDataSnapshot(initialData);
      const snapshot = initialDataChanged
        ? reconcileHomeData(homeDataRef.current, incomingSnapshot)
        : homeDataRef.current;
      const availability = getHomeDataAvailability(snapshot);

      if (initialDataChanged) {
        applyHomeData(snapshot);
      }

      if (availability.isComplete) {
        cancelWatchingUpdatesCheck = scheduleWatchingUpdatesCheck();
        return;
      }

      // 给 StrictMode cleanup 留出取消点，避免首轮 effect 启动重复分项请求
      await Promise.resolve();

      if (cancelled) return;
      cancelWatchingUpdatesCheck = scheduleWatchingUpdatesCheck();
      await loadFallbackBatches(availability);
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
    executeSections,
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
