import {
  buildContinueWatchingDisplayState,
  buildHeroContinueItems,
  formatRemainingWatchTime,
} from './continue-watching-display';
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
    cover: 'https://img.example/cover.jpg',
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
  return Object.fromEntries(records.map(({ key, ...record }) => [key, record]));
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
    expect(state.newEpisodeItemCount).toBe(0);
    expect(state.unfinishedItemCount).toBe(0);
  });

  it('builds badges, progress, remaining time and live counts from watching updates', () => {
    const state = buildContinueWatchingDisplayState(
      toRecordMap([
        createRecord('source+finished', {
          index: 1,
          play_time: 98,
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
          play_time: 1200,
          save_time: 200,
          total_episodes: 6,
          total_time: 2400,
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
    expect(state.newEpisodeItemCount).toBe(1);
    expect(state.unfinishedItemCount).toBe(2);

    const newEpisodeItem = state.displayItems[0];
    expect(newEpisodeItem.id).toBe('id+with-plus');
    expect(newEpisodeItem.latestTotalEpisodes).toBe(8);
    expect(newEpisodeItem.newEpisodesCount).toBe(2);
    expect(newEpisodeItem.progress).toBe(50);
    expect(newEpisodeItem.remainingTimeLabel).toBe('剩余 20 分钟');
    expect(newEpisodeItem.showContinueWatchingBadge).toBe(false);

    const continueWatchingItem = state.displayItems[1];
    expect(continueWatchingItem.latestTotalEpisodes).toBe(8);
    expect(continueWatchingItem.newEpisodesCount).toBe(0);
    expect(continueWatchingItem.progress).toBe(100);
    expect(continueWatchingItem.showContinueWatchingBadge).toBe(true);
  });

  it('prioritizes records with new episode reminders over regular recent records', () => {
    const state = buildContinueWatchingDisplayState(
      toRecordMap([
        createRecord('source+recent', {
          index: 2,
          save_time: 300,
          total_episodes: 8,
        }),
        createRecord('source+old-update', {
          index: 6,
          save_time: 100,
          total_episodes: 6,
        }),
      ]),
      createWatchingUpdates([
        {
          title: '老记录有新集',
          source_name: '测试源',
          year: '2026',
          cover: '',
          sourceKey: 'source',
          videoId: 'old-update',
          currentEpisode: 6,
          totalEpisodes: 8,
          hasNewEpisode: true,
          hasContinueWatching: true,
          newEpisodes: 2,
        },
      ]),
    );

    expect(state.displayItems.map((item) => item.record.key)).toEqual([
      'source+old-update',
      'source+recent',
    ]);
  });

  it('filters finished movies out of Hero continue items and reflects latest episode counts', () => {
    const heroItems = buildHeroContinueItems(
      toRecordMap([
        createRecord('source+finished-movie', {
          title: '看完的电影',
          index: 1,
          total_episodes: 1,
          play_time: 5900,
          total_time: 6000,
          save_time: 500,
        }),
        createRecord('source+active-tv', {
          title: '在追剧集',
          index: 4,
          total_episodes: 10,
          play_time: 600,
          total_time: 2400,
          save_time: 400,
        }),
      ]),
      createWatchingUpdates([
        {
          title: '在追剧集',
          source_name: '测试源',
          year: '2026',
          cover: '',
          sourceKey: 'source',
          videoId: 'active-tv',
          currentEpisode: 4,
          totalEpisodes: 12,
          hasNewEpisode: true,
          hasContinueWatching: true,
          newEpisodes: 2,
        },
      ]),
      4,
    );

    expect(heroItems).toHaveLength(1);
    expect(heroItems[0]).toMatchObject({
      key: 'source+active-tv',
      title: '在追剧集',
      episodeLabel: '第 4 集 · 更新至 12 集 (+2)',
    });
  });

  it('formats remaining watch time cleanly', () => {
    expect(formatRemainingWatchTime(45)).toBe('剩余不足 1 分钟');
    expect(formatRemainingWatchTime(1500)).toBe('剩余 25 分钟');
    expect(formatRemainingWatchTime(5400)).toBe('剩余 1 小时 30 分');
  });

  it('keeps all loaded records and leaves paging to the data source', () => {
    const records = Array.from({ length: 70 }, (_, index) =>
      createRecord(`source+${index}`, {
        save_time: index,
      }),
    );

    const state = buildContinueWatchingDisplayState(toRecordMap(records), null);

    expect(state.records).toHaveLength(70);
    expect(state.displayItems).toHaveLength(70);
    expect(state.displayItems[0].record.key).toBe('source+69');
    expect(state.displayItems[69].record.key).toBe('source+0');
  });
});
