import type { SearchResult } from '@/lib/types';

import {
  clearSearchCache,
  getCachedSearchPage,
  getSearchCacheStats,
  MAX_SEARCH_CACHE_SIZE,
  normalizeSearchCacheQuery,
  runSearchPageSingleFlight,
  SEARCH_CACHE_TTL_BY_STATUS,
  setCachedSearchPage,
} from './search-cache';

function makeResult(id: string): SearchResult {
  return {
    id,
    title: `影片-${id}`,
    poster: '',
    episodes: [`https://cdn.example/${id}.m3u8`],
    episodes_titles: ['第1集'],
    source: 'src-a',
    source_name: '源A',
    year: '2026',
  };
}

describe('search-cache O(1) LRU 与 Single-Flight', () => {
  beforeEach(() => {
    clearSearchCache();
  });

  test('规范化搜索词：大小写与多余空白命中同一缓存项', () => {
    expect(normalizeSearchCacheQuery('  Spider   Man  ')).toBe('spider man');

    setCachedSearchPage(
      'src-a',
      '  Spider   Man ',
      1,
      'ok',
      [makeResult('1')],
      2,
      1000,
    );
    const hit = getCachedSearchPage('src-a', 'spider man', 1, 2000);
    expect(hit?.status).toBe('ok');
    expect(hit?.data).toHaveLength(1);
    expect(hit?.pageCount).toBe(2);
  });

  test('按状态分级 TTL：timeout 30s、empty/forbidden 2m、ok 10m', () => {
    setCachedSearchPage(
      'src-a',
      'q-timeout',
      1,
      'timeout',
      [],
      undefined,
      1000,
    );
    setCachedSearchPage('src-a', 'q-empty', 1, 'empty', [], undefined, 1000);
    setCachedSearchPage('src-a', 'q-ok', 1, 'ok', [makeResult('1')], 1, 1000);

    // 31s 后 timeout 已过期，但 empty 和 ok 仍有效
    const t31s = 1000 + SEARCH_CACHE_TTL_BY_STATUS.timeout + 1;
    expect(getCachedSearchPage('src-a', 'q-timeout', 1, t31s)).toBeNull();
    expect(getCachedSearchPage('src-a', 'q-empty', 1, t31s)?.status).toBe(
      'empty',
    );
    expect(getCachedSearchPage('src-a', 'q-ok', 1, t31s)?.status).toBe('ok');

    // 2m 后 empty 已过期，ok 仍有效
    const t2m = 1000 + SEARCH_CACHE_TTL_BY_STATUS.empty + 1;
    expect(getCachedSearchPage('src-a', 'q-empty', 1, t2m)).toBeNull();
    expect(getCachedSearchPage('src-a', 'q-ok', 1, t2m)?.status).toBe('ok');
  });

  test('写入时实时强制 MAX_SEARCH_CACHE_SIZE 上限，且为真 LRU（热项不被淘汰）', () => {
    const base = 10_000;
    for (let i = 0; i < MAX_SEARCH_CACHE_SIZE; i += 1) {
      setCachedSearchPage(
        'src-a',
        `q-${i}`,
        1,
        'ok',
        [makeResult(String(i))],
        1,
        base,
      );
    }
    expect(getSearchCacheStats().size).toBe(MAX_SEARCH_CACHE_SIZE);

    // 读取 q-0 刷新其 LRU 活跃度，此时最久未使用的是 q-1
    expect(getCachedSearchPage('src-a', 'q-0', 1, base + 10)).not.toBeNull();

    // 再写入 1 条，应淘汰 q-1 而保留热项 q-0
    setCachedSearchPage(
      'src-a',
      'q-new',
      1,
      'ok',
      [makeResult('new')],
      1,
      base + 20,
    );
    expect(getSearchCacheStats().size).toBe(MAX_SEARCH_CACHE_SIZE);
    expect(getCachedSearchPage('src-a', 'q-0', 1, base + 30)).not.toBeNull();
    expect(getCachedSearchPage('src-a', 'q-1', 1, base + 30)).toBeNull();
  });

  test('Single-Flight 合并并发相同查询，结束后释放 inFlight 槽位', async () => {
    let resolveFetch: (v: string) => void = () => undefined;
    const fetcher = jest.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveFetch = resolve;
        }),
    );

    const p1 = runSearchPageSingleFlight('src-a', '后会友期', 1, fetcher);
    const p2 = runSearchPageSingleFlight('src-a', '  后会友期  ', 1, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(getSearchCacheStats().inFlight).toBe(1);
    expect(getSearchCacheStats().coalesced).toBe(1);

    resolveFetch('done');
    await expect(Promise.all([p1, p2])).resolves.toEqual(['done', 'done']);
    expect(getSearchCacheStats().inFlight).toBe(0);
  });

  test('clearSearchCache 支持按源精准失效与全量清空', () => {
    setCachedSearchPage('src-a', 'k1', 1, 'ok', [makeResult('1')], 1, 1000);
    setCachedSearchPage('src-a', 'k2', 2, 'ok', [makeResult('2')], 1, 1000);
    setCachedSearchPage('src-b', 'k1', 1, 'ok', [makeResult('3')], 1, 1000);

    expect(clearSearchCache('src-a')).toBe(2);
    expect(getCachedSearchPage('src-a', 'k1', 1, 2000)).toBeNull();
    expect(getCachedSearchPage('src-b', 'k1', 1, 2000)).not.toBeNull();

    expect(clearSearchCache()).toBe(1);
    expect(getSearchCacheStats().size).toBe(0);
  });
});
