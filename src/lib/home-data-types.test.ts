import { EMPTY_HOME_DATA, getHomeDataAvailability } from './home-data-types';

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

    expect(availability).toEqual({
      hasAnyData: true,
      hasCriticalData: true,
      hasSecondaryData: false,
      hasTertiaryData: false,
      hasTvData: false,
      hasVarietyData: false,
      isComplete: false,
    });
  });

  it('tracks TV and variety availability independently', () => {
    const availability = getHomeDataAvailability({
      ...EMPTY_HOME_DATA,
      hotTvShows: [item],
    });

    expect(availability).toEqual({
      hasAnyData: true,
      hasCriticalData: false,
      hasSecondaryData: false,
      hasTertiaryData: false,
      hasTvData: true,
      hasVarietyData: false,
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
      }).isComplete,
    ).toBe(true);
  });
});
