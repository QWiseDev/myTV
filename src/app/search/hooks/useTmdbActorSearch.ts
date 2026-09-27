/* eslint-disable @typescript-eslint/no-explicit-any -- 与原搜索页实现逐字一致 */
'use client';

import { useState } from 'react';

import { TMDBFilterState } from '@/components/TMDBFilterPanel';

/**
 * TMDB 演员搜索：状态与请求逻辑拆分自搜索页原实现，筛选参数拼装
 * 顺序、code === 200 判断与错误文案原样保留。
 */
export function useTmdbActorSearch() {
  const [tmdbActorResults, setTmdbActorResults] = useState<any[] | null>(null);
  const [tmdbActorLoading, setTmdbActorLoading] = useState(false);
  const [tmdbActorError, setTmdbActorError] = useState<string | null>(null);
  const [tmdbActorType, setTmdbActorType] = useState<'movie' | 'tv'>('movie');

  // TMDB筛选状态
  const [tmdbFilterState, setTmdbFilterState] = useState<TMDBFilterState>({
    startYear: undefined,
    endYear: undefined,
    minRating: undefined,
    maxRating: undefined,
    minPopularity: undefined,
    maxPopularity: undefined,
    minVoteCount: undefined,
    minEpisodeCount: undefined,
    genreIds: [],
    languages: [],
    onlyRated: false,
    sortBy: 'popularity',
    sortOrder: 'desc',
    limit: undefined, // 移除默认限制，显示所有结果
  });

  const handleTmdbActorSearch = async (
    query: string,
    type = tmdbActorType,
    filterState = tmdbFilterState,
  ) => {
    if (!query.trim()) return;

    setTmdbActorLoading(true);
    setTmdbActorError(null);
    setTmdbActorResults(null);

    try {
      // 构建筛选参数
      const params = new URLSearchParams({
        actor: query.trim(),
        type: type,
      });

      // 只有设置了limit且大于0时才添加limit参数
      if (filterState.limit && filterState.limit > 0) {
        params.append('limit', filterState.limit.toString());
      }

      // 添加筛选参数
      if (filterState.startYear)
        params.append('startYear', filterState.startYear.toString());
      if (filterState.endYear)
        params.append('endYear', filterState.endYear.toString());
      if (filterState.minRating)
        params.append('minRating', filterState.minRating.toString());
      if (filterState.maxRating)
        params.append('maxRating', filterState.maxRating.toString());
      if (filterState.minPopularity)
        params.append('minPopularity', filterState.minPopularity.toString());
      if (filterState.maxPopularity)
        params.append('maxPopularity', filterState.maxPopularity.toString());
      if (filterState.minVoteCount)
        params.append('minVoteCount', filterState.minVoteCount.toString());
      if (filterState.minEpisodeCount)
        params.append(
          'minEpisodeCount',
          filterState.minEpisodeCount.toString(),
        );
      if (filterState.genreIds && filterState.genreIds.length > 0)
        params.append('genreIds', filterState.genreIds.join(','));
      if (filterState.languages && filterState.languages.length > 0)
        params.append('languages', filterState.languages.join(','));
      if (filterState.onlyRated) params.append('onlyRated', 'true');
      if (filterState.sortBy) params.append('sortBy', filterState.sortBy);
      if (filterState.sortOrder)
        params.append('sortOrder', filterState.sortOrder);

      // 调用TMDB API端点
      const response = await fetch(`/api/tmdb/actor?${params.toString()}`);
      const data = await response.json();

      if (response.ok && data.code === 200) {
        setTmdbActorResults(data.list || []);
      } else {
        setTmdbActorError(data.error || data.message || '搜索演员失败');
      }
    } catch (error: any) {
      console.error('TMDB演员搜索请求失败:', error);
      setTmdbActorError('搜索演员失败，请稍后重试');
    } finally {
      setTmdbActorLoading(false);
    }
  };

  return {
    tmdbActorResults,
    setTmdbActorResults,
    tmdbActorLoading,
    tmdbActorError,
    setTmdbActorError,
    tmdbActorType,
    setTmdbActorType,
    tmdbFilterState,
    setTmdbFilterState,
    handleTmdbActorSearch,
  };
}
