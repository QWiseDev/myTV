/* eslint-disable @typescript-eslint/no-explicit-any -- 与原搜索页实现逐字一致 */
'use client';

import { useState } from 'react';

export type YouTubeContentType =
  | 'all'
  | 'music'
  | 'movie'
  | 'educational'
  | 'gaming'
  | 'sports'
  | 'news';

export type YouTubeSortOrder = 'relevance' | 'date' | 'rating' | 'viewCount' | 'title';

/**
 * YouTube 搜索：状态与请求逻辑拆分自搜索页原实现，URL 参数拼装、
 * 警告透传与错误文案原样保留。
 */
export function useYouTubeSearch() {
  const [youtubeResults, setYoutubeResults] = useState<any[] | null>(null);
  const [youtubeLoading, setYoutubeLoading] = useState(false);
  const [youtubeError, setYoutubeError] = useState<string | null>(null);
  const [youtubeWarning, setYoutubeWarning] = useState<string | null>(null);
  const [youtubeContentType, setYoutubeContentType] =
    useState<YouTubeContentType>('all');
  const [youtubeSortOrder, setYoutubeSortOrder] =
    useState<YouTubeSortOrder>('relevance');

  const handleYouTubeSearch = async (
    query: string,
    contentType: YouTubeContentType = youtubeContentType,
    sortOrder: YouTubeSortOrder = youtubeSortOrder,
  ) => {
    if (!query.trim()) return;

    setYoutubeLoading(true);
    setYoutubeError(null);
    setYoutubeWarning(null);
    setYoutubeResults(null);

    try {
      // 构建搜索URL，包含内容类型和排序参数
      let searchUrl = `/api/youtube/search?q=${encodeURIComponent(
        query.trim(),
      )}`;
      if (contentType && contentType !== 'all') {
        searchUrl += `&contentType=${contentType}`;
      }
      if (sortOrder && sortOrder !== 'relevance') {
        searchUrl += `&order=${sortOrder}`;
      }
      const response = await fetch(searchUrl);
      const data = await response.json();

      if (response.ok && data.success) {
        setYoutubeResults(data.videos || []);
        // 如果有警告信息，设置警告状态
        if (data.warning) {
          setYoutubeWarning(data.warning);
        }
      } else {
        setYoutubeError(data.error || 'YouTube搜索失败');
      }
    } catch (error: any) {
      console.error('YouTube搜索请求失败:', error);
      // 尝试提取具体的错误消息
      let errorMessage = 'YouTube搜索请求失败，请稍后重试';
      if (error.message) {
        errorMessage = error.message;
      } else if (typeof error === 'string') {
        errorMessage = error;
      }
      setYoutubeError(errorMessage);
    } finally {
      setYoutubeLoading(false);
    }
  };

  return {
    youtubeResults,
    setYoutubeResults,
    youtubeLoading,
    youtubeError,
    setYoutubeError,
    youtubeWarning,
    setYoutubeWarning,
    youtubeContentType,
    setYoutubeContentType,
    youtubeSortOrder,
    setYoutubeSortOrder,
    handleYouTubeSearch,
  };
}
