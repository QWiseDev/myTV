import { renderHook, waitFor } from '@testing-library/react';

import { EMPTY_HOME_DATA } from '@/lib/home-data-types';

const mockLoadCriticalData = jest.fn();
const mockLoadHomeDataFromApi = jest.fn();
const mockLoadSecondaryData = jest.fn();
const mockLoadTertiaryData = jest.fn();
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

describe('useHomeData', () => {
  beforeAll(async () => {
    useHomeData = (await import('./useHomeData')).useHomeData;
  });

  beforeEach(() => {
    mockLoadCriticalData.mockReset();
    mockLoadHomeDataFromApi.mockReset();
    mockLoadSecondaryData.mockReset();
    mockLoadTertiaryData.mockReset();
    mockScheduleWatchingUpdatesCheck.mockReset();
    mockLoadHomeDataFromApi.mockResolvedValue(EMPTY_HOME_DATA);
  });

  it('loads only the missing variety section and preserves existing TV data', async () => {
    mockLoadSecondaryData.mockResolvedValue({
      hotTvShows: { code: 200, list: [] },
      hotVarietyShows: { code: 200, list: [] },
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
      });
      expect(result.current.homeData.hotTvShows).toEqual([
        { ...item, id: 'tv-existing' },
      ]);
      expect(result.current.loading.tvLoading).toBe(false);
      expect(result.current.loading.varietyLoading).toBe(false);
    });
  });
});
