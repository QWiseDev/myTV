/* eslint-disable no-console */
import { useCallback, useEffect, useRef, useState } from 'react';

import { DELAYS } from '@/lib/constants/home';
import type { Favorite } from '@/lib/db.client';
import type { FavoriteItem } from '@/lib/types';

/**
 * 收藏夹数据管理 Hook
 * 处理收藏夹数据的加载、更新和防抖逻辑
 */
export function useFavoriteItems(activeTab: 'home' | 'favorites') {
  const [favoriteItems, setFavoriteItems] = useState<FavoriteItem[]>([]);

  // 防抖机制：防止 getAllPlayRecords 重复调用
  const favoriteUpdateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isUpdatingFavoriteRef = useRef(false);

  const updateFavoriteItems = useCallback(
    async (allFavorites: Record<string, Favorite>) => {
      if (isUpdatingFavoriteRef.current) {
        return;
      }

      if (favoriteUpdateTimeoutRef.current) {
        clearTimeout(favoriteUpdateTimeoutRef.current);
      }

      favoriteUpdateTimeoutRef.current = setTimeout(async () => {
        if (isUpdatingFavoriteRef.current) {
          return;
        }

        try {
          isUpdatingFavoriteRef.current = true;
          const { getAllPlayRecords } = await import('@/lib/db.client');
          const allPlayRecords = await getAllPlayRecords();

          const sorted = Object.entries(allFavorites)
            .sort(([, a], [, b]) => b.save_time - a.save_time)
            .map(([key, fav]) => {
              const plusIndex = key.indexOf('+');
              const source = key.slice(0, plusIndex);
              const id = key.slice(plusIndex + 1);

              const playRecord = allPlayRecords?.[key];
              const currentEpisode = playRecord?.index;

              return {
                id,
                source,
                title: fav.title,
                year: fav.year,
                poster: fav.cover,
                episodes: fav.total_episodes,
                source_name: fav.source_name,
                currentEpisode,
                search_title: fav?.search_title,
                origin: fav?.origin,
              } as FavoriteItem;
            });
          setFavoriteItems(sorted);
        } catch (error) {
          console.error('更新收藏项失败:', error);
        } finally {
          isUpdatingFavoriteRef.current = false;
        }
      }, DELAYS.FAVORITE_UPDATE_DEBOUNCE);
    },
    []
  );

  // 加载收藏夹数据
  useEffect(() => {
    if (activeTab !== 'favorites') return;

    let unsubscribe: (() => void) | null = null;
    let cancelled = false;

    const loadFavorites = async () => {
      const { getAllFavorites, subscribeToDataUpdates } = await import(
        '@/lib/db.client'
      );

      if (cancelled) return;

      const allFavorites = await getAllFavorites();
      await updateFavoriteItems(allFavorites);

      if (cancelled) return;

      unsubscribe = subscribeToDataUpdates(
        'favoritesUpdated',
        (newFavorites: Record<string, Favorite>) => {
          updateFavoriteItems(newFavorites);
        }
      );
    };

    loadFavorites().catch((error) => {
      console.error('加载收藏夹失败:', error);
    });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [activeTab, updateFavoriteItems]);

  // 清理防抖定时器
  useEffect(() => {
    return () => {
      if (favoriteUpdateTimeoutRef.current) {
        clearTimeout(favoriteUpdateTimeoutRef.current);
      }
    };
  }, []);

  const clearFavorites = useCallback(() => {
    setFavoriteItems([]);
  }, []);

  return {
    favoriteItems,
    clearFavorites,
  };
}
