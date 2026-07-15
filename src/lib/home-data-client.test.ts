import {
  createHomeDataSnapshot,
  createHomeErrorState,
  createHomeLoadingState,
  mergeHomeData,
  patchHomeData,
  patchHomeLoadingState,
} from './home-data-client';
import { type HomeData, EMPTY_HOME_DATA } from './home-data-types';

const item = {
  id: '1',
  title: '测试影片',
  poster: '',
  rate: '',
  year: '2026',
};

const bangumiItem = {
  weekday: { en: 'Mon', cn: '周一', ja: '月' },
  items: [],
};

function createHomeData(overrides: Partial<HomeData> = {}): HomeData {
  return {
    ...EMPTY_HOME_DATA,
    ...overrides,
  };
}

describe('home data client helpers', () => {
  it('creates an empty home data snapshot when there is no initial data', () => {
    expect(createHomeDataSnapshot()).toEqual(EMPTY_HOME_DATA);
  });

  it('creates loading flags from available initial sections', () => {
    expect(
      createHomeLoadingState(
        createHomeData({
          hotMovies: [item],
          hotTvShows: [item],
          hotVarietyShows: [item],
        }),
      ),
    ).toEqual({
      criticalLoading: false,
      tertiaryLoading: true,
      tvLoading: false,
      varietyLoading: false,
    });
  });

  it('creates independent loading flags for partial secondary data', () => {
    expect(
      createHomeLoadingState(
        createHomeData({
          hotTvShows: [item],
        }),
      ),
    ).toEqual({
      criticalLoading: true,
      tertiaryLoading: true,
      tvLoading: false,
      varietyLoading: true,
    });
  });

  it('creates independent cleared error flags for every home section', () => {
    expect(createHomeErrorState()).toEqual({
      critical: false,
      tertiary: false,
      tv: false,
      variety: false,
    });
  });

  it('merges only non-empty incoming sections into current home data', () => {
    const current = createHomeData({
      hotMovies: [{ ...item, id: 'movie-current' }],
      hotTvShows: [{ ...item, id: 'tv-current' }],
      hotVarietyShows: [{ ...item, id: 'show-current' }],
      bangumiCalendarData: [bangumiItem],
    });
    const incoming = createHomeData({
      hotMovies: [{ ...item, id: 'movie-incoming' }],
      hotTvShows: [],
      hotVarietyShows: [{ ...item, id: 'show-incoming' }],
      bangumiCalendarData: [],
    });

    expect(mergeHomeData(current, incoming)).toEqual({
      hotMovies: [{ ...item, id: 'movie-incoming' }],
      hotTvShows: [{ ...item, id: 'tv-current' }],
      hotVarietyShows: [{ ...item, id: 'show-incoming' }],
      bangumiCalendarData: [bangumiItem],
    });
  });

  it('patches home data while ignoring undefined fields', () => {
    const current = createHomeData({
      hotMovies: [{ ...item, id: 'movie-current' }],
      hotTvShows: [{ ...item, id: 'tv-current' }],
    });

    expect(
      patchHomeData(current, {
        hotMovies: [{ ...item, id: 'movie-patched' }],
        hotTvShows: undefined,
      }),
    ).toEqual({
      ...current,
      hotMovies: [{ ...item, id: 'movie-patched' }],
    });
  });

  it('patches home loading state partially', () => {
    expect(
      patchHomeLoadingState(
        {
          criticalLoading: true,
          tertiaryLoading: true,
          tvLoading: true,
          varietyLoading: true,
        },
        { criticalLoading: false },
      ),
    ).toEqual({
      criticalLoading: false,
      tertiaryLoading: true,
      tvLoading: true,
      varietyLoading: true,
    });
  });
});
