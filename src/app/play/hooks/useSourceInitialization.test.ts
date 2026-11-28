import { renderHook, waitFor } from '@testing-library/react';
import { act } from 'react';

import { cachedGet } from '@/lib/api-cache.client';
import type { SearchResult } from '@/lib/types';

import type { UseSourceInitializationParams } from './useSourceInitialization';
import { useSourceInitialization } from './useSourceInitialization';

jest.mock('@/lib/api-cache.client', () => ({
  cachedGet: jest.fn(),
}));

jest.mock('../utils/sourcePreference', () => ({
  ...jest.requireActual('../utils/sourcePreference'),
  preferBestSource: jest.fn(async (sources) => sources[0]),
}));

const mockedCachedGet = cachedGet as jest.MockedFunction<typeof cachedGet>;

const mockCachedResult = <T>(value: T): T => value;

const detail: SearchResult = {
  id: 'video-1',
  source: 'site-a',
  source_name: '站点 A',
  title: '测试影片',
  year: '2024',
  poster: 'https://example.com/poster.jpg',
  episodes: ['https://example.com/ep1.m3u8'],
  episodes_titles: ['第 1 集'],
  type_name: '剧情',
  douban_id: 123,
};

function createParams(
  overrides: Partial<UseSourceInitializationParams> = {},
): UseSourceInitializationParams {
  return {
    currentSource: 'site-a',
    currentId: 'video-1',
    videoTitle: '测试影片',
    searchTitle: '测试影片',
    searchType: 'tv',
    needPreferRef: { current: false },
    optimizationEnabled: true,
    deviceInfo: {
      userAgent: 'jest',
      isIOS: false,
      isIOS13: false,
      isMobile: false,
    },
    setNeedPrefer: jest.fn(),
    setCurrentSource: jest.fn(),
    setCurrentId: jest.fn(),
    setVideoTitle: jest.fn(),
    setVideoYear: jest.fn(),
    setVideoCover: jest.fn(),
    setVideoDoubanId: jest.fn(),
    videoTitleRef: { current: '测试影片' },
    videoYearRef: { current: '2024' },
    videoDoubanIdRef: { current: 123 },
    setDetail: jest.fn(),
    setAvailableSources: jest.fn(),
    setCurrentEpisodeIndex: jest.fn(),
    currentEpisodeIndexRef: { current: 0 },
    setLoading: jest.fn(),
    setError: jest.fn(),
    setLoadingStage: jest.fn(),
    setLoadingMessage: jest.fn(),
    setSourceSearchLoading: jest.fn(),
    setSourceSearchError: jest.fn(),
    setSpeedTestProgress: jest.fn(),
    errorHandler: { handleError: jest.fn() },
    ...overrides,
  };
}

describe('useSourceInitialization', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockedCachedGet.mockImplementation(async (url) => {
      if (url === '/api/detail') {
        return mockCachedResult(detail);
      }
      if (url === '/api/search') {
        return mockCachedResult({ results: [] });
      }
      throw new Error(`unexpected url: ${url}`);
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  test('loads explicit source detail and starts background source search', async () => {
    const params = createParams();

    renderHook(() => useSourceInitialization(params));

    await waitFor(() => {
      expect(params.setDetail).toHaveBeenCalledWith(detail);
    });

    expect(mockedCachedGet).toHaveBeenCalledWith('/api/detail', {
      source: 'site-a',
      id: 'video-1',
    });

    await waitFor(() => {
      expect(mockedCachedGet).toHaveBeenCalledWith('/api/search', {
        q: '测试影片',
      });
    });
  });

  test('background source search merges other sites after explicit detail init', async () => {
    const otherSource: SearchResult = {
      ...detail,
      id: 'video-2',
      source: 'site-b',
      source_name: '站点 B',
    };
    mockedCachedGet.mockImplementation(async (url) => {
      if (url === '/api/detail') {
        return mockCachedResult(detail);
      }
      if (url === '/api/search') {
        return mockCachedResult({ results: [otherSource] });
      }
      throw new Error(`unexpected url: ${url}`);
    });
    const params = createParams();

    renderHook(() => useSourceInitialization(params));

    await waitFor(() => {
      expect(params.setDetail).toHaveBeenCalledWith(detail);
    });

    expect(mockedCachedGet).toHaveBeenCalledWith('/api/search', {
      q: '测试影片',
    });
    await waitFor(() => {
      expect(params.setAvailableSources).toHaveBeenLastCalledWith([
        detail,
        otherSource,
      ]);
    });
  });

  test('skips reinitialization and exits loading when route params already match current detail', async () => {
    const switchedDetail: SearchResult = {
      ...detail,
      id: 'video-2',
      source: 'site-b',
      source_name: '站点 B',
    };
    const params = createParams({
      currentSource: 'site-b',
      currentId: 'video-2',
      currentSourceRef: { current: 'site-b' },
      currentIdRef: { current: 'video-2' },
      detailRef: { current: switchedDetail },
    });

    renderHook(() => useSourceInitialization(params));

    await act(async () => {
      await Promise.resolve();
    });

    expect(params.setLoading).toHaveBeenCalledWith(false);
    expect(params.setAvailableSources).not.toHaveBeenCalled();

    await waitFor(() => {
      expect(mockedCachedGet).toHaveBeenCalledWith('/api/search', {
        q: '测试影片',
      });
    });
  });

  test('shows an error when title search finds no playable source', async () => {
    const params = createParams({
      currentSource: '',
      currentId: '',
      videoTitle: '魔法姐妹露露特莉莉',
      searchTitle: '魔法姐妹露露特莉莉',
      searchType: '',
      videoTitleRef: { current: '魔法姐妹露露特莉莉' },
      videoYearRef: { current: '2026' },
      videoDoubanIdRef: { current: 501796 },
    });

    renderHook(() => useSourceInitialization(params));

    await waitFor(() => {
      expect(params.setError).toHaveBeenCalledWith('未找到匹配结果');
    });

    expect(params.errorHandler.handleError).toHaveBeenCalledWith(
      expect.objectContaining({ message: '未找到匹配结果' }),
    );
    expect(params.setLoading).toHaveBeenLastCalledWith(false);
  });

  test('keeps fallback metadata when explicit source detail has empty title', async () => {
    const emptyTitleDetail: SearchResult = {
      ...detail,
      title: '',
      year: '',
      douban_id: 0,
    };
    mockedCachedGet.mockImplementation(async (url) => {
      if (url === '/api/detail') {
        return mockCachedResult(emptyTitleDetail);
      }
      if (url === '/api/search') {
        return mockCachedResult({ results: [] });
      }
      throw new Error(`unexpected url: ${url}`);
    });
    window.history.replaceState(
      {},
      '',
      '/play?source=site-a&id=video-1&title=&year=2024&stitle=%E8%8E%AB%E7%A6%BB&stype=tv',
    );
    const params = createParams({
      videoTitle: '',
      searchTitle: '莫离',
      fallbackTitle: '历史标题',
      fallbackDoubanId: 456,
      videoTitleRef: { current: '' },
      videoYearRef: { current: '2024' },
      videoDoubanIdRef: { current: 0 },
    });

    renderHook(() => useSourceInitialization(params));

    await waitFor(() => {
      expect(params.setVideoTitle).toHaveBeenCalledWith('历史标题');
    });

    expect(params.setVideoDoubanId).toHaveBeenCalledWith(456);
    expect(window.location.search).toContain(
      'title=%E5%8E%86%E5%8F%B2%E6%A0%87%E9%A2%98',
    );
    expect(window.location.search).toContain('douban_id=456');
  });

  test('keeps route poster as fallback cover during explicit source initialization', async () => {
    const routePoster =
      'https://img1.doubanio.com/view/photo/s_ratio_poster/public/p2884182275.jpg';
    const params = createParams({
      fallbackCover: routePoster,
    });

    renderHook(() => useSourceInitialization(params));

    await waitFor(() => {
      expect(params.setDetail).toHaveBeenCalledWith({
        ...detail,
        poster: routePoster,
      });
    });

    expect(params.setVideoCover).toHaveBeenCalledWith(routePoster);
    // 封面仍作为 fallbackCover 生效，但不再写进地址栏
    expect(new URL(window.location.href).searchParams.get('poster')).toBeNull();
  });

  test('prioritizes explicit URL source and id even when prefer=true and optimizationEnabled=true', async () => {
    const requestedDetail: SearchResult = {
      ...detail,
      id: '39394',
      source: 'site-requested',
      source_name: '链接指定源',
    };
    const otherSource: SearchResult = {
      ...detail,
      id: 'other-1',
      source: 'dyttzyapi.com',
      source_name: '电影天堂',
    };
    mockedCachedGet.mockImplementation(async (url, queryParams) => {
      if (url === '/api/detail') {
        expect(queryParams).toEqual({
          source: 'site-requested',
          id: '39394',
        });
        return mockCachedResult(requestedDetail);
      }
      if (url === '/api/search') {
        return mockCachedResult({ results: [otherSource] });
      }
      throw new Error(`unexpected url: ${url}`);
    });
    const params = createParams({
      currentSource: 'site-requested',
      currentId: '39394',
      needPreferRef: { current: true },
      optimizationEnabled: true,
    });

    renderHook(() => useSourceInitialization(params));

    await waitFor(() => {
      expect(params.setDetail).toHaveBeenCalledWith(requestedDetail);
    });
    expect(params.setCurrentSource).toHaveBeenCalledWith('site-requested');
    expect(params.setCurrentId).toHaveBeenCalledWith('39394');
    // 就绪后直接结束加载，不再人为阻塞 1000ms
    expect(params.setLoading).toHaveBeenLastCalledWith(false);
  });

  test('isolates adult source (jp98.vip) enrichment to adult group and never mixes regular sources', async () => {
    const adultDetail: SearchResult = {
      id: '39394',
      source: 'jp98.vip',
      source_name: '黄果',
      title: '《裙下之臣：逃出魔窟》',
      year: '2026',
      poster: '',
      episodes: ['https://jp98.vip/ep1.m3u8'],
      episodes_titles: ['第 1 集'],
      type_name: 'AI短剧',
      douban_id: 123,
      adult: true,
    };
    const regularSimilarDrama: SearchResult = {
      id: '999',
      source: 'dyttzyapi.com',
      source_name: '电影天堂',
      title: '裙下之臣',
      year: '2026',
      poster: '',
      episodes: ['https://regular.example/1.m3u8'],
      episodes_titles: ['第 1 集'],
    };
    mockedCachedGet.mockImplementation(async (url, queryParams) => {
      if (url === '/api/detail') {
        return mockCachedResult(adultDetail);
      }
      if (url === '/api/search') {
        // 成人源仅允许搜索 adult 分组，且排除当前源
        expect(queryParams).toEqual(
          expect.objectContaining({
            group: 'adult',
            forSource: 'jp98.vip',
          }),
        );
        return mockCachedResult({ results: [] });
      }
      throw new Error(`unexpected url: ${url}`);
    });
    const params = createParams({
      currentSource: 'jp98.vip',
      currentId: '39394',
      videoTitle: '《裙下之臣：逃出魔窟》',
      searchTitle: '',
      videoTitleRef: { current: '《裙下之臣：逃出魔窟》' },
      videoYearRef: { current: '2026' },
      needPreferRef: { current: true },
    });

    renderHook(() => useSourceInitialization(params));

    await waitFor(() => {
      expect(params.setDetail).toHaveBeenCalledWith(adultDetail);
    });
    await waitFor(() => {
      expect(mockedCachedGet).toHaveBeenCalledWith(
        '/api/search',
        expect.objectContaining({ group: 'adult', forSource: 'jp98.vip' }),
      );
    });
    expect(params.setAvailableSources).toHaveBeenCalledTimes(1);
    expect(params.setAvailableSources).toHaveBeenCalledWith([adultDetail]);
    expect(params.setAvailableSources).not.toHaveBeenCalledWith(
      expect.arrayContaining([regularSimilarDrama]),
    );
  });

  test('passes forSource on detail fallback and excludes unrelated similar-named dramas', async () => {
    const similarWrongDrama: SearchResult = {
      id: 'wrong-1',
      source: 'other-site',
      source_name: '其他源',
      title: '裙下之臣',
      year: '2026',
      poster: '',
      episodes: ['https://other.example/1.m3u8'],
      episodes_titles: ['第 1 集'],
    };
    mockedCachedGet.mockImplementation(async (url, queryParams) => {
      if (url === '/api/detail') {
        throw new Error('upstream failed');
      }
      if (url === '/api/search') {
        expect(queryParams).toEqual(
          expect.objectContaining({ forSource: 'jp98.vip' }),
        );
        return mockCachedResult({ results: [similarWrongDrama] });
      }
      throw new Error(`unexpected url: ${url}`);
    });
    const params = createParams({
      currentSource: 'jp98.vip',
      currentId: '39394',
      videoTitle: '《裙下之臣：逃出魔窟》',
      searchTitle: '',
      videoTitleRef: { current: '《裙下之臣：逃出魔窟》' },
      videoYearRef: { current: '2026' },
      searchType: '',
    });

    renderHook(() => useSourceInitialization(params));

    await waitFor(() => {
      expect(params.setError).toHaveBeenCalledWith('未找到匹配结果');
    });
    expect(params.setDetail).not.toHaveBeenCalled();
  });

  test('preserves switched source on same route signature but re-initializes on client navigation to another media', async () => {
    const movieADetail: SearchResult = {
      ...detail,
      source: 'site-a',
      id: 'video-1',
      title: '影片A',
    };
    const switchedDetail: SearchResult = {
      ...detail,
      source: 'site-switched',
      id: 'video-switched',
      title: '影片A',
    };
    const movieBDetail: SearchResult = {
      ...detail,
      source: 'site-b',
      id: 'video-2',
      title: '影片B',
    };

    mockedCachedGet.mockImplementation(async (url, queryParams) => {
      if (url === '/api/detail') {
        if (queryParams?.source === 'site-a') {
          return mockCachedResult(movieADetail);
        }
        if (queryParams?.source === 'site-b') {
          return mockCachedResult(movieBDetail);
        }
      }
      if (url === '/api/search') {
        return mockCachedResult({ results: [] });
      }
      throw new Error(`unexpected request: ${url}`);
    });

    const currentSourceRef = { current: 'site-a' };
    const currentIdRef = { current: 'video-1' };
    const detailRef = { current: null as SearchResult | null };

    const initialProps = createParams({
      currentSource: 'site-a',
      currentId: 'video-1',
      videoTitle: '影片A',
      searchTitle: '',
      currentSourceRef,
      currentIdRef,
      detailRef,
      setDetail: jest.fn((next) => {
        detailRef.current = next;
      }),
    });

    const { rerender } = renderHook(
      (props: typeof initialProps) => useSourceInitialization(props),
      { initialProps },
    );

    await waitFor(() => {
      expect(initialProps.setDetail).toHaveBeenCalledWith(movieADetail);
    });

    // 模拟用户手动换源，而外部 routeParams 仍停留在旧签名（非路由依赖触发重渲染）
    currentSourceRef.current = 'site-switched';
    currentIdRef.current = 'video-switched';
    detailRef.current = switchedDetail;
    (initialProps.setDetail as jest.Mock).mockClear();

    rerender({
      ...initialProps,
      optimizationEnabled: true,
    });

    await waitFor(() => {
      expect(initialProps.setLoading).toHaveBeenLastCalledWith(false);
    });
    expect(initialProps.setDetail).not.toHaveBeenCalledWith(movieADetail);

    // 模拟播放页内通过搜索热榜或继续观看进行客户端路由跳转到新影片 B
    rerender({
      ...initialProps,
      currentSource: 'site-b',
      currentId: 'video-2',
      videoTitle: '影片B',
    });

    await waitFor(() => {
      expect(initialProps.setDetail).toHaveBeenCalledWith(movieBDetail);
    });
    expect(initialProps.setCurrentSource).toHaveBeenLastCalledWith('site-b');
    expect(initialProps.setCurrentId).toHaveBeenLastCalledWith('video-2');
  });

  test('does not re-fetch or reorder availableSources when route updates after switching source on a populated list', async () => {
    const sourceA: SearchResult = { ...detail, source: 'site-a', id: 'v1' };
    const sourceB: SearchResult = {
      ...detail,
      source: 'site-b',
      id: 'v2',
      source_name: '站点 B',
    };
    const availableSourcesRef = { current: [sourceA, sourceB] };
    const params = createParams({
      currentSource: 'site-b',
      currentId: 'v2',
      currentSourceRef: { current: 'site-b' },
      currentIdRef: { current: 'v2' },
      detailRef: { current: sourceB },
      availableSourcesRef,
    });

    renderHook(() => useSourceInitialization(params));

    await act(async () => {
      await Promise.resolve();
    });

    expect(params.setLoading).toHaveBeenCalledWith(false);
    expect(mockedCachedGet).not.toHaveBeenCalledWith(
      '/api/search',
      expect.anything(),
    );
    expect(params.setAvailableSources).not.toHaveBeenCalled();
  });
});
