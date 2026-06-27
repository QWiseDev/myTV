import { buildContinueWatchingDisplayState } from './continue-watching-display';
import type { PlayRecord } from './types';
import type { WatchingUpdatesCache } from './watching-updates';

function createRecord(
  key: string,
  overrides: Partial<PlayRecord> = {},
): PlayRecord & { key: string } {
  return {
    key,
    title: key,
    source_name: '测试源',
    cover: '',
    year: '2026',
    index: 1,
    total_episodes: 1,
    play_time: 0,
    total_time: 100,
    save_time: 100,
    search_title: key,
    ...overrides,
  };
}

function toRecordMap(
  records: Array<PlayRecord & { key: string }>,
): Record<string, PlayRecord> {
  return Object.fromEntries(
    records.map(({ key, ...record }) => [key, record]),
  );
}

function createWatchingUpdates(
  updatedSeries: WatchingUpdatesCache['updatedSeries'],
): WatchingUpdatesCache {
  return {
    continueWatchingCount: updatedSeries.filter(
      (series) => series.hasContinueWatching,
    ).length,
    hasUpdates: updatedSeries.some((series) => series.hasNewEpisode),
    timestamp: 1,
    updatedCount: updatedSeries.filter((series) => series.hasNewEpisode).length,
    updatedSeries,
  };
}

describe('buildContinueWatchingDisplayState', () => {
  it('returns empty display state when there are no play records', () => {
    const state = buildContinueWatchingDisplayState(null, null);

    expect(state.records).toEqual([]);
    expect(state.displayItems).toEqual([]);
    expect(state.newEpisodeSeries).toEqual([]);
    expect(state.continueWatchingSeries).toEqual([]);
  });

  it('builds badges, progress and latest episode counts from watching updates', () => {
    const state = buildContinueWatchingDisplayState(
      toRecordMap([
        createRecord('source+finished', {
          index: 1,
          play_time: 100,
          save_time: 300,
          total_episodes: 1,
          total_time: 100,
        }),
        createRecord('source+continue', {
          index: 6,
          play_time: 100,
          save_time: 100,
          total_episodes: 6,
          total_time: 100,
        }),
        createRecord('source+id+with-plus', {
          index: 6,
          play_time: 50,
          save_time: 200,
          total_episodes: 6,
          total_time: 100,
        }),
      ]),
      createWatchingUpdates([
        {
          title: '有新集',
          source_name: '测试源',
          year: '2026',
          cover: '',
          sourceKey: 'source',
          videoId: 'id+with-plus',
          currentEpisode: 6,
          totalEpisodes: 8,
          hasNewEpisode: true,
          hasContinueWatching: true,
          newEpisodes: 2,
        },
        {
          title: '继续观看',
          source_name: '测试源',
          year: '2026',
          cover: '',
          sourceKey: 'source',
          videoId: 'continue',
          currentEpisode: 6,
          totalEpisodes: 8,
          hasNewEpisode: false,
          hasContinueWatching: true,
        },
      ]),
    );

    expect(state.displayItems.map((item) => item.record.key)).toEqual([
      'source+id+with-plus',
      'source+continue',
      'source+finished',
    ]);
    expect(state.newEpisodeSeries).toHaveLength(1);
    expect(state.continueWatchingSeries).toHaveLength(1);

    const newEpisodeItem = state.displayItems[0];
    expect(newEpisodeItem.id).toBe('id+with-plus');
    expect(newEpisodeItem.latestTotalEpisodes).toBe(8);
    expect(newEpisodeItem.newEpisodesCount).toBe(2);
    expect(newEpisodeItem.progress).toBe(50);
    expect(newEpisodeItem.showContinueWatchingBadge).toBe(false);

    const continueWatchingItem = state.displayItems[1];
    expect(continueWatchingItem.latestTotalEpisodes).toBe(8);
    expect(continueWatchingItem.newEpisodesCount).toBe(0);
    expect(continueWatchingItem.progress).toBe(100);
    expect(continueWatchingItem.showContinueWatchingBadge).toBe(true);
  });

  it('keeps only the newest 60 records and displays at most 30', () => {
    const records = Array.from({ length: 70 }, (_, index) =>
      createRecord(`source+${index}`, {
        save_time: index,
      }),
    );

    const state = buildContinueWatchingDisplayState(toRecordMap(records), null);

    expect(state.records).toHaveLength(60);
    expect(state.displayItems).toHaveLength(30);
    expect(state.displayItems[0].record.key).toBe('source+69');
    expect(state.displayItems[29].record.key).toBe('source+40');
  });
});
