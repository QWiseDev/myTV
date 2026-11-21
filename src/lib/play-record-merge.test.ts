import { findCrossKeySameShowRecords } from './play-record-merge';
import { generateStorageKey } from './storage-key';
import type { PlayRecord } from './types';

function createRecord(overrides: Partial<PlayRecord> = {}): PlayRecord {
  return {
    cover: '',
    index: 1,
    original_episodes: 12,
    play_time: 10,
    save_time: 100,
    search_title: '测试剧集',
    source_name: '测试源',
    title: '测试剧集',
    total_episodes: 12,
    total_time: 100,
    year: '2026',
    ...overrides,
  };
}

describe('findCrossKeySameShowRecords', () => {
  const incomingKey = generateStorageKey('bfzy', 'id-incoming');

  it('matches records with identical title and compatible year', () => {
    const records = {
      [generateStorageKey('dyttky', 'id-a')]: createRecord({ year: '2026' }),
      [generateStorageKey('ffzy', 'id-b')]: createRecord({ year: '' }),
    };

    const targets = findCrossKeySameShowRecords(
      createRecord(),
      incomingKey,
      records,
    );

    expect(targets.map((t) => t.key).sort()).toEqual([
      generateStorageKey('dyttky', 'id-a'),
      generateStorageKey('ffzy', 'id-b'),
    ]);
  });

  it('skips records with a different year', () => {
    const records = {
      [generateStorageKey('dyttky', 'id-a')]: createRecord({ year: '2010' }),
    };

    expect(
      findCrossKeySameShowRecords(createRecord(), incomingKey, records),
    ).toEqual([]);
  });

  it('matches by douban_id even when titles differ', () => {
    const records = {
      [generateStorageKey('dyttky', 'id-a')]: createRecord({
        title: '改名后的剧名',
        douban_id: 36693684,
      }),
    };

    const targets = findCrossKeySameShowRecords(
      createRecord({ douban_id: 36693684 }),
      incomingKey,
      records,
    );

    expect(targets).toHaveLength(1);
  });

  it('does not merge different douban ids even when title and year match', () => {
    const records = {
      [generateStorageKey('dyttky', 'id-a')]: createRecord({ douban_id: 111 }),
    };

    expect(
      findCrossKeySameShowRecords(
        createRecord({ douban_id: 222 }),
        incomingKey,
        records,
      ),
    ).toEqual([]);
  });

  it('skips different titles, the incoming key itself and malformed keys', () => {
    const records: Record<string, PlayRecord> = {
      [generateStorageKey('dyttky', 'id-a')]: createRecord({
        title: '另一部剧',
      }),
      [incomingKey]: createRecord({ save_time: 1 }),
      'broken-key-without-separator': createRecord(),
    };

    expect(
      findCrossKeySameShowRecords(createRecord(), incomingKey, records),
    ).toEqual([]);
  });
});
