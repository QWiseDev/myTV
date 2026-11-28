import {
  filterExactSourceMatches,
  isUpstreamResultRelevantToQuery,
  sanitizeUpstreamSearchPage,
} from '@/lib/search-match';
import type { SearchResult } from '@/lib/types';

function makeResult(
  id: string,
  title: string,
  extra: Partial<SearchResult> = {},
): SearchResult {
  return {
    id,
    title,
    poster: '',
    episodes: ['https://cdn.example/1.m3u8', 'https://cdn.example/2.m3u8'],
    episodes_titles: ['第1集', '第2集'],
    source: 'site-a',
    source_name: '站点A',
    year: '2026',
    ...extra,
  };
}

describe('search-match upstream catalog dump guard', () => {
  test('drops all unrelated results when a broken MacCMS site ignores wd and dumps catalog', () => {
    const dumpItems = Array.from({ length: 20 }, (_, i) =>
      makeResult(`junk-${i}`, `完全无关的最新电影${i}`),
    );

    const sanitized = sanitizeUpstreamSearchPage(
      dumpItems,
      500,
      'zz不存在影片测试98765',
    );

    expect(sanitized.isCatalogDump).toBe(true);
    expect(sanitized.results).toEqual([]);
    expect(sanitized.effectivePageCount).toBe(1);
  });

  test('rejects pure season token from matching unrelated shows on spaced season query', () => {
    const unrelatedSeason = makeResult('r1', '奔跑吧第四季');
    const actualMatch = makeResult('r2', '现在就出发第四季');
    const actualMatchNum = makeResult('r3', '现在就出发4');

    expect(
      isUpstreamResultRelevantToQuery(unrelatedSeason, '现在就出发 第四季'),
    ).toBe(false);
    expect(
      isUpstreamResultRelevantToQuery(actualMatch, '现在就出发 第四季'),
    ).toBe(true);
    expect(
      isUpstreamResultRelevantToQuery(actualMatchNum, '现在就出发 第四季'),
    ).toBe(true);
  });

  test('keeps only relevant hit and disables pagination when 1 match is mixed into a 20-item dump', () => {
    const dumpItems = [
      makeResult('hit', '现在就出发第四季'),
      ...Array.from({ length: 19 }, (_, i) =>
        makeResult(`junk-${i}`, `随机短剧${i}`),
      ),
    ];

    const sanitized = sanitizeUpstreamSearchPage(
      dumpItems,
      120,
      '现在就出发 第四季',
    );

    expect(sanitized.isCatalogDump).toBe(true);
    expect(sanitized.results.map((r) => r.id)).toEqual(['hit']);
    expect(sanitized.effectivePageCount).toBe(1);
  });

  test('preserves small alias/actor result sets returned by legitimate sites', () => {
    const aliasResults = [makeResult('alias-1', '盗梦空间')];

    const sanitized = sanitizeUpstreamSearchPage(aliasResults, 1, 'Inception');

    expect(sanitized.isCatalogDump).toBe(false);
    expect(sanitized.results).toHaveLength(1);
    expect(sanitized.effectivePageCount).toBe(1);
  });

  test('filterExactSourceMatches prefers strict match and falls back to compatible fuzzy match', () => {
    const exact = makeResult('1', '现在就出发第四季', { year: '2026' });
    const wrongYear = makeResult('2', '现在就出发第四季', { year: '2024' });
    const unrelated = makeResult('3', '现在就出发第一季', { year: '2023' });

    const matched = filterExactSourceMatches([exact, wrongYear, unrelated], {
      queryTitle: '现在就出发 第四季',
      year: '2026',
    });

    expect(matched.map((r) => r.id)).toEqual(['1']);
  });
});
