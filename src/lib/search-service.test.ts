import {
  filterSearchResults,
  MAX_SEARCH_QUERY_LENGTH,
  normalizeSearchQuery,
} from './search-service';
import type { SearchResult } from './types';

function makeResult(overrides: Partial<SearchResult> = {}): SearchResult {
  return {
    id: '1',
    title: '测试影片',
    poster: '',
    episodes: ['https://cdn.example/1.m3u8'],
    episodes_titles: ['第1集'],
    source: 'src-a',
    source_name: '源A',
    year: '2026',
    type_name: '剧情',
    ...overrides,
  };
}

describe('search-service 纯逻辑工具', () => {
  test('normalizeSearchQuery 清理空白并截断超长关键词', () => {
    expect(normalizeSearchQuery(null)).toBe('');
    expect(normalizeSearchQuery('   ')).toBe('');
    expect(normalizeSearchQuery('  后会友期  ')).toBe('后会友期');
    const longQuery = 'a'.repeat(MAX_SEARCH_QUERY_LENGTH + 50);
    expect(normalizeSearchQuery(longQuery)).toHaveLength(
      MAX_SEARCH_QUERY_LENGTH,
    );
  });

  test('filterSearchResults 按分组过滤黄词或打 adult 标记', () => {
    const items = [
      makeResult({ id: '1', type_name: '剧情' }),
      makeResult({ id: '2', type_name: '伦理片' }),
    ];

    // 常规搜索默认过滤黄词
    const regular = filterSearchResults(items, {
      isAdultSearch: false,
      disableYellowFilter: false,
    });
    expect(regular.map((i) => i.id)).toEqual(['1']);

    // 关闭过滤时全部保留
    const unfiltered = filterSearchResults(items, {
      isAdultSearch: false,
      disableYellowFilter: true,
    });
    expect(unfiltered.map((i) => i.id)).toEqual(['1', '2']);

    // 成人搜索不过滤且统一打 adult: true
    const adult = filterSearchResults(items, {
      isAdultSearch: true,
      disableYellowFilter: false,
    });
    expect(adult.map((i) => ({ id: i.id, adult: i.adult }))).toEqual([
      { id: '1', adult: true },
      { id: '2', adult: true },
    ]);
  });
});
