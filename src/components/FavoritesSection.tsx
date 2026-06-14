'use client';

import { lazy, Suspense } from 'react';

import { clearAllFavorites } from '@/lib/db.client';
import { FavoriteItem } from '@/lib/types';

import EmptyFavorites from './EmptyFavorites';
import SkeletonCard from './SkeletonCard';

const VideoCard = lazy(() => import('./VideoCard'));

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
      <div className='mb-4 flex items-center justify-between'>
        <h2 className='text-xl font-bold text-gray-800 dark:text-gray-200'>
          我的收藏
        </h2>
        {favoriteItems.length > 0 && (
          <button
            className='text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
            onClick={handleClearAll}
          >
            清空
          </button>
        )}
      </div>
      <div className='justify-start grid grid-cols-2 gap-x-3 gap-y-14 sm:gap-y-20 px-0 sm:px-2 sm:grid-cols-[repeat(auto-fill,_minmax(11rem,_1fr))] sm:gap-x-8'>
        {favoriteItems.map((item) => (
          <div key={item.id + item.source} className='w-full'>
            <Suspense fallback={<SkeletonCard />}>
              <VideoCard
                query={item.search_title}
                {...item}
                from='favorite'
                type={item.episodes > 1 ? 'tv' : ''}
              />
            </Suspense>
          </div>
        ))}
        {favoriteItems.length === 0 && <EmptyFavorites />}
      </div>
    </section>
  );
}
