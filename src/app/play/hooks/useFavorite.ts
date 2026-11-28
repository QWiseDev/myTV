import { useCallback, useEffect, useRef, useState } from 'react';

import {
  deleteFavorite,
  generateStorageKey,
  isFavorited,
  saveFavorite,
  subscribeToDataUpdates,
} from '@/lib/db.client';
import type { Favorite, SearchResult } from '@/lib/types';

export type ToggleFavoriteOutcome = 'favorited' | 'unfavorited' | null;

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
  const togglingRef = useRef(false);

  // 检查收藏状态（带取消保护，避免快速换源时旧源异步结果覆盖新源状态）
  useEffect(() => {
    if (!currentSource || !currentId) {
      setFavorited(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const fav = await isFavorited(currentSource, currentId);
        if (!cancelled) {
          setFavorited(fav);
        }
      } catch (err) {
        if (!cancelled) {
          console.error('检查收藏状态失败:', err);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
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

  // 切换收藏（防连点重入，并返回真实落库结果供埋点对齐）
  const handleToggleFavorite =
    useCallback(async (): Promise<ToggleFavoriteOutcome> => {
      if (
        togglingRef.current ||
        !videoTitle ||
        !detail ||
        !currentSource ||
        !currentId
      ) {
        return null;
      }

      togglingRef.current = true;
      try {
        if (favorited) {
          await deleteFavorite(currentSource, currentId);
          setFavorited(false);
          return 'unfavorited';
        }

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
        return 'favorited';
      } catch (err) {
        console.error('切换收藏失败:', err);
        return null;
      } finally {
        togglingRef.current = false;
      }
    }, [currentId, currentSource, detail, favorited, searchTitle, videoTitle]);

  return {
    favorited,
    handleToggleFavorite,
  };
};
