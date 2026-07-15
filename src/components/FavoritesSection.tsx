'use client';

import {
  HOME_FAVORITES_GRID_CLASS,
  HOME_SECTION_ACTION_CLASS,
} from '@/lib/constants/home';
import { clearAllFavorites } from '@/lib/db.client';
import type { FavoriteItem } from '@/lib/types';

import EmptyFavorites from './EmptyFavorites';
import HomeSectionHeader from './HomeSectionHeader';
import VideoCard from './VideoCard';

interface FavoritesSectionProps {
  favoriteItems: FavoriteItem[];
  onClearAll: () => void;
}

/**
 * 收藏夹区块组件 - 展示用户收藏的影视内容
 */
export default function FavoritesSection({
  favoriteItems,
  onClearAll,
}: FavoritesSectionProps) {
  const handleClearAll = async () => {
    await clearAllFavorites();
    onClearAll();
  };

  return (
    <section className='mb-8'>
      <HomeSectionHeader
        title='我的收藏'
        action={
          favoriteItems.length > 0 ? (
            <button
              type='button'
              className={HOME_SECTION_ACTION_CLASS}
              onClick={handleClearAll}
            >
              清空
            </button>
          ) : null
        }
      />
      <div className={HOME_FAVORITES_GRID_CLASS}>
        {favoriteItems.map((item) => (
          <div key={item.id + item.source} className='w-full'>
            <VideoCard
              query={item.search_title}
              {...item}
              from='favorite'
              type={item.episodes > 1 ? 'tv' : ''}
            />
          </div>
        ))}
        {favoriteItems.length === 0 && <EmptyFavorites />}
      </div>
    </section>
  );
}
