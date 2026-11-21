import type { SearchResult } from '@/lib/types';

import { markSourceFailedAndFindNext } from './sourceFailover';

function createSource(overrides: Partial<SearchResult>): SearchResult {
  return {
    id: 'id',
    title: 'title',
    poster: '',
    episodes: [],
    episodes_titles: [],
    source: 'src',
    source_name: 'Source',
    year: '2024',
    ...overrides,
  };
}

describe('sourceFailover', () => {
  test('marks only the current source as failed', () => {
    const current = createSource({ source: 's1', id: 'a' });
    const other = createSource({ source: 's2', id: 'b' });

    const result = markSourceFailedAndFindNext([current, other], {
      source: 's1',
      id: 'a',
    });

    expect(result.sources[0]).toEqual({ ...current, failed: true });
    expect(result.sources[1]).toBe(other);
  });

  test('returns the first non-failed source after marking current failed', () => {
    const current = createSource({ source: 's1', id: 'a' });
    const failed = createSource({ source: 's2', id: 'b', failed: true });
    const next = createSource({ source: 's3', id: 'c' });

    const result = markSourceFailedAndFindNext([current, failed, next], {
      source: 's1',
      id: 'a',
    });

    expect(result.nextSource).toBe(next);
  });

  test('does not return the current source as the next source', () => {
    const current = createSource({ source: 's1', id: 'a' });

    const result = markSourceFailedAndFindNext([current], {
      source: 's1',
      id: 'a',
    });

    expect(result.nextSource).toBeNull();
  });

  test('returns null when every alternative source has failed', () => {
    const current = createSource({ source: 's1', id: 'a' });
    const failed = createSource({ source: 's2', id: 'b', failed: true });

    const result = markSourceFailedAndFindNext([current, failed], {
      source: 's1',
      id: 'a',
    });

    expect(result.nextSource).toBeNull();
  });

  test('同一集播放地址相同的源一并标记失败，避免在同一条坏链上试错', () => {
    const current = createSource({
      source: 's1',
      id: 'a',
      episodes: [
        'https://cdn.example/ep1.m3u8',
        'https://cdn.example/ep2.m3u8',
      ],
    });
    const sameCdn = createSource({
      source: 's2',
      id: 'b',
      episodes: [
        'https://cdn.example/ep1.m3u8',
        'https://other.example/ep2.m3u8',
      ],
    });
    const healthy = createSource({
      source: 's3',
      id: 'c',
      episodes: ['https://healthy.example/ep1.m3u8'],
    });

    const result = markSourceFailedAndFindNext(
      [current, sameCdn, healthy],
      { source: 's1', id: 'a' },
      { failedUrl: 'https://cdn.example/ep1.m3u8', episodeIndex: 0 },
    );

    expect(result.sources[0].failed).toBe(true);
    expect(result.sources[1].failed).toBe(true);
    expect(result.sources[2].failed).toBeUndefined();
    expect(result.nextSource).toBe(healthy);
  });

  test('未提供失败地址时保持原行为', () => {
    const current = createSource({
      source: 's1',
      id: 'a',
      episodes: ['https://cdn.example/ep1.m3u8'],
    });
    const other = createSource({
      source: 's2',
      id: 'b',
      episodes: ['https://cdn.example/ep1.m3u8'],
    });

    const result = markSourceFailedAndFindNext([current, other], {
      source: 's1',
      id: 'a',
    });

    expect(result.sources[1].failed).toBeUndefined();
    expect(result.nextSource).toBe(other);
  });
});
