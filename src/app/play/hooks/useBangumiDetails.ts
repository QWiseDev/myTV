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
  const loadedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!videoDoubanId || videoDoubanId === 0) {
      if (loadedKeyRef.current !== null || bangumiDetails || movieDetails) {
        loadedKeyRef.current = null;
        activeRequestKeyRef.current = null;
        if (bangumiDetails) setBangumiDetails(null);
        if (movieDetails) setMovieDetails(null);
        setLoadingBangumiDetails(false);
        setLoadingMovieDetails(false);
      }
      return;
    }

    const isBangumi = isBangumiId(videoDoubanId);
    const requestKey = `${isBangumi ? 'bangumi' : 'douban'}:${videoDoubanId}`;

    // 仅当当前已加载数据属于同一个 douban/bangumi ID 时才跳过，
    // 切换影片或换源修正 douban_id 后必须重新加载
    if (
      loadedKeyRef.current === requestKey &&
      ((isBangumi && bangumiDetails) || (!isBangumi && movieDetails))
    ) {
      return;
    }

    if (activeRequestKeyRef.current === requestKey) {
      return;
    }

    // 跨 ID 或跨类型（Bangumi <-> 豆瓣影视）切换时，双侧旧详情均须清空，防止海报与简介串台
    if (loadedKeyRef.current && loadedKeyRef.current !== requestKey) {
      if (bangumiDetails) setBangumiDetails(null);
      if (movieDetails) setMovieDetails(null);
    }

    let cancelled = false;
    activeRequestKeyRef.current = requestKey;

    const loadMovieDetails = async () => {
      if (isBangumi) {
        setLoadingBangumiDetails(true);
        try {
          const bangumiData = await fetchBangumiDetailsWithCache(videoDoubanId);
          if (!cancelled && bangumiData) {
            loadedKeyRef.current = requestKey;
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
          loadedKeyRef.current = requestKey;
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
