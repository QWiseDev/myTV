import {
  buildUserMenuContinueWatchingRecords,
  calculatePlayRecordProgress,
} from './user-menu-continue-watching';
import type { PlayRecord } from './types';

function createRecord(overrides: Partial<PlayRecord> = {}): PlayRecord {
  return {
    title: '测试影片',
    source_name: '测试源',
    cover: '',
    year: '2026',
    index: 1,
    total_episodes: 1,
    play_time: 240,
    total_time: 600,
    save_time: 100,
    search_title: '测试影片',
    ...overrides,
  };
}

const defaultOptions = {
  enableProgressFilter: true,
  maxProgress: 80,
  minProgress: 20,
};

describe('calculatePlayRecordProgress', () => {
  it('keeps zero-duration records at zero progress', () => {
    expect(
      calculatePlayRecordProgress(
        createRecord({
          play_time: 120,
          total_time: 0,
        }),
      ),
    ).toBe(0);
  });

  it('returns the unrounded percentage used by UserMenu', () => {
    expect(
      calculatePlayRecordProgress(
        createRecord({
          play_time: 125,
          total_time: 500,
        }),
      ),
    ).toBe(25);
  });
});

describe('buildUserMenuContinueWatchingRecords', () => {
  it('filters out records watched for less than two minutes', () => {
    const records = buildUserMenuContinueWatchingRecords(
      {
        short: createRecord({
          play_time: 119,
          total_time: 600,
        }),
        valid: createRecord({
          play_time: 120,
          total_time: 600,
        }),
      },
      defaultOptions,
    );

    expect(records.map((record) => record.key)).toEqual(['valid']);
  });

  it('keeps all records over two minutes when progress filter is disabled', () => {
    const records = buildUserMenuContinueWatchingRecords(
      {
        almostFinished: createRecord({
          play_time: 590,
          total_time: 600,
        }),
        barelyStarted: createRecord({
          play_time: 121,
          total_time: 5000,
        }),
      },
      {
        ...defaultOptions,
        enableProgressFilter: false,
      },
    );

    expect(records.map((record) => record.key)).toEqual([
      'almostFinished',
      'barelyStarted',
    ]);
  });

  it('applies the configured progress range when filter is enabled', () => {
    const records = buildUserMenuContinueWatchingRecords(
      {
        below: createRecord({
          play_time: 150,
          total_time: 1000,
        }),
        inside: createRecord({
          play_time: 250,
          total_time: 1000,
        }),
        above: createRecord({
          play_time: 900,
          total_time: 1000,
        }),
      },
      defaultOptions,
    );

    expect(records.map((record) => record.key)).toEqual(['inside']);
  });

  it('sorts by latest save time and limits the menu list to 12 records', () => {
    const input = Object.fromEntries(
      Array.from({ length: 15 }, (_, index) => [
        `record-${index}`,
        createRecord({
          save_time: index,
        }),
      ]),
    );

    const records = buildUserMenuContinueWatchingRecords(input, defaultOptions);

    expect(records).toHaveLength(12);
    expect(records.map((record) => record.key)).toEqual([
      'record-14',
      'record-13',
      'record-12',
      'record-11',
      'record-10',
      'record-9',
      'record-8',
      'record-7',
      'record-6',
      'record-5',
      'record-4',
      'record-3',
    ]);
  });
});
