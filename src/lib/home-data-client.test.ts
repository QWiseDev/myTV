import {
  createHomeDataSnapshot,
  createHomeLoadingState,
  mergeHomeData,
} from './home-data-client';
import { EMPTY_HOME_DATA, type HomeData } from './home-data-types';

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
      secondaryLoading: false,
      tertiaryLoading: true,
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
});
