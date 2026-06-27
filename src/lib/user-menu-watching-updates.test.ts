import {
  buildUserMenuWatchingUpdatesState,
  getUserMenuNewEpisodesCount,
} from './user-menu-watching-updates';
import type { WatchingUpdate } from './watching-updates';

type WatchingUpdateSeries = WatchingUpdate['updatedSeries'][number];

function createSeries(
  overrides: Partial<WatchingUpdateSeries> = {},
): WatchingUpdateSeries {
  return {
    title: '测试剧集',
    source_name: '测试源',
    year: '2026',
    cover: '',
    sourceKey: 'source',
    videoId: 'video',
    currentEpisode: 1,
    totalEpisodes: 2,
    hasNewEpisode: false,
    hasContinueWatching: false,
    ...overrides,
  };
}

function createWatchingUpdate(
  overrides: Partial<WatchingUpdate> = {},
): WatchingUpdate {
  return {
    hasUpdates: false,
    timestamp: 1,
    updatedCount: 0,
    continueWatchingCount: 0,
    updatedSeries: [],
    ...overrides,
  };
}

describe('buildUserMenuWatchingUpdatesState', () => {
  it('returns empty state when watching updates are missing', () => {
    const state = buildUserMenuWatchingUpdatesState(null);

    expect(state.hasActualUpdates).toBe(false);
    expect(state.totalUpdates).toBe(0);
    expect(state.newEpisodeSeries).toEqual([]);
    expect(getUserMenuNewEpisodesCount(state, 'source+video')).toBe(0);
  });

  it('keeps the unread flag tied to updatedCount', () => {
    const state = buildUserMenuWatchingUpdatesState(
      createWatchingUpdate({
        updatedCount: 1,
        updatedSeries: [
          createSeries({
            hasNewEpisode: false,
          }),
        ],
      }),
    );

    expect(state.hasActualUpdates).toBe(true);
    expect(state.totalUpdates).toBe(1);
    expect(state.newEpisodeSeries).toEqual([]);
  });

  it('derives new episode series and lookup counts', () => {
    const state = buildUserMenuWatchingUpdatesState(
      createWatchingUpdate({
        updatedCount: 2,
        updatedSeries: [
          createSeries({
            hasNewEpisode: true,
            newEpisodes: 3,
            videoId: 'video+with-plus',
          }),
          createSeries({
            hasContinueWatching: true,
            hasNewEpisode: false,
            videoId: 'continue-only',
          }),
        ],
      }),
    );

    expect(state.newEpisodeSeries.map((series) => series.videoId)).toEqual([
      'video+with-plus',
    ]);
    expect(getUserMenuNewEpisodesCount(state, 'source+video+with-plus')).toBe(3);
    expect(getUserMenuNewEpisodesCount(state, 'source+continue-only')).toBe(0);
  });
});
