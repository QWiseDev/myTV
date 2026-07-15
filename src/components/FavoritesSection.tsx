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
  loadError: boolean;
  loading: boolean;
  onClearAll: () => void;
}

/**
 * 收藏夹区块组件 - 展示用户收藏的影视内容
 */
export default function FavoritesSection({
  favoriteItems,
  loadError,
  loading,
  onClearAll,
}: FavoritesSectionProps) {
  const handleClearAll = async () => {
    try {
      await clearAllFavorites();
      onClearAll();
    } catch {
      // 持久层失败时保留当前列表，并消费事件处理器返回的 Promise。
    }
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
        {loadError && favoriteItems.length > 0 && (
          <div
            className='col-span-full text-sm text-red-500 dark:text-red-400'
            role='alert'
          >
            收藏刷新失败，当前显示已有内容
          </div>
        )}
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
        {favoriteItems.length === 0 &&
          (loading ? (
            <div
              className='col-span-full py-16 text-center text-sm text-gray-500 dark:text-gray-400'
              role='status'
            >
              正在加载收藏...
            </div>
          ) : loadError ? (
            <div
              className='col-span-full py-16 text-center text-sm text-red-500 dark:text-red-400'
              role='alert'
            >
              收藏加载失败，请稍后重试
            </div>
          ) : (
            <EmptyFavorites />
          ))}
      </div>
    </section>
  );
}
