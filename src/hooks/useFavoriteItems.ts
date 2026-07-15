/* eslint-disable no-console */
import { useCallback, useEffect, useRef, useState } from 'react';

import { DELAYS } from '@/lib/constants/home';
import type { Favorite } from '@/lib/db.client';
import { buildFavoriteItems } from '@/lib/favorite-items';
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
  const pendingFavoritesRef = useRef<Record<string, Favorite> | null>(null);

  const processPendingFavorites = useCallback(async () => {
    if (isUpdatingFavoriteRef.current) return;

    isUpdatingFavoriteRef.current = true;

    try {
      while (pendingFavoritesRef.current) {
        const allFavorites = pendingFavoritesRef.current;
        pendingFavoritesRef.current = null;

        try {
          const { getAllPlayRecords } = await import('@/lib/db.client');
          const allPlayRecords = await getAllPlayRecords();

          // 请求期间有更新到达时，旧结果不再写回，直接补全最新一版。
          if (pendingFavoritesRef.current) continue;

          setFavoriteItems(buildFavoriteItems(allFavorites, allPlayRecords));
        } catch (error) {
          console.error('更新收藏项失败:', error);
          // 若失败期间已有更新到达，while 会继续处理最新 payload。
        }
      }
    } finally {
      isUpdatingFavoriteRef.current = false;
    }
  }, []);

  const updateFavoriteItems = useCallback(
    (allFavorites: Record<string, Favorite>) => {
      pendingFavoritesRef.current = allFavorites;

      if (isUpdatingFavoriteRef.current) return;

      if (favoriteUpdateTimeoutRef.current) {
        clearTimeout(favoriteUpdateTimeoutRef.current);
      }

      favoriteUpdateTimeoutRef.current = setTimeout(() => {
        favoriteUpdateTimeoutRef.current = null;
        void processPendingFavorites();
      }, DELAYS.FAVORITE_UPDATE_DEBOUNCE);
    },
    [processPendingFavorites],
  );

  // 加载收藏夹数据
  useEffect(() => {
    if (activeTab !== 'favorites') return;

    let unsubscribe: (() => void) | null = null;
    let cancelled = false;

    const loadFavorites = async () => {
      const { getAllFavorites, subscribeToDataUpdates } =
        await import('@/lib/db.client');

      if (cancelled) return;

      const allFavorites = await getAllFavorites();
      updateFavoriteItems(allFavorites);

      if (cancelled) return;

      unsubscribe = subscribeToDataUpdates(
        'favoritesUpdated',
        (newFavorites: Record<string, Favorite>) => {
          updateFavoriteItems(newFavorites);
        },
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
      pendingFavoritesRef.current = null;
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
