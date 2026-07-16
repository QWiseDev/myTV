import { Heart, PlayCircle, X } from 'lucide-react';

import type { UserMenuFavoriteRecord } from '@/lib/favorite-items';
import { parseStorageKey } from '@/lib/storage-key';
import {
  type UserMenuContinueWatchingRecord,
  calculatePlayRecordProgress,
} from '@/lib/user-menu-continue-watching';
import {
  type UserMenuWatchingUpdatesState,
  getUserMenuNewEpisodesCount,
} from '@/lib/user-menu-watching-updates';

import {
  SCROLLABLE_PANEL_STYLE,
  stopPanelClickPropagation,
  UserMenuPanelBackdrop,
} from './UserMenuPanelPrimitives';
import VideoCard from '../VideoCard';

interface UserMenuWatchingUpdatesPanelProps {
  onClose: () => void;
  state: UserMenuWatchingUpdatesState;
}

export function UserMenuWatchingUpdatesPanel({
  onClose,
  state,
}: UserMenuWatchingUpdatesPanelProps) {
  return (
    <>
      <UserMenuPanelBackdrop onClick={onClose} />

      <div className='fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-4xl max-h-[90vh] bg-white dark:bg-gray-900 rounded-xl shadow-xl z-[1001] flex flex-col'>
        <div
          className='flex-1 p-6 overflow-y-auto'
          data-panel-content
          style={SCROLLABLE_PANEL_STYLE}
        >
          <div className='flex items-center justify-between mb-6'>
            <div className='flex items-center gap-3'>
              <h3 className='text-xl font-bold text-gray-800 dark:text-gray-200'>
                更新提醒
              </h3>
              <div className='flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400'>
                {state.totalUpdates > 0 && (
                  <span className='inline-flex items-center gap-1'>
                    <div className='w-2 h-2 bg-red-500 rounded-full animate-pulse'></div>
                    {state.totalUpdates}部有新集
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              className='w-8 h-8 p-1 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors'
              aria-label='Close'
            >
              <X className='w-full h-full' />
            </button>
          </div>

          <div className='space-y-8'>
            {!state.hasActualUpdates && (
              <div className='text-center py-8'>
                <div className='text-gray-500 dark:text-gray-400 text-sm'>
                  暂无新剧集更新
                </div>
                <div className='text-xs text-gray-400 dark:text-gray-500 mt-2'>
                  系统会定期检查您观看过的剧集是否有新集数更新
                </div>
              </div>
            )}

            {state.newEpisodeSeries.length > 0 && (
              <div>
                <div className='flex items-center gap-2 mb-4'>
                  <h4 className='text-lg font-semibold text-gray-900 dark:text-white'>
                    新集更新
                  </h4>
                  <div className='flex items-center gap-1'>
                    <div className='w-2 h-2 bg-red-500 rounded-full animate-pulse'></div>
                    <span className='text-sm text-red-500 font-medium'>
                      {state.newEpisodeSeries.length}
                      部剧集有更新
                    </span>
                  </div>
                </div>

                <div className='grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4'>
                  {state.newEpisodeSeries.map((series, index) => (
                    <div
                      key={`new-${series.title}_${series.year}_${index}`}
                      className='relative group/card'
                    >
                      <div className='relative group-hover/card:z-[500] transition-all duration-300'>
                        <VideoCard
                          title={series.title}
                          poster={series.cover}
                          year={series.year}
                          douban_id={series.douban_id}
                          source={series.sourceKey}
                          source_name={series.source_name}
                          episodes={series.totalEpisodes}
                          currentEpisode={series.currentEpisode}
                          id={series.videoId}
                          onDelete={undefined}
                          type={series.totalEpisodes > 1 ? 'tv' : ''}
                          from='playrecord'
                        />
                      </div>
                      <div className='absolute -top-2 -right-2 bg-gradient-to-r from-red-500 to-pink-500 text-white text-xs px-2 py-1 rounded-full shadow-lg z-[502]'>
                        +{series.newEpisodes}集
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className='mt-6 pt-4 border-t border-gray-200 dark:border-gray-700'>
            <p className='text-xs text-gray-500 dark:text-gray-400 text-center'>
              点击海报即可观看新更新的剧集
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

interface UserMenuContinueWatchingPanelProps {
  enableProgressFilter: boolean;
  maxProgress: number;
  minProgress: number;
  onClose: () => void;
  records: UserMenuContinueWatchingRecord[];
  watchingUpdatesState: UserMenuWatchingUpdatesState;
}

export function UserMenuContinueWatchingPanel({
  enableProgressFilter,
  maxProgress,
  minProgress,
  onClose,
  records,
  watchingUpdatesState,
}: UserMenuContinueWatchingPanelProps) {
  return (
    <>
      <UserMenuPanelBackdrop onClick={onClose} />

      <div
        className='fixed inset-x-4 top-1/2 transform -translate-y-1/2 max-w-4xl mx-auto bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 z-[1001] max-h-[80vh] overflow-y-auto'
        onClick={stopPanelClickPropagation}
      >
        <div className='p-6'>
          <div className='flex items-center justify-between mb-4'>
            <h3 className='text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2'>
              <PlayCircle className='w-6 h-6 text-blue-500' />
              继续观看
            </h3>
            <button
              onClick={onClose}
              className='p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors'
            >
              <X className='w-5 h-5' />
            </button>
          </div>

          <div className='grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4'>
            {records.map((record) => {
              const { source, id } = parseStorageKey(record.key) || {
                id: '',
                source: '',
              };
              const newEpisodesCount = getUserMenuNewEpisodesCount(
                watchingUpdatesState,
                record.key,
              );
              const progress = calculatePlayRecordProgress(record);

              return (
                <div key={record.key} className='relative group/card'>
                  <div className='relative group-hover/card:z-[500] transition-all duration-300'>
                    <VideoCard
                      id={id}
                      title={record.title || record.search_title}
                      poster={record.cover}
                      year={record.year}
                      douban_id={record.douban_id}
                      source={source}
                      source_name={record.source_name}
                      progress={progress}
                      episodes={record.total_episodes}
                      currentEpisode={record.index}
                      query={record.search_title}
                      from='playrecord'
                      type={record.total_episodes > 1 ? 'tv' : ''}
                      remarks={record.remarks}
                    />
                  </div>
                  {newEpisodesCount > 0 && (
                    <div className='absolute -top-2 -right-2 bg-gradient-to-r from-red-500 to-pink-500 text-white text-xs px-2 py-1 rounded-full shadow-lg z-[502]'>
                      +{newEpisodesCount}集
                    </div>
                  )}
                  {progress > 0 && (
                    <div className='absolute bottom-2 left-2 right-2 bg-black/50 rounded px-2 py-1'>
                      <div className='flex items-center gap-1'>
                        <div className='flex-1 bg-gray-600 rounded-full h-1'>
                          <div
                            className='bg-blue-500 h-1 rounded-full transition-all'
                            style={{ width: `${Math.min(progress, 100)}%` }}
                          />
                        </div>
                        <span className='text-xs text-white font-medium'>
                          {Math.round(progress)}%
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {records.length === 0 && (
            <div className='text-center py-12'>
              <PlayCircle className='w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4' />
              <p className='text-gray-500 dark:text-gray-400 mb-2'>
                暂无需要继续观看的内容
              </p>
              <p className='text-xs text-gray-400 dark:text-gray-500'>
                {enableProgressFilter
                  ? `观看进度在${minProgress}%-${maxProgress}%之间且播放时间超过2分钟的内容会显示在这里`
                  : '播放时间超过2分钟的所有内容都会显示在这里'}
              </p>
            </div>
          )}

          <div className='mt-6 pt-4 border-t border-gray-200 dark:border-gray-700'>
            <p className='text-xs text-gray-500 dark:text-gray-400 text-center'>
              点击海报即可继续观看
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

interface UserMenuFavoritesPanelProps {
  favorites: UserMenuFavoriteRecord[];
  onClose: () => void;
}

export function UserMenuFavoritesPanel({
  favorites,
  onClose,
}: UserMenuFavoritesPanelProps) {
  return (
    <>
      <UserMenuPanelBackdrop onClick={onClose} />

      <div
        className='fixed inset-x-4 top-1/2 transform -translate-y-1/2 max-w-4xl mx-auto bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 z-[1001] max-h-[80vh] overflow-y-auto'
        onClick={stopPanelClickPropagation}
      >
        <div className='p-6'>
          <div className='flex items-center justify-between mb-4'>
            <h3 className='text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2'>
              <Heart className='w-6 h-6 text-red-500' />
              我的收藏
            </h3>
            <button
              onClick={onClose}
              className='p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors'
            >
              <X className='w-5 h-5' />
            </button>
          </div>

          <div className='grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4'>
            {favorites.map((favorite) => {
              const { source, id } = parseStorageKey(favorite.key) || {
                id: '',
                source: '',
              };

              return (
                <div key={favorite.key} className='relative'>
                  <VideoCard
                    id={id}
                    title={favorite.title}
                    poster={favorite.cover}
                    year={favorite.year}
                    source={source}
                    source_name={favorite.source_name}
                    episodes={favorite.total_episodes}
                    query={favorite.search_title}
                    from='favorite'
                    type={favorite.total_episodes > 1 ? 'tv' : ''}
                  />
                  <div className='absolute top-2 right-2 bg-black/50 rounded px-2 py-1'>
                    <span className='text-xs text-white font-medium'>
                      {new Date(favorite.save_time).toLocaleDateString(
                        'zh-CN',
                        {
                          month: 'short',
                          day: 'numeric',
                        },
                      )}
                    </span>
                  </div>
                  <div className='absolute bottom-2 right-2'>
                    <Heart className='w-4 h-4 text-red-500 fill-red-500' />
                  </div>
                </div>
              );
            })}
          </div>

          {favorites.length === 0 && (
            <div className='text-center py-12'>
              <Heart className='w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4' />
              <p className='text-gray-500 dark:text-gray-400 mb-2'>暂无收藏</p>
              <p className='text-xs text-gray-400 dark:text-gray-500'>
                在详情页点击收藏按钮即可添加收藏
              </p>
            </div>
          )}

          <div className='mt-6 pt-4 border-t border-gray-200 dark:border-gray-700'>
            <p className='text-xs text-gray-500 dark:text-gray-400 text-center'>
              点击海报即可进入详情页面
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
