/* eslint-disable no-console */
import { useCallback, useEffect, useState } from 'react';

import { DELAYS } from '@/lib/constants/home';
import type { Favorite } from '@/lib/db.client';
import { buildFavoriteItems } from '@/lib/favorite-items';
import type { FavoriteItem } from '@/lib/types';

type FavoriteLoadState = 'idle' | 'loading' | 'loaded' | 'error';

/**
 * 收藏夹数据管理 Hook
 * 处理收藏夹数据的加载、更新和防抖逻辑
 */
export function useFavoriteItems(activeTab: 'home' | 'favorites') {
  const [favoriteItems, setFavoriteItems] = useState<FavoriteItem[]>([]);
  const [favoriteLoadState, setFavoriteLoadState] =
    useState<FavoriteLoadState>('idle');

  // 加载收藏夹数据
  useEffect(() => {
    if (activeTab !== 'favorites') return;

    let unsubscribe: (() => void) | null = null;
    let cancelled = false;
    let enrichmentTimer: ReturnType<typeof setTimeout> | null = null;
    let isEnriching = false;
    let pendingEnrichment: Record<string, Favorite> | null = null;
    let favoritesRevision = 0;
    let hasAppliedFavorites = false;

    const processPendingEnrichment = async () => {
      if (isEnriching) return;
      isEnriching = true;

      try {
        while (!cancelled && pendingEnrichment) {
          const favorites = pendingEnrichment;
          pendingEnrichment = null;

          if (Object.keys(favorites).length === 0) continue;

          try {
            const { getAllPlayRecords } = await import('@/lib/db.client');
            if (cancelled) return;

            const allPlayRecords = await getAllPlayRecords();
            if (cancelled) return;

            // 请求期间有更新到达时，旧结果不再写回，直接补全最新一版。
            if (pendingEnrichment) continue;

            setFavoriteItems(buildFavoriteItems(favorites, allPlayRecords));
          } catch (error) {
            if (!cancelled) {
              console.error('更新收藏项失败:', error);
            }
          }
        }
      } finally {
        isEnriching = false;
      }
    };

    const queueFavoriteEnrichment = (favorites: Record<string, Favorite>) => {
      pendingEnrichment = favorites;

      if (isEnriching) return;
      if (enrichmentTimer) {
        clearTimeout(enrichmentTimer);
      }

      if (Object.keys(favorites).length === 0) {
        pendingEnrichment = null;
        enrichmentTimer = null;
        return;
      }

      enrichmentTimer = setTimeout(() => {
        enrichmentTimer = null;
        void processPendingEnrichment();
      }, DELAYS.FAVORITE_UPDATE_DEBOUNCE);
    };

    const applyFavorites = (favorites: Record<string, Favorite>) => {
      if (cancelled) return;

      hasAppliedFavorites = true;
      setFavoriteItems(buildFavoriteItems(favorites));
      setFavoriteLoadState('loaded');
      queueFavoriteEnrichment(favorites);
    };

    setFavoriteLoadState('loading');

    const loadFavorites = async () => {
      const { getAllFavorites, subscribeToDataUpdates } =
        await import('@/lib/db.client');

      if (cancelled) return;

      unsubscribe = subscribeToDataUpdates(
        'favoritesUpdated',
        (newFavorites: Record<string, Favorite>) => {
          favoritesRevision += 1;
          applyFavorites(newFavorites);
        },
      );

      const requestRevision = favoritesRevision;
      const allFavorites = await getAllFavorites();
      if (cancelled) return;
      if (favoritesRevision !== requestRevision) return;

      applyFavorites(allFavorites);
    };

    loadFavorites().catch((error) => {
      if (cancelled) return;

      console.error('加载收藏夹失败:', error);
      if (!hasAppliedFavorites) {
        setFavoriteLoadState('error');
      }
    });

    return () => {
      cancelled = true;
      unsubscribe?.();
      pendingEnrichment = null;
      if (enrichmentTimer) clearTimeout(enrichmentTimer);
    };
  }, [activeTab]);

  const clearFavorites = useCallback(() => {
    setFavoriteItems([]);
    setFavoriteLoadState('loaded');
  }, []);

  const loadingFavorites =
    activeTab === 'favorites' &&
    (favoriteLoadState === 'idle' || favoriteLoadState === 'loading');
  const favoriteLoadError =
    activeTab === 'favorites' && favoriteLoadState === 'error';

  return {
    favoriteItems,
    favoriteLoadError,
    loadingFavorites,
    clearFavorites,
  };
}
