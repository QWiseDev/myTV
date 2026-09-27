/* eslint-disable @typescript-eslint/no-explicit-any -- 与原搜索页实现逐字一致 */

import DirectYouTubePlayer from '@/components/DirectYouTubePlayer';
import YouTubeVideoCard from '@/components/YouTubeVideoCard';

import type {
  YouTubeContentType,
  YouTubeSortOrder,
} from '../hooks/useYouTubeSearch';

export interface YouTubeModeSwitchProps {
  youtubeMode: 'search' | 'direct';
  setYoutubeMode: (mode: 'search' | 'direct') => void;
  setYoutubeResults: (results: any[] | null) => void;
  setYoutubeError: (error: string | null) => void;
  setYoutubeWarning: (warning: string | null) => void;
}

/**
 * YouTube 搜索/直接播放双模式切换，结果区与未搜索态共用，原 JSX 原样保留。
 */
export function YouTubeModeSwitch({
  youtubeMode,
  setYoutubeMode,
  setYoutubeResults,
  setYoutubeError,
  setYoutubeWarning,
}: YouTubeModeSwitchProps) {
  return (
    <div className='mt-3 flex items-center gap-2'>
      <div className='inline-flex items-center bg-gray-100 dark:bg-gray-800 rounded-lg p-1 space-x-1'>
        <button
          type='button'
          onClick={() => {
            setYoutubeMode('search');
            // 切换到搜索模式时清除直接播放相关状态
            setYoutubeError(null);
            setYoutubeWarning(null);
          }}
          className={`px-3 py-2 text-sm font-medium rounded-md transition-colors ${
            youtubeMode === 'search'
              ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
          }`}
        >
          🔍 搜索视频
        </button>
        <button
          type='button'
          onClick={() => {
            setYoutubeMode('direct');
            // 切换到直接播放模式时清除搜索结果
            setYoutubeResults(null);
            setYoutubeError(null);
            setYoutubeWarning(null);
          }}
          className={`px-3 py-2 text-sm font-medium rounded-md transition-colors ${
            youtubeMode === 'direct'
              ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
          }`}
        >
          🔗 直接播放
        </button>
      </div>
    </div>
  );
}

/**
 * YouTube 直接播放模式：提示横幅 + DirectYouTubePlayer，原 JSX 原样保留。
 */
export function YouTubeDirectMode() {
  return (
    <div className='space-y-4'>
      <div className='bg-blue-50 border border-blue-200 rounded-lg p-4 dark:bg-blue-900/20 dark:border-blue-800'>
        <div className='flex items-center text-blue-800 dark:text-blue-200 mb-2'>
          <svg
            className='w-5 h-5 mr-2'
            fill='currentColor'
            viewBox='0 0 20 20'
          >
            <path
              fillRule='evenodd'
              d='M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z'
              clipRule='evenodd'
            />
          </svg>
          <span className='font-medium'>
            💡 直接播放YouTube视频
          </span>
        </div>
        <p className='text-blue-700 dark:text-blue-300 text-sm'>
          粘贴任意YouTube链接，无需搜索即可直接播放视频。支持所有常见的YouTube链接格式。
        </p>
      </div>
      <DirectYouTubePlayer />
    </div>
  );
}

export interface YouTubeSearchResultsProps {
  youtubeResults: any[] | null;
  youtubeLoading: boolean;
  youtubeError: string | null;
  youtubeWarning: string | null;
  youtubeMode: 'search' | 'direct';
  youtubeContentType: YouTubeContentType;
  youtubeSortOrder: YouTubeSortOrder;
  /** 搜索框内容与 URL q 参数合并后的当前搜索词 */
  currentQuery: string | null;
  setYoutubeMode: (mode: 'search' | 'direct') => void;
  setYoutubeResults: (results: any[] | null) => void;
  setYoutubeError: (error: string | null) => void;
  setYoutubeWarning: (warning: string | null) => void;
  setYoutubeContentType: (type: YouTubeContentType) => void;
  setYoutubeSortOrder: (order: YouTubeSortOrder) => void;
  handleYouTubeSearch: (
    query: string,
    contentType?: YouTubeContentType,
    sortOrder?: YouTubeSortOrder,
  ) => Promise<void>;
}

/**
 * YouTube 搜索结果区，拆分自搜索页原 JSX，文案、结构与条件渲染顺序原样保留。
 */
export function YouTubeSearchResults({
  youtubeResults,
  youtubeLoading,
  youtubeError,
  youtubeWarning,
  youtubeMode,
  youtubeContentType,
  youtubeSortOrder,
  currentQuery,
  setYoutubeMode,
  setYoutubeResults,
  setYoutubeError,
  setYoutubeWarning,
  setYoutubeContentType,
  setYoutubeSortOrder,
  handleYouTubeSearch,
}: YouTubeSearchResultsProps) {
  return (
    <>
      <div className='mb-4'>
        <h2 className='text-xl font-bold text-gray-800 dark:text-gray-200'>
          YouTube视频
          {youtubeLoading && youtubeMode === 'search' && (
            <span className='ml-2 inline-block align-middle'>
              <span className='inline-block h-3 w-3 border-2 border-gray-300 border-t-red-500 rounded-full animate-spin'></span>
            </span>
          )}
        </h2>

        {/* YouTube模式切换 */}
        <YouTubeModeSwitch
          youtubeMode={youtubeMode}
          setYoutubeMode={setYoutubeMode}
          setYoutubeResults={setYoutubeResults}
          setYoutubeError={setYoutubeError}
          setYoutubeWarning={setYoutubeWarning}
        />
      </div>

      {/* YouTube内容区域 */}
      {youtubeMode === 'direct' ? (
        /* 直接播放模式 */
        <YouTubeDirectMode />
      ) : (
        /* 搜索模式 */
        <>
          {/* 内容类型选择器 */}
          <div className='mt-3 flex flex-wrap gap-2'>
            {[
              { key: 'all', label: '全部' },
              { key: 'music', label: '音乐' },
              { key: 'movie', label: '电影' },
              { key: 'educational', label: '教育' },
              { key: 'gaming', label: '游戏' },
              { key: 'sports', label: '体育' },
              { key: 'news', label: '新闻' },
            ].map((type) => (
              <button
                key={type.key}
                onClick={() => {
                  setYoutubeContentType(type.key as any);
                  if (currentQuery) {
                    handleYouTubeSearch(
                      currentQuery,
                      type.key as any,
                      youtubeSortOrder,
                    );
                  }
                }}
                className={`px-3 py-1 text-sm rounded-full border transition-colors ${
                  youtubeContentType === type.key
                    ? 'bg-red-500 text-white border-red-500'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-700'
                }`}
                disabled={youtubeLoading}
              >
                {type.label}
              </button>
            ))}
          </div>

          {/* 排序选择器 */}
          <div className='mt-3 flex items-center gap-3'>
            <span className='text-sm text-gray-600 dark:text-gray-400'>
              排序：
            </span>
            <div className='flex flex-wrap gap-2'>
              {[
                { key: 'relevance', label: '相关性' },
                { key: 'date', label: '最新发布', icon: '🕒' },
                { key: 'viewCount', label: '观看次数', icon: '👀' },
                { key: 'rating', label: '评分', icon: '⭐' },
                { key: 'title', label: '标题', icon: '🔤' },
              ].map((sort) => (
                <button
                  key={sort.key}
                  onClick={() => {
                    setYoutubeSortOrder(sort.key as any);
                    if (currentQuery) {
                      handleYouTubeSearch(
                        currentQuery,
                        youtubeContentType,
                        sort.key as any,
                      );
                    }
                  }}
                  className={`px-2 py-1 text-xs rounded border transition-colors flex items-center gap-1 ${
                    youtubeSortOrder === sort.key
                      ? 'bg-blue-500 text-white border-blue-500'
                      : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-600 dark:hover:bg-gray-700'
                  }`}
                  disabled={youtubeLoading}
                >
                  {sort.icon && <span>{sort.icon}</span>}
                  <span>{sort.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 警告信息显示 */}
          {youtubeWarning && (
            <div className='mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg dark:bg-yellow-900/20 dark:border-yellow-800'>
              <div className='flex items-center text-yellow-800 dark:text-yellow-200'>
                <svg
                  className='w-4 h-4 mr-2'
                  fill='currentColor'
                  viewBox='0 0 20 20'
                >
                  <path
                    fillRule='evenodd'
                    d='M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z'
                    clipRule='evenodd'
                  />
                </svg>
                <span className='text-sm'>{youtubeWarning}</span>
              </div>
            </div>
          )}

          {youtubeError ? (
            <div className='text-center py-8'>
              <div className='text-red-500 mb-2'>
                {youtubeError}
              </div>
              <button
                onClick={() => {
                  if (currentQuery) {
                    handleYouTubeSearch(
                      currentQuery,
                      youtubeContentType,
                      youtubeSortOrder,
                    );
                  }
                }}
                className='px-4 py-2 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg transition-colors'
              >
                重试
              </button>
            </div>
          ) : youtubeResults && youtubeResults.length > 0 ? (
            <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'>
              {youtubeResults.map((video, index) => (
                <YouTubeVideoCard
                  key={video.videoId || index}
                  video={video}
                />
              ))}
            </div>
          ) : !youtubeLoading ? (
            <div className='text-center text-gray-500 py-8 dark:text-gray-400'>
              未找到相关YouTube视频
            </div>
          ) : null}
        </>
      )}
    </>
  );
}
