import {
  decodePlayRecordsCursor,
  encodePlayRecordsCursor,
  paginatePlayRecords,
} from './play-records-pagination';
import type { PlayRecord } from './types';

function createRecord(saveTime: number): PlayRecord {
  return {
    cover: '',
    index: 1,
    play_time: 0,
    save_time: saveTime,
    search_title: '测试影片',
    source_name: '测试源',
    title: '测试影片',
    total_episodes: 1,
    total_time: 100,
    year: '2026',
  };
}

describe('play records pagination', () => {
  it('returns a cursor based page ordered by save time', () => {
    const records = {
      'source+c': createRecord(100),
      'source+a': createRecord(300),
      'source+b': createRecord(200),
    };

    const firstPage = paginatePlayRecords(records, { pageSize: 2 });

    expect(Object.keys(firstPage.records)).toEqual(['source+a', 'source+b']);
    expect(firstPage.hasMore).toBe(true);
    expect(firstPage.total).toBe(3);

    const secondPage = paginatePlayRecords(records, {
      cursor: firstPage.nextCursor,
      pageSize: 2,
    });

    expect(Object.keys(secondPage.records)).toEqual(['source+c']);
    expect(secondPage.hasMore).toBe(false);
    expect(secondPage.nextCursor).toBeNull();
  });

  it('uses key order as a stable tie breaker', () => {
    const records = {
      'source+b': createRecord(100),
      'source+a': createRecord(100),
      'source+c': createRecord(100),
    };

    const firstPage = paginatePlayRecords(records, { pageSize: 2 });
    const secondPage = paginatePlayRecords(records, {
      cursor: firstPage.nextCursor,
      pageSize: 2,
    });

    expect(Object.keys(firstPage.records)).toEqual(['source+a', 'source+b']);
    expect(Object.keys(secondPage.records)).toEqual(['source+c']);
  });

  it('includes requested keys outside the current page without moving the cursor', () => {
    const records = {
      'source+latest': createRecord(300),
      'source+middle': createRecord(200),
      'source+old-update': createRecord(100),
    };

    const page = paginatePlayRecords(records, {
      includeKeys: ['source+old-update'],
      pageSize: 1,
    });

    expect(Object.keys(page.records)).toEqual([
      'source+latest',
      'source+old-update',
    ]);
    expect(page.hasMore).toBe(true);
    expect(page.nextCursor).toBe('300:source%2Blatest');
  });

  it('keeps pinned records out of every later cursor page', () => {
    const records = {
      'source+a': createRecord(600),
      'source+b': createRecord(500),
      'source+priority-a': createRecord(400),
      'source+priority-b': createRecord(300),
      'source+c': createRecord(200),
      'source+d': createRecord(100),
    };
    const includeKeys = ['source+priority-a', 'source+priority-b'];

    const firstPage = paginatePlayRecords(records, {
      includeKeys,
      pageSize: 2,
    });
    const secondPage = paginatePlayRecords(records, {
      cursor: firstPage.nextCursor,
      includeKeys,
      pageSize: 2,
    });

    expect(Object.keys(firstPage.records)).toEqual([
      'source+a',
      'source+b',
      'source+priority-a',
      'source+priority-b',
    ]);
    expect(firstPage.nextCursor).toBe('500:source%2Bb');
    expect(Object.keys(secondPage.records)).toEqual(['source+c', 'source+d']);
    expect(secondPage.hasMore).toBe(false);
    expect(secondPage.nextCursor).toBeNull();
    expect(secondPage.total).toBe(6);
  });

  it('does not let a pinned first-page record consume the regular page size', () => {
    const records = {
      'source+a': createRecord(300),
      'source+priority': createRecord(200),
      'source+b': createRecord(100),
    };

    const page = paginatePlayRecords(records, {
      includeKeys: ['source+priority'],
      pageSize: 2,
    });

    expect(Object.keys(page.records)).toEqual([
      'source+a',
      'source+b',
      'source+priority',
    ]);
    expect(page.hasMore).toBe(false);
    expect(page.nextCursor).toBeNull();
  });

  it('round trips cursor values with encoded storage keys', () => {
    const record = createRecord(123);
    const cursor = encodePlayRecordsCursor('source+id+with+plus', record);

    expect(decodePlayRecordsCursor(cursor)).toEqual({
      key: 'source+id+with+plus',
      saveTime: 123,
    });
  });
});
