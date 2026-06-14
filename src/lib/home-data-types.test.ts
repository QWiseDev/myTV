import {
  EMPTY_HOME_DATA,
  getHomeDataAvailability,
  hasHomeData,
} from './home-data-types';

const item = {
  id: '1',
  title: '测试影片',
  poster: '',
  rate: '',
  year: '2026',
};

describe('getHomeDataAvailability', () => {
  it('treats partial home data as available but incomplete', () => {
    const availability = getHomeDataAvailability({
      ...EMPTY_HOME_DATA,
      hotMovies: [item],
    });

    expect(hasHomeData({ ...EMPTY_HOME_DATA, hotMovies: [item] })).toBe(true);
    expect(availability).toEqual({
      hasAnyData: true,
      hasCriticalData: true,
      hasSecondaryData: false,
      hasTertiaryData: false,
      isComplete: false,
    });
  });

  it('requires all home sections before marking data complete', () => {
    expect(
      getHomeDataAvailability({
        hotMovies: [item],
        hotTvShows: [item],
        hotVarietyShows: [item],
        bangumiCalendarData: [
          { weekday: { en: 'Mon', cn: '周一', ja: '月' }, items: [] },
        ],
      }).isComplete
    ).toBe(true);
  });
});
