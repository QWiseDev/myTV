import { act, renderHook, waitFor } from '@testing-library/react';
import { type ReactNode, createElement, StrictMode } from 'react';

import { type HomeData, EMPTY_HOME_DATA } from '@/lib/home-data-types';

const mockLoadCriticalData = jest.fn();
const mockLoadHomeDataFromApi = jest.fn();
const mockLoadSecondaryData = jest.fn();
const mockLoadTertiaryData = jest.fn();
const mockCancelWatchingUpdatesCheck = jest.fn();
const mockScheduleWatchingUpdatesCheck = jest.fn();

jest.mock('@/lib/home-data-loader', () => ({
  loadCriticalData: mockLoadCriticalData,
  loadHomeDataFromApi: mockLoadHomeDataFromApi,
  loadSecondaryData: mockLoadSecondaryData,
  loadTertiaryData: mockLoadTertiaryData,
}));

jest.mock('@/hooks/useWatchingUpdatesRefresh', () => ({
  useWatchingUpdatesRefresh: () => ({
    scheduleWatchingUpdatesCheck: mockScheduleWatchingUpdatesCheck,
  }),
}));

let useHomeData: typeof import('./useHomeData').useHomeData;

const item = {
  id: '1',
  title: '测试影片',
  poster: '',
  rate: '',
  year: '2026',
};

const bangumiDay = {
  weekday: { en: 'Mon', cn: '周一', ja: '月' },
  items: [],
};

function createCompleteHomeData(suffix: string) {
  return {
    hotMovies: [{ ...item, id: `movie-${suffix}` }],
    hotTvShows: [{ ...item, id: `tv-${suffix}` }],
    hotVarietyShows: [{ ...item, id: `show-${suffix}` }],
    bangumiCalendarData: [bangumiDay],
  };
}

const completeInitialData = createCompleteHomeData('initial');

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function renderHomeDataHook(initialData: HomeData) {
  const refreshWatchingUpdates = jest.fn();

  return renderHook(
    ({ initialData }: { initialData: HomeData }) =>
      useHomeData({
        activeTab: 'home',
        refreshWatchingUpdates,
        initialData,
      }),
    { initialProps: { initialData } },
  );
}

describe('useHomeData', () => {
  beforeAll(async () => {
    useHomeData = (await import('./useHomeData')).useHomeData;
  });

  beforeEach(() => {
    mockLoadCriticalData.mockReset();
    mockLoadHomeDataFromApi.mockReset();
    mockLoadSecondaryData.mockReset();
    mockLoadTertiaryData.mockReset();
    mockLoadCriticalData.mockResolvedValue({ ok: true, data: [] });
    mockLoadSecondaryData.mockResolvedValue({
      hotTvShows: { ok: true, data: [] },
      hotVarietyShows: { ok: true, data: [] },
    });
    mockLoadTertiaryData.mockResolvedValue({ ok: true, data: [] });
    mockCancelWatchingUpdatesCheck.mockReset();
    mockScheduleWatchingUpdatesCheck.mockReset();
    mockScheduleWatchingUpdatesCheck.mockReturnValue(
      mockCancelWatchingUpdatesCheck,
    );
    mockLoadHomeDataFromApi.mockResolvedValue(EMPTY_HOME_DATA);
  });

  it('cancels a scheduled watching update check on unmount', () => {
    const { unmount } = renderHook(() =>
      useHomeData({
        activeTab: 'home',
        refreshWatchingUpdates: jest.fn(),
        initialData: completeInitialData,
      }),
    );

    expect(mockScheduleWatchingUpdatesCheck).toHaveBeenCalledTimes(1);

    unmount();

    expect(mockCancelWatchingUpdatesCheck).toHaveBeenCalledTimes(1);
  });

  it('cancels the StrictMode setup before keeping the live scheduled check', () => {
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(StrictMode, null, children);

    const { unmount } = renderHook(
      () =>
        useHomeData({
          activeTab: 'home',
          refreshWatchingUpdates: jest.fn(),
          initialData: completeInitialData,
        }),
      { wrapper },
    );

    expect(mockScheduleWatchingUpdatesCheck).toHaveBeenCalledTimes(2);
    expect(mockCancelWatchingUpdatesCheck).toHaveBeenCalledTimes(1);

    unmount();

    expect(mockCancelWatchingUpdatesCheck).toHaveBeenCalledTimes(2);
  });

  it('syncs a new complete initial snapshot into existing state', () => {
    const refreshedInitialData = createCompleteHomeData('refreshed');
    const { result, rerender } = renderHomeDataHook(completeInitialData);

    rerender({ initialData: refreshedInitialData });

    expect(result.current.homeData).toEqual(refreshedInitialData);
    expect(result.current.loading).toEqual({
      criticalLoading: false,
      tertiaryLoading: false,
      tvLoading: false,
      varietyLoading: false,
    });
    expect(mockLoadHomeDataFromApi).not.toHaveBeenCalled();
    expect(mockLoadCriticalData).not.toHaveBeenCalled();
    expect(mockLoadSecondaryData).not.toHaveBeenCalled();
    expect(mockLoadTertiaryData).not.toHaveBeenCalled();
  });

  it('does not let an older aggregate response overwrite a new complete snapshot', async () => {
    const staleApiData = createCompleteHomeData('stale-api');
    const refreshedInitialData = createCompleteHomeData('refreshed');
    const deferredApi = createDeferred<typeof staleApiData>();
    mockLoadHomeDataFromApi.mockReturnValue(deferredApi.promise);
    const { result, rerender } = renderHomeDataHook(EMPTY_HOME_DATA);

    await waitFor(() => {
      expect(mockLoadHomeDataFromApi).toHaveBeenCalledTimes(1);
    });

    rerender({ initialData: refreshedInitialData });

    await act(async () => {
      deferredApi.resolve(staleApiData);
      await deferredApi.promise;
    });

    expect(result.current.homeData).toEqual(refreshedInitialData);
    expect(mockLoadCriticalData).not.toHaveBeenCalled();
    expect(mockLoadSecondaryData).not.toHaveBeenCalled();
    expect(mockLoadTertiaryData).not.toHaveBeenCalled();
  });

  it('does not let an older secondary response overwrite a new complete snapshot', async () => {
    const staleSecondaryData = {
      hotTvShows: { ok: true, data: [{ ...item, id: 'tv-stale' }] },
      hotVarietyShows: {
        ok: true,
        data: [{ ...item, id: 'show-stale' }],
      },
    };
    const deferredSecondary = createDeferred<typeof staleSecondaryData>();
    mockLoadSecondaryData.mockReturnValue(deferredSecondary.promise);
    const partialInitialData: HomeData = {
      hotMovies: [item],
      hotTvShows: [],
      hotVarietyShows: [],
      bangumiCalendarData: [bangumiDay],
    };
    const refreshedInitialData = createCompleteHomeData('refreshed');
    const { result, rerender } = renderHomeDataHook(partialInitialData);

    await waitFor(() => {
      expect(mockLoadSecondaryData).toHaveBeenCalledTimes(1);
    });

    rerender({ initialData: refreshedInitialData });

    await act(async () => {
      deferredSecondary.resolve(staleSecondaryData);
      await deferredSecondary.promise;
    });

    expect(result.current.homeData).toEqual(refreshedInitialData);
    expect(mockLoadHomeDataFromApi).not.toHaveBeenCalled();
    expect(mockLoadCriticalData).not.toHaveBeenCalled();
    expect(mockLoadTertiaryData).not.toHaveBeenCalled();
  });

  it('loads only the missing variety section and preserves existing TV data', async () => {
    mockLoadSecondaryData.mockResolvedValue({
      hotTvShows: undefined,
      hotVarietyShows: { ok: true, data: [] },
    });
    const initialData = {
      hotMovies: [item],
      hotTvShows: [{ ...item, id: 'tv-existing' }],
      hotVarietyShows: [],
      bangumiCalendarData: [bangumiDay],
    };
    const refreshWatchingUpdates = jest.fn();

    const { result } = renderHook(() =>
      useHomeData({
        activeTab: 'home',
        refreshWatchingUpdates,
        initialData,
      }),
    );

    expect(result.current.loading).toEqual({
      criticalLoading: false,
      tertiaryLoading: false,
      tvLoading: false,
      varietyLoading: true,
    });

    await waitFor(() => {
      expect(mockLoadSecondaryData).toHaveBeenCalledWith({
        loadTvShows: false,
        loadVarietyShows: true,
        signal: expect.any(AbortSignal),
      });
      expect(result.current.homeData.hotTvShows).toEqual([
        { ...item, id: 'tv-existing' },
      ]);
      expect(result.current.loading.tvLoading).toBe(false);
      expect(result.current.loading.varietyLoading).toBe(false);
    });
  });

  it('loads missing batches directly when SSR already provides critical movies', async () => {
    const secondaryData = {
      hotTvShows: { ok: true, data: [{ ...item, id: 'tv-direct' }] },
      hotVarietyShows: {
        ok: true,
        data: [{ ...item, id: 'show-direct' }],
      },
    };
    const deferredSecondary = createDeferred<typeof secondaryData>();
    mockLoadSecondaryData.mockReturnValue(deferredSecondary.promise);
    const initialData = {
      hotMovies: [item],
      hotTvShows: [],
      hotVarietyShows: [],
      bangumiCalendarData: [],
    };

    const { result } = renderHook(() =>
      useHomeData({
        activeTab: 'home',
        refreshWatchingUpdates: jest.fn(),
        initialData,
      }),
    );

    expect(result.current.homeData.hotMovies).toEqual([item]);
    expect(result.current.loading).toEqual({
      criticalLoading: false,
      tertiaryLoading: true,
      tvLoading: true,
      varietyLoading: true,
    });

    await waitFor(() => {
      expect(mockLoadSecondaryData).toHaveBeenCalledWith({
        loadTvShows: true,
        loadVarietyShows: true,
        signal: expect.any(AbortSignal),
      });
    });
    expect(mockLoadHomeDataFromApi).not.toHaveBeenCalled();

    await act(async () => {
      deferredSecondary.resolve(secondaryData);
      await deferredSecondary.promise;
    });

    await waitFor(() => {
      expect(result.current.homeData.hotMovies).toEqual([item]);
      expect(result.current.homeData.hotTvShows).toEqual(
        secondaryData.hotTvShows.data,
      );
      expect(result.current.homeData.hotVarietyShows).toEqual(
        secondaryData.hotVarietyShows.data,
      );
      expect(result.current.loading.tvLoading).toBe(false);
      expect(result.current.loading.varietyLoading).toBe(false);
    });
    expect(mockLoadCriticalData).not.toHaveBeenCalled();
    expect(mockLoadTertiaryData).not.toHaveBeenCalled();
  });

  it('keeps the aggregate loader as the fallback for an empty initial snapshot', async () => {
    const apiData = {
      hotMovies: [item],
      hotTvShows: [{ ...item, id: 'tv-api' }],
      hotVarietyShows: [{ ...item, id: 'show-api' }],
      bangumiCalendarData: [bangumiDay],
    };
    const deferredApi = createDeferred<typeof apiData>();
    mockLoadHomeDataFromApi.mockReturnValue(deferredApi.promise);

    const { result } = renderHook(() =>
      useHomeData({
        activeTab: 'home',
        refreshWatchingUpdates: jest.fn(),
        initialData: EMPTY_HOME_DATA,
      }),
    );

    await waitFor(() => {
      expect(mockLoadHomeDataFromApi).toHaveBeenCalledTimes(1);
    });
    expect(mockLoadCriticalData).not.toHaveBeenCalled();
    expect(mockLoadSecondaryData).not.toHaveBeenCalled();

    await act(async () => {
      deferredApi.resolve(apiData);
      await deferredApi.promise;
    });

    await waitFor(() => {
      expect(result.current.homeData).toEqual(apiData);
      expect(result.current.loading).toEqual({
        criticalLoading: false,
        tertiaryLoading: false,
        tvLoading: false,
        varietyLoading: false,
      });
    });
    expect(mockLoadCriticalData).not.toHaveBeenCalled();
    expect(mockLoadSecondaryData).not.toHaveBeenCalled();
    expect(mockLoadTertiaryData).not.toHaveBeenCalled();
  });

  it('does not start fallback work from a cancelled StrictMode effect', async () => {
    mockLoadSecondaryData.mockResolvedValue({
      hotTvShows: { ok: true, data: [] },
      hotVarietyShows: { ok: true, data: [] },
    });
    const initialData = {
      hotMovies: [item],
      hotTvShows: [],
      hotVarietyShows: [],
      bangumiCalendarData: [bangumiDay],
    };
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(StrictMode, null, children);

    renderHook(
      () =>
        useHomeData({
          activeTab: 'home',
          refreshWatchingUpdates: jest.fn(),
          initialData,
        }),
      { wrapper },
    );

    await waitFor(() => {
      expect(mockLoadSecondaryData).toHaveBeenCalledTimes(1);
      expect(mockScheduleWatchingUpdatesCheck).toHaveBeenCalledTimes(1);
    });
    expect(mockLoadHomeDataFromApi).not.toHaveBeenCalled();
  });

  it('keeps sibling data and exposes only the failed secondary section', async () => {
    mockLoadSecondaryData.mockResolvedValue({
      hotTvShows: { ok: false, error: new Error('tv failed') },
      hotVarietyShows: {
        ok: true,
        data: [{ ...item, id: 'show-success' }],
      },
    });
    const initialData = {
      hotMovies: [item],
      hotTvShows: [],
      hotVarietyShows: [],
      bangumiCalendarData: [bangumiDay],
    };
    const { result } = renderHomeDataHook(initialData);

    await waitFor(() => {
      expect(result.current.loading.tvLoading).toBe(false);
      expect(result.current.loading.varietyLoading).toBe(false);
    });

    expect(result.current.homeData.hotTvShows).toEqual([]);
    expect(result.current.homeData.hotVarietyShows).toEqual([
      { ...item, id: 'show-success' },
    ]);
    expect(result.current.errors).toEqual({
      critical: false,
      tertiary: false,
      tv: true,
      variety: false,
    });
  });

  it('preserves existing data when a section retry fails, then replaces it on success', async () => {
    const refreshedMovie = { ...item, id: 'movie-refreshed' };
    mockLoadCriticalData
      .mockResolvedValueOnce({
        ok: false,
        error: new Error('movie failed'),
      })
      .mockResolvedValueOnce({ ok: true, data: [refreshedMovie] });
    const { result } = renderHomeDataHook(completeInitialData);

    await act(async () => {
      await result.current.retrySection('critical');
    });

    expect(result.current.homeData.hotMovies).toEqual(
      completeInitialData.hotMovies,
    );
    expect(result.current.errors.critical).toBe(true);

    await act(async () => {
      await result.current.retrySection('critical');
    });

    expect(result.current.homeData.hotMovies).toEqual([refreshedMovie]);
    expect(result.current.errors.critical).toBe(false);
  });

  it('deduplicates concurrent retries for the same section', async () => {
    const deferredRetry = createDeferred<{
      ok: true;
      data: typeof completeInitialData.hotMovies;
    }>();
    mockLoadCriticalData.mockReturnValue(deferredRetry.promise);
    const { result } = renderHomeDataHook(completeInitialData);

    let firstRetry!: Promise<void>;
    let duplicateRetry!: Promise<void>;
    act(() => {
      firstRetry = result.current.retrySection('critical');
      duplicateRetry = result.current.retrySection('critical');
    });

    expect(firstRetry).toBe(duplicateRetry);
    expect(mockLoadCriticalData).toHaveBeenCalledTimes(1);
    expect(result.current.loading.criticalLoading).toBe(true);
    expect(result.current.errors.critical).toBe(false);

    await act(async () => {
      deferredRetry.resolve({
        ok: true,
        data: completeInitialData.hotMovies,
      });
      await firstRetry;
    });
  });

  it('aborts in-flight section requests when the effect is cleaned up', async () => {
    let requestSignal: AbortSignal | undefined;
    mockLoadSecondaryData.mockImplementation(
      ({ signal }: { signal: AbortSignal }) => {
        requestSignal = signal;
        return new Promise(() => undefined);
      },
    );
    const initialData = {
      hotMovies: [item],
      hotTvShows: [],
      hotVarietyShows: [],
      bangumiCalendarData: [bangumiDay],
    };
    const { unmount } = renderHomeDataHook(initialData);

    await waitFor(() => {
      expect(requestSignal).toBeDefined();
    });
    unmount();

    expect(requestSignal?.aborted).toBe(true);
  });
});
