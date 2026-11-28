'use client';

import { Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import { HOME_SECTION_ACTION_CLASS } from '@/lib/constants/home';
import { clearAllFavorites } from '@/lib/db.client';
import type { FavoriteItem } from '@/lib/types';

import EmptyFavorites from './EmptyFavorites';
import HomeSectionHeader from './HomeSectionHeader';
import SkeletonCard from './SkeletonCard';
import VideoCard from './VideoCard';

interface FavoritesSectionProps {
  favoriteItems: FavoriteItem[];
  loadError: boolean;
  loading: boolean;
  onClearAll: () => void;
  onRetry: () => void;
}

/**
 * 收藏夹区块组件 - 支持网格骨架占位与清空二次确认防误触
 */
export default function FavoritesSection({
  favoriteItems,
  loadError,
  loading,
  onClearAll,
  onRetry,
}: FavoritesSectionProps) {
  const [confirmingClear, setConfirmingClear] = useState(false);

  useEffect(() => {
    if (!confirmingClear) return undefined;
    const timer = setTimeout(() => setConfirmingClear(false), 5000);
    return () => clearTimeout(timer);
  }, [confirmingClear]);

  const handleConfirmClearAll = async () => {
    setConfirmingClear(false);
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
            confirmingClear ? (
              <div
                className='flex items-center gap-2'
                role='group'
                aria-label='确认清空收藏'
              >
                <span className='hidden text-xs text-[#8f8f8f] sm:inline'>
                  确定清空收藏？
                </span>
                <button
                  type='button'
                  onClick={handleConfirmClearAll}
                  className='inline-flex items-center gap-1 rounded-full bg-red-500 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-red-600'
                >
                  <Trash2 className='h-3 w-3' />
                  确认清空
                </button>
                <button
                  type='button'
                  onClick={() => setConfirmingClear(false)}
                  className='rounded-full bg-[#f2f2f2] px-2.5 py-1 text-xs text-[#5f5f5f] transition-colors hover:bg-[#e5e5e5] dark:bg-[#2a2a2a] dark:text-[#a8a8a8] dark:hover:bg-[#383838]'
                >
                  取消
                </button>
              </div>
            ) : (
              <button
                type='button'
                className={HOME_SECTION_ACTION_CLASS}
                onClick={() => setConfirmingClear(true)}
              >
                清空
              </button>
            )
          ) : null
        }
      />
      <div className='grid grid-cols-2 justify-start gap-x-3 gap-y-14 px-0 sm:grid-cols-[repeat(auto-fill,_minmax(12.5rem,_1fr))] sm:gap-x-8 sm:gap-y-20 sm:px-2'>
        {loadError && favoriteItems.length > 0 && (
          <div
            className='col-span-full text-sm text-red-500 dark:text-red-400'
            role='alert'
          >
            收藏刷新失败，当前显示已有内容
            <button
              type='button'
              className='ml-2 underline underline-offset-2 hover:text-red-600 dark:hover:text-red-300'
              onClick={onRetry}
            >
              重试
            </button>
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
            <div className='col-span-full' role='status'>
              <span className='sr-only'>正在加载收藏...</span>
              <div className='grid grid-cols-2 gap-x-3 gap-y-8 sm:grid-cols-[repeat(auto-fill,_minmax(12.5rem,_1fr))] sm:gap-x-8'>
                {Array.from({ length: 6 }).map((_, index) => (
                  <SkeletonCard key={index} />
                ))}
              </div>
            </div>
          ) : loadError ? (
            <div
              className='col-span-full py-16 text-center text-sm text-red-500 dark:text-red-400'
              role='alert'
            >
              收藏加载失败
              <button
                type='button'
                className='ml-2 underline underline-offset-2 hover:text-red-600 dark:hover:text-red-300'
                onClick={onRetry}
              >
                重试
              </button>
            </div>
          ) : (
            <EmptyFavorites />
          ))}
      </div>
    </section>
  );
}
