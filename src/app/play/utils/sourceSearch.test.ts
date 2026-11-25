import type { SearchResult } from '@/lib/types';

import {
  fuzzyMatchSources,
  matchesSourceStrictly,
  normalizeTitleForMatch,
  titlesMatchStrictly,
} from './sourceSearch';

function createResult(overrides: Partial<SearchResult>): SearchResult {
  return {
    id: '1',
    title: '测试影片',
    poster: '',
    episodes: ['https://example.com/1.m3u8', 'https://example.com/2.m3u8'],
    episodes_titles: [],
    source: 'site-a',
    source_name: '站点 A',
    year: '2026',
    ...overrides,
  };
}

describe('sourceSearch title matching', () => {
  test('normalizes book-title marks, punctuation, spacing, and edition suffixes', () => {
    expect(normalizeTitleForMatch('《裙下之臣：逃出魔窟》')).toBe(
      '裙下之臣逃出魔窟',
    );
    expect(normalizeTitleForMatch('裙下之臣: 逃出魔窟（2026）')).toBe(
      '裙下之臣逃出魔窟',
    );
    expect(
      titlesMatchStrictly('《裙下之臣：逃出魔窟》', '裙下之臣：逃出魔窟'),
    ).toBe(true);
    expect(
      titlesMatchStrictly('《裙下之臣：逃出魔窟》', '裙下之臣 逃出魔窟 [HD]'),
    ).toBe(true);
  });

  test('rejects shorter substrings and partially similar drama titles', () => {
    expect(titlesMatchStrictly('《裙下之臣：逃出魔窟》', '裙下之臣')).toBe(
      false,
    );
    expect(titlesMatchStrictly('《裙下之臣：逃出魔窟》', '逃出魔窟')).toBe(
      false,
    );
    expect(
      titlesMatchStrictly('《裙下之臣：逃出魔窟》', '裙下之臣：逆袭'),
    ).toBe(false);
    expect(titlesMatchStrictly('《裙下之臣：逃出魔窟》', '逃出绝命魔窟')).toBe(
      false,
    );
    expect(
      titlesMatchStrictly('《裙下之臣：逃出魔窟》', '裙下之臣：逃出魔窟2'),
    ).toBe(false);
    expect(titlesMatchStrictly('', '任意片名')).toBe(false);
  });

  test('supports omitted mid-title numbers while rejecting sequel mismatches', () => {
    expect(
      titlesMatchStrictly('死神来了：血脉诅咒', '死神来了6：血脉诅咒'),
    ).toBe(true);
    expect(
      titlesMatchStrictly('死神来了 血脉诅咒', '死神来了6：血脉诅咒'),
    ).toBe(true);
    expect(titlesMatchStrictly('庆余年', '庆余年2')).toBe(false);
    expect(titlesMatchStrictly('庆余年1', '庆余年2')).toBe(false);
  });

  test('matchesSourceStrictly treats unknown query year as unspecified and enforces exact title', () => {
    const exactMatch = createResult({
      title: '裙下之臣：逃出魔窟',
      year: '2026',
    });
    const wrongDrama = createResult({
      id: '2',
      title: '裙下之臣',
      year: '2026',
    });

    expect(
      matchesSourceStrictly(exactMatch, {
        queryTitle: '《裙下之臣：逃出魔窟》',
        year: 'unknown',
      }),
    ).toBe(true);
    expect(
      matchesSourceStrictly(wrongDrama, {
        queryTitle: '《裙下之臣：逃出魔窟》',
        year: '2026',
      }),
    ).toBe(false);
  });

  test('fuzzyMatchSources tolerates missing year or episode-1 TV while rejecting similar-named shows and year conflicts', () => {
    const unknownYearMatch = createResult({
      id: '1',
      title: '裙下之臣：逃出魔窟',
      year: 'unknown',
      episodes: ['https://example.com/ep1.m3u8'],
    });
    const wrongYearMatch = createResult({
      id: '2',
      title: '裙下之臣：逃出魔窟',
      year: '2024',
    });
    const partialOverlap = createResult({
      id: '3',
      title: '裙下之臣的诱惑',
      year: '2026',
    });
    const shortSubstring = createResult({
      id: '4',
      title: '裙下之臣',
      year: '2026',
    });

    const matches = fuzzyMatchSources(
      [unknownYearMatch, wrongYearMatch, partialOverlap, shortSubstring],
      '《裙下之臣：逃出魔窟》',
      { year: '2026', searchType: 'tv' },
    );

    expect(matches).toEqual([unknownYearMatch]);
  });
});
