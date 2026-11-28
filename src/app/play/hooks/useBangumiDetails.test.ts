import { renderHook, waitFor } from '@testing-library/react';

import { getDoubanDetails } from '@/lib/douban.client';

import { useBangumiDetails } from './useBangumiDetails';
import { fetchBangumiDetailsWithCache } from '../utils/bangumi';

jest.mock('@/lib/douban.client', () => ({
  getDoubanDetails: jest.fn(),
}));

jest.mock('../utils/bangumi', () => ({
  fetchBangumiDetailsWithCache: jest.fn(),
  isBangumiId: (id: number) => id > 0 && id < 1_000_000,
}));

const mockGetDoubanDetails = getDoubanDetails as jest.MockedFunction<
  typeof getDoubanDetails
>;
const mockFetchBangumiDetails =
  fetchBangumiDetailsWithCache as jest.MockedFunction<
    typeof fetchBangumiDetailsWithCache
  >;

describe('useBangumiDetails', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('clears stale bangumi details when switching to a douban movie or zero douban_id', async () => {
    const bangumiData = {
      rating: { score: '8.8' },
      tags: [{ name: '科幻' }],
      summary: '旧番剧简介',
      images: { large: 'https://bgm.example/cover.jpg' },
    };
    const movieData = {
      rate: '7.9',
      year: '2026',
      poster: 'https://douban.example/poster.jpg',
      intro: '新电影简介',
    };

    mockFetchBangumiDetails.mockResolvedValue(bangumiData);
    mockGetDoubanDetails.mockResolvedValue({
      code: 200,
      message: 'ok',
      data: movieData,
    } as never);

    let currentBangumi = null as typeof bangumiData | null;
    let currentMovie = null as typeof movieData | null;
    const setBangumiDetails = jest.fn((next) => {
      currentBangumi = next;
    });
    const setMovieDetails = jest.fn((next) => {
      currentMovie = next;
    });

    const { rerender } = renderHook(
      ({ doubanId }: { doubanId: number }) =>
        useBangumiDetails({
          videoDoubanId: doubanId,
          bangumiDetails: currentBangumi,
          setBangumiDetails,
          setLoadingBangumiDetails: jest.fn(),
          movieDetails: currentMovie,
          setMovieDetails,
          setLoadingMovieDetails: jest.fn(),
        }),
      { initialProps: { doubanId: 400_123 } },
    );

    await waitFor(() => {
      expect(setBangumiDetails).toHaveBeenCalledWith(bangumiData);
    });

    // 切换到普通豆瓣电影 ID：必须同时清空旧的 bangumiDetails
    rerender({ doubanId: 35_000_001 });
    await waitFor(() => {
      expect(setBangumiDetails).toHaveBeenCalledWith(null);
      expect(setMovieDetails).toHaveBeenCalledWith(movieData);
    });

    // 切换到无豆瓣 ID（0）：必须清空残留详情
    rerender({ doubanId: 0 });
    await waitFor(() => {
      expect(setMovieDetails).toHaveBeenLastCalledWith(null);
    });
  });
});
