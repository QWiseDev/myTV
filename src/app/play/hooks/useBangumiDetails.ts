import { useEffect, useRef } from 'react';

import { getDoubanDetails } from '@/lib/douban.client';

import type { BangumiDetails, MovieDetails } from '@/app/play/types';

import { fetchBangumiDetailsWithCache, isBangumiId } from '../utils/bangumi';

interface UseBangumiDetailsOptions {
  videoDoubanId: number | null | undefined;
  bangumiDetails: BangumiDetails | null;
  setBangumiDetails: (data: BangumiDetails | null) => void;
  setLoadingBangumiDetails: (loading: boolean) => void;
  movieDetails: MovieDetails | null;
  setMovieDetails: (data: MovieDetails | null) => void;
  setLoadingMovieDetails: (loading: boolean) => void;
}

/**
 * 根据豆瓣 / Bangumi ID 获取详情数据，并管理缓存。
 */
export const useBangumiDetails = ({
  videoDoubanId,
  bangumiDetails,
  setBangumiDetails,
  setLoadingBangumiDetails,
  movieDetails,
  setMovieDetails,
  setLoadingMovieDetails,
}: UseBangumiDetailsOptions) => {
  const activeRequestKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!videoDoubanId || videoDoubanId === 0) {
      return;
    }

    const isBangumi = isBangumiId(videoDoubanId);
    if ((isBangumi && bangumiDetails) || (!isBangumi && movieDetails)) {
      return;
    }

    const requestKey = `${isBangumi ? 'bangumi' : 'douban'}:${videoDoubanId}`;
    if (activeRequestKeyRef.current === requestKey) {
      return;
    }

    let cancelled = false;
    activeRequestKeyRef.current = requestKey;

    const loadMovieDetails = async () => {
      if (isBangumi) {
        setLoadingBangumiDetails(true);
        try {
          const bangumiData = await fetchBangumiDetailsWithCache(videoDoubanId);
          if (!cancelled && bangumiData) {
            setBangumiDetails(bangumiData);
          }
        } catch (error) {
          console.error('加载 Bangumi 详情失败:', error);
        } finally {
          if (!cancelled) {
            setLoadingBangumiDetails(false);
          }
        }
        return;
      }

      setLoadingMovieDetails(true);
      try {
        const response = await getDoubanDetails(videoDoubanId.toString());
        if (!cancelled && response.code === 200 && response.data) {
          setMovieDetails(response.data);
        }
      } catch (error) {
        console.error('加载豆瓣详情失败:', error);
      } finally {
        if (!cancelled) {
          setLoadingMovieDetails(false);
        }
      }
    };

    loadMovieDetails();

    return () => {
      cancelled = true;
      if (activeRequestKeyRef.current === requestKey) {
        activeRequestKeyRef.current = null;
      }
    };
  }, [
    bangumiDetails,
    movieDetails,
    setBangumiDetails,
    setLoadingBangumiDetails,
    setLoadingMovieDetails,
    setMovieDetails,
    videoDoubanId,
  ]);
};
