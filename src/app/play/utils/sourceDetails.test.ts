import type { SearchResult } from '@/lib/types';

import {
  buildSourceKey,
  dedupeSources,
  findSourceByIdentity,
  hydrateSourceDetail,
  replaceSourceDetail,
  resolveDoubanId,
} from './sourceDetails';

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

describe('sourceDetails', () => {
  test('buildSourceKey: combines source and id', () => {
    expect(buildSourceKey(createSource({ source: 's1', id: 'a' }))).toBe(
      's1-a'
    );
  });

  test('dedupeSources: dedupes by source and id with latest value', () => {
    const original = createSource({
      source: 's1',
      id: 'a',
      title: 'original',
    });
    const other = createSource({ source: 's2', id: 'b', title: 'other' });
    const latest = createSource({ source: 's1', id: 'a', title: 'latest' });

    const result = dedupeSources([original, other, latest]);

    expect(result).toHaveLength(2);
    expect(result.map((source) => source.title)).toEqual(['latest', 'other']);
  });

  test('findSourceByIdentity: matches the exact source and id', () => {
    const result = findSourceByIdentity(
      [
        createSource({ source: 's1', id: 'a' }),
        createSource({ source: 's1', id: 'b' }),
      ],
      { source: 's1', id: 'b' }
    );

    expect(result?.id).toBe('b');
  });

  test('hydrateSourceDetail: skips detail fetch when douban_id is valid', async () => {
    const fetchDetail = jest.fn();
    const source = createSource({ douban_id: 123 });

    const result = await hydrateSourceDetail(source, fetchDetail);

    expect(fetchDetail).not.toHaveBeenCalled();
    expect(result).toBe(source);
  });

  test('hydrateSourceDetail: merges fetched detail when douban_id is missing', async () => {
    const source = createSource({
      source: 's1',
      id: 'a',
      title: 'search title',
      douban_id: 0,
    });
    const fetchDetail = jest.fn().mockResolvedValue(
      createSource({
        source: 's1',
        id: 'a',
        title: 'detail title',
        poster: 'poster.jpg',
        douban_id: 456,
      })
    );

    const result = await hydrateSourceDetail(source, fetchDetail);

    expect(fetchDetail).toHaveBeenCalledWith('s1', 'a');
    expect(result.title).toBe('detail title');
    expect(result.poster).toBe('poster.jpg');
    expect(result.douban_id).toBe(456);
  });

  test('hydrateSourceDetail: keeps source result when detail fetch fails', async () => {
    const source = createSource({ source: 's1', id: 'a', douban_id: 0 });
    const error = new Error('detail failed');
    const onError = jest.fn();
    const fetchDetail = jest.fn().mockRejectedValue(error);

    const result = await hydrateSourceDetail(source, fetchDetail, { onError });

    expect(result).toBe(source);
    expect(onError).toHaveBeenCalledWith(error);
  });

  test('replaceSourceDetail: replaces only the matching item', () => {
    const a = createSource({ source: 's1', id: 'a', title: 'a' });
    const b = createSource({ source: 's2', id: 'b', title: 'b' });
    const nextA = createSource({ source: 's1', id: 'a', title: 'next a' });

    const result = replaceSourceDetail([a, b], nextA);

    expect(result.map((source) => source.title)).toEqual(['next a', 'b']);
  });

  test('resolveDoubanId: prefers detail id, then fallback, then zero', () => {
    expect(resolveDoubanId(createSource({ douban_id: 1 }), 2)).toBe(1);
    expect(resolveDoubanId(createSource({ douban_id: 0 }), 2)).toBe(2);
    expect(resolveDoubanId(createSource({ douban_id: 0 }), null)).toBe(0);
  });
});
