import {
  isHomeRecordUnfinished,
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

describe('sortHomeContinueWatchingRecords', () => {
  it('treats >= 95% progress on final episode or movie as finished', () => {
    expect(
      isHomeRecordUnfinished({
        ...createRecord(1),
        index: 1,
        total_episodes: 1,
        play_time: 96,
        total_time: 100,
      }),
    ).toBe(false);

    expect(
      isHomeRecordUnfinished({
        ...createRecord(2),
        index: 1,
        total_episodes: 1,
        play_time: 40,
        total_time: 100,
      }),
    ).toBe(true);
  });

  it('prioritizes unfinished records while keeping recent watch order across movies and TV shows', () => {
    const records = [
      {
        ...createRecord(1),
        key: 'source+finished-newest',
        index: 10,
        total_episodes: 10,
        play_time: 98,
        total_time: 100,
        save_time: 500,
      },
      {
        ...createRecord(2),
        key: 'source+unfinished-tv-older',
        index: 2,
        total_episodes: 10,
        play_time: 100,
        total_time: 100,
        save_time: 200,
      },
      {
        ...createRecord(3),
        key: 'source+unfinished-movie-newer',
        index: 1,
        total_episodes: 1,
        play_time: 35,
        total_time: 100,
        save_time: 400,
      },
    ];

    // 即使旧剧集在追更表里标记了 priority=1（hasContinueWatching），也不应压过刚看的未看完电影
    const priorityByKey = new Map([['source+unfinished-tv-older', 1]]);

    expect(
      sortHomeContinueWatchingRecords(records, undefined, priorityByKey).map(
        (record) => record.key,
      ),
    ).toEqual([
      'source+unfinished-movie-newer',
      'source+unfinished-tv-older',
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
        (record) => record.key,
      ),
    ).toEqual(['source+b-recent', 'source+a-older']);
  });
});
