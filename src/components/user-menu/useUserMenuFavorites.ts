import { useEffect, useState } from 'react';

import { debug } from '@/lib/debug';
import {
  type UserMenuFavoriteRecord,
  buildUserMenuFavoriteRecords,
} from '@/lib/favorite-items';
import type { Favorite } from '@/lib/types';

interface UserMenuIdentity {
  username?: string;
}

interface UseUserMenuFavoritesOptions {
  authInfo: UserMenuIdentity | null;
  isOpen: boolean;
  storageType: string;
}

export function useUserMenuFavorites({
  authInfo,
  isOpen,
  storageType,
}: UseUserMenuFavoritesOptions) {
  const [favorites, setFavorites] = useState<UserMenuFavoriteRecord[]>([]);

  useEffect(() => {
    if (
      typeof window === 'undefined' ||
      !authInfo?.username ||
      storageType === 'localstorage' ||
      !isOpen
    ) {
      return undefined;
    }

    let isActive = true;

    const loadFavorites = async () => {
      try {
        const response = await fetch('/api/favorites');
        if (!response.ok || !isActive) return;

        const favoritesData = (await response.json()) as Record<
          string,
          Favorite
        >;
        if (!isActive) return;

        setFavorites(buildUserMenuFavoriteRecords(favoritesData));
      } catch (error) {
        debug.error('加载收藏失败:', error);
      }
    };

    loadFavorites();

    const handleFavoritesUpdate = () => {
      debug.log('UserMenu: 收藏更新，重新加载收藏列表');
      loadFavorites();
    };

    window.addEventListener('favoritesUpdated', handleFavoritesUpdate);

    return () => {
      isActive = false;
      window.removeEventListener('favoritesUpdated', handleFavoritesUpdate);
    };
  }, [authInfo, storageType, isOpen]);

  return { favorites };
}
