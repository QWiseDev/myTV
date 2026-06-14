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

  test('loads explicit source detail before running background source search', async () => {
    const params = createParams();

    renderHook(() => useSourceInitialization(params));

    await waitFor(() => {
      expect(params.setDetail).toHaveBeenCalledWith(detail);
    });

    expect(mockedCachedGet).toHaveBeenCalledTimes(1);
    expect(mockedCachedGet).toHaveBeenCalledWith('/api/detail', {
      source: 'site-a',
      id: 'video-1',
    });
    expect(mockedCachedGet).not.toHaveBeenCalledWith('/api/search', {
      q: expect.any(String),
    });

    act(() => {
      jest.advanceTimersByTime(1000);
    });

    await waitFor(() => {
      expect(mockedCachedGet).toHaveBeenCalledWith('/api/search', {
        q: '测试影片',
      });
    });
  });

  test('manual source loading searches other sites after explicit detail init', async () => {
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

    const { result } = renderHook(() => useSourceInitialization(params));

    await waitFor(() => {
      expect(params.setDetail).toHaveBeenCalledWith(detail);
    });

    await act(async () => {
      await result.current.loadAvailableSources();
    });

    expect(mockedCachedGet).toHaveBeenCalledWith('/api/search', {
      q: '测试影片',
    });
    expect(params.setAvailableSources).toHaveBeenLastCalledWith([
      detail,
      otherSource,
    ]);
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
});
