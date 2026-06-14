import { useEffect, useState } from 'react';

import {
  deleteFavorite,
  generateStorageKey,
  isFavorited,
  saveFavorite,
  subscribeToDataUpdates,
} from '@/lib/db.client';
import type { Favorite, SearchResult } from '@/lib/types';

interface UseFavoriteOptions {
  currentSource: string;
  currentId: string;
  videoTitle: string;
  detail: SearchResult | null;
  searchTitle: string;
}

export const useFavorite = ({
  currentSource,
  currentId,
  videoTitle,
  detail,
  searchTitle,
}: UseFavoriteOptions) => {
  const [favorited, setFavorited] = useState(false);

  // 检查收藏状态
  useEffect(() => {
    if (!currentSource || !currentId) return;
    (async () => {
      try {
        const fav = await isFavorited(currentSource, currentId);
        setFavorited(fav);
      } catch (err) {
        console.error('检查收藏状态失败:', err);
      }
    })();
  }, [currentSource, currentId]);

  // 监听收藏数据更新事件
  useEffect(() => {
    if (!currentSource || !currentId) return;

    const unsubscribe = subscribeToDataUpdates<Record<string, Favorite>>(
      'favoritesUpdated',
      (favorites) => {
        const key = generateStorageKey(currentSource, currentId);
        const isFav = !!favorites[key];
        setFavorited(isFav);
      },
    );

    return unsubscribe;
  }, [currentSource, currentId]);

  // 切换收藏
  const handleToggleFavorite = async () => {
    if (!videoTitle || !detail || !currentSource || !currentId) {
      return;
    }

    try {
      if (favorited) {
        // 如果已收藏，删除收藏
        await deleteFavorite(currentSource, currentId);
        setFavorited(false);
      } else {
        // 如果未收藏，添加收藏
        await saveFavorite(currentSource, currentId, {
          title: videoTitle,
          source_name: detail?.source_name || '',
          year: detail?.year,
          cover: detail?.poster || '',
          total_episodes: detail?.episodes.length || 1,
          save_time: Date.now(),
          search_title: searchTitle,
        });
        setFavorited(true);
      }
    } catch (err) {
      console.error('切换收藏失败:', err);
    }
  };

  return {
    favorited,
    handleToggleFavorite,
  };
};
