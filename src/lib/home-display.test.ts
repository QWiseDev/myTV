import {
  limitHomeRecords,
  sortHomeContinueWatchingRecords,
} from './home-display';
import type { PlayRecord } from './types';

function createRecord(index: number): PlayRecord & { key: string } {
  return {
    key: `source+${index}`,
    title: `影片 ${index}`,
    source_name: '测试源',
    cover: '',
    year: '2026',
    index: 1,
    total_episodes: 1,
    play_time: 0,
    total_time: 100,
    save_time: Date.now() - index,
    search_title: `影片 ${index}`,
  };
}

describe('limitHomeRecords', () => {
  it('keeps the home continue watching row bounded', () => {
    const records = Array.from({ length: 40 }, (_, index) =>
      createRecord(index)
    );

    expect(limitHomeRecords(records)).toHaveLength(30);
    expect(limitHomeRecords(records)[0].key).toBe('source+0');
    expect(limitHomeRecords(records)[29].key).toBe('source+29');
  });

  it('keeps short lists unchanged', () => {
    const records = Array.from({ length: 3 }, (_, index) =>
      createRecord(index)
    );

    expect(limitHomeRecords(records)).toHaveLength(3);
  });
});

describe('sortHomeContinueWatchingRecords', () => {
  it('prioritizes unfinished records while keeping recent watch order within each group', () => {
    const records = [
      {
        ...createRecord(1),
        key: 'source+finished-newest',
        index: 10,
        total_episodes: 10,
        play_time: 100,
        total_time: 100,
        save_time: 400,
      },
      {
        ...createRecord(2),
        key: 'source+unfinished-older',
        index: 2,
        total_episodes: 10,
        play_time: 100,
        total_time: 100,
        save_time: 200,
      },
      {
        ...createRecord(3),
        key: 'source+unfinished-newer',
        index: 1,
        total_episodes: 1,
        play_time: 20,
        total_time: 100,
        save_time: 300,
      },
    ];

    expect(
      sortHomeContinueWatchingRecords(records).map((record) => record.key)
    ).toEqual([
      'source+unfinished-newer',
      'source+unfinished-older',
      'source+finished-newest',
    ]);
  });

  it('uses latest episode counts without letting update list order replace recency order', () => {
    const records = [
      {
        ...createRecord(1),
        key: 'source+b-recent',
        index: 6,
        total_episodes: 6,
        save_time: 300,
      },
      {
        ...createRecord(2),
        key: 'source+a-older',
        index: 6,
        total_episodes: 6,
        save_time: 200,
      },
    ];
    const latestTotalEpisodes = new Map([
      ['source+a-older', 8],
      ['source+b-recent', 8],
    ]);

    expect(
      sortHomeContinueWatchingRecords(records, latestTotalEpisodes).map(
        (record) => record.key
      )
    ).toEqual(['source+b-recent', 'source+a-older']);
  });
});
