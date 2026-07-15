import type { SearchResult } from '@/lib/types';

import {
  buildEpisodeProbeCacheKey,
  isLikelyHlsUrl,
  planEpisodeSourceChecks,
  runEpisodeSourceChecks,
} from '@/app/play/utils/episodeSourceCheck';

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

describe('episodeSourceCheck', () => {
  test('buildEpisodeProbeCacheKey: different episodes use different cache entries', () => {
    expect(buildEpisodeProbeCacheKey('s1-a', 0)).toBe('s1-a::episode-0');
    expect(buildEpisodeProbeCacheKey('s1-a', 1)).toBe('s1-a::episode-1');
  });

  test('isLikelyHlsUrl: recognises query strings and fragments', () => {
    expect(isLikelyHlsUrl('https://example.com/live.m3u8?token=1')).toBe(true);
    expect(isLikelyHlsUrl('https://example.com/live.m3u8#segment')).toBe(true);
    expect(isLikelyHlsUrl('https://example.com/live.mp4#segment')).toBe(false);
  });

  test('planEpisodeSourceChecks: current source is placed first', () => {
    const a = createSource({ id: 'a', source: 's1', source_name: 'S1' });
    const b = createSource({ id: 'b', source: 's2', source_name: 'S2' });
    const plan = planEpisodeSourceChecks({
      sources: [a, b],
      episodeIndex: 0,
      currentSource: 's2',
      currentId: 'b',
    });

    expect(plan[0].source.id).toBe('b');
  });

  test('planEpisodeSourceChecks: missing episode is marked as skipped', () => {
    const a = createSource({
      id: 'a',
      source: 's1',
      episodes: ['http://example.com/ep1.m3u8'],
    });
    const plan = planEpisodeSourceChecks({
      sources: [a],
      episodeIndex: 1,
      currentSource: 's1',
      currentId: 'a',
    });

    expect(plan[0].skippedReason).toBe('无此集');
  });

  test('runEpisodeSourceChecks: emits checking then success for a normal item', async () => {
    const a = createSource({
      id: 'a',
      source: 's1',
      episodes: ['http://example.com/ep1.m3u8'],
    });
    const plan = planEpisodeSourceChecks({
      sources: [a],
      episodeIndex: 0,
      currentSource: 's1',
      currentId: 'a',
    });

    const updates: Array<{ status: string }> = [];
    const controller = new AbortController();

    await runEpisodeSourceChecks({
      plan,
      signal: controller.signal,
      resolveUrl: async (item) => ({ url: item.episodeData }),
      probeUrl: async () => ({
        quality: '1080p',
        loadSpeed: '1.00 MB/s',
        pingTimeMs: 123,
      }),
      onUpdate: (next) => updates.push({ status: next.status }),
    });

    expect(updates.map((u) => u.status)).toEqual(['checking', 'success']);
  });

  test('runEpisodeSourceChecks: continues when resolveUrl returns skippedReason', async () => {
    const a = createSource({
      id: 'a',
      source: 's1',
      episodes: ['http://example.com/a.m3u8'],
    });
    const b = createSource({
      id: 'b',
      source: 's2',
      episodes: ['http://example.com/b.m3u8'],
    });
    const plan = planEpisodeSourceChecks({
      sources: [a, b],
      episodeIndex: 0,
      currentSource: 's1',
      currentId: 'a',
    });

    const controller = new AbortController();
    const probeCalls: string[] = [];
    const finalStatuses: Record<string, string> = {};

    await runEpisodeSourceChecks({
      plan,
      signal: controller.signal,
      resolveUrl: async (item) =>
        item.source.id === 'a'
          ? { skippedReason: '跳过A' }
          : { url: item.episodeData },
      probeUrl: async (url) => {
        probeCalls.push(url);
        return { quality: '720p', loadSpeed: '100 KB/s', pingTimeMs: 50 };
      },
      onUpdate: (next) => {
        if (next.status !== 'checking') {
          finalStatuses[next.sourceKey] = next.status;
        }
      },
    });

    expect(Object.values(finalStatuses).sort()).toEqual(['skipped', 'success']);
    expect(probeCalls).toHaveLength(1);
  });

  test('runEpisodeSourceChecks: abort cancels remaining items', async () => {
    const a = createSource({
      id: 'a',
      source: 's1',
      episodes: ['http://example.com/a.m3u8'],
    });
    const b = createSource({
      id: 'b',
      source: 's2',
      episodes: ['http://example.com/b.m3u8'],
    });
    const c = createSource({
      id: 'c',
      source: 's3',
      episodes: ['http://example.com/c.m3u8'],
    });
    const plan = planEpisodeSourceChecks({
      sources: [a, b, c],
      episodeIndex: 0,
      currentSource: 's1',
      currentId: 'a',
    });

    const controller = new AbortController();
    const finals: Record<string, string> = {};
    let probeCount = 0;

    await runEpisodeSourceChecks({
      plan,
      signal: controller.signal,
      resolveUrl: async (item) => ({ url: item.episodeData }),
      probeUrl: async () => {
        probeCount += 1;
        if (probeCount === 1) {
          controller.abort();
        }
        return { quality: '720p', loadSpeed: '100 KB/s', pingTimeMs: 50 };
      },
      onUpdate: (next) => {
        if (next.status !== 'checking') {
          finals[next.sourceKey] = next.status;
        }
      },
    });

    // 第一个成功，其余被取消
    const statuses = Object.values(finals);
    expect(statuses).toContain('success');
    expect(statuses).toContain('cancelled');
  });
});
