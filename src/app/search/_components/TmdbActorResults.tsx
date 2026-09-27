/* eslint-disable @typescript-eslint/no-explicit-any -- 与原搜索页实现逐字一致 */

import type { TMDBFilterState } from '@/components/TMDBFilterPanel';
import TMDBFilterPanel from '@/components/TMDBFilterPanel';
import VideoCard from '@/components/VideoCard';

export interface TmdbActorResultsProps {
  tmdbActorResults: any[] | null;
  tmdbActorLoading: boolean;
  tmdbActorError: string | null;
  tmdbActorType: 'movie' | 'tv';
  tmdbFilterState: TMDBFilterState;
  tmdbFilterVisible: boolean;
  /** 搜索框内容与 URL q 参数合并后的当前搜索词 */
  currentQuery: string | null;
  setTmdbActorType: (type: 'movie' | 'tv') => void;
  setTmdbFilterState: (state: TMDBFilterState) => void;
  setTmdbFilterVisible: (visible: boolean) => void;
  handleTmdbActorSearch: (
    query: string,
    type?: 'movie' | 'tv',
    filterState?: TMDBFilterState,
  ) => Promise<void>;
}

/**
 * TMDB 演员搜索结果区：类型选择器、筛选面板、错误重试与结果网格，
 * 拆分自搜索页原 JSX,文案与结构原样保留。
 */
export function TmdbActorResults({
  tmdbActorResults,
  tmdbActorLoading,
  tmdbActorError,
  tmdbActorType,
  tmdbFilterState,
  tmdbFilterVisible,
  currentQuery,
  setTmdbActorType,
  setTmdbFilterState,
  setTmdbFilterVisible,
  handleTmdbActorSearch,
}: TmdbActorResultsProps) {
  return (
    <>
      <div className='mb-4'>
        <h2 className='text-xl font-bold text-gray-800 dark:text-gray-200'>
          TMDB演员搜索结果
          {tmdbActorLoading && (
            <span className='ml-2 inline-block align-middle'>
              <span className='inline-block h-3 w-3 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin'></span>
            </span>
          )}
        </h2>

        {/* 电影/电视剧类型选择器 */}
        <div className='mt-3 flex items-center gap-2'>
          <span className='text-sm text-gray-600 dark:text-gray-400'>
            类型：
          </span>
          <div className='flex gap-2'>
            {[
              { key: 'movie', label: '电影' },
              { key: 'tv', label: '电视剧' },
            ].map((type) => (
              <button
                key={type.key}
                onClick={() => {
                  setTmdbActorType(type.key as 'movie' | 'tv');
                  if (currentQuery) {
                    handleTmdbActorSearch(
                      currentQuery,
                      type.key as 'movie' | 'tv',
                      tmdbFilterState,
                    );
                  }
                }}
                className={`px-3 py-1 text-sm rounded-full border transition-colors ${
                  tmdbActorType === type.key
                    ? 'bg-blue-500 text-white border-blue-500'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-700'
                }`}
                disabled={tmdbActorLoading}
              >
                {type.label}
              </button>
            ))}
          </div>
        </div>

        {/* TMDB筛选面板 */}
        <div className='mt-4'>
          <TMDBFilterPanel
            contentType={tmdbActorType}
            filters={tmdbFilterState}
            onFiltersChange={(newFilterState) => {
              setTmdbFilterState(newFilterState);
              if (currentQuery) {
                handleTmdbActorSearch(
                  currentQuery,
                  tmdbActorType,
                  newFilterState,
                );
              }
            }}
            isVisible={tmdbFilterVisible}
            onToggleVisible={() =>
              setTmdbFilterVisible(!tmdbFilterVisible)
            }
            resultCount={tmdbActorResults?.length || 0}
          />
        </div>
      </div>

      {tmdbActorError ? (
        <div className='text-center py-8'>
          <div className='text-red-500 mb-2'>{tmdbActorError}</div>
          <button
            onClick={() => {
              if (currentQuery) {
                handleTmdbActorSearch(
                  currentQuery,
                  tmdbActorType,
                  tmdbFilterState,
                );
              }
            }}
            className='px-4 py-2 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg transition-colors'
          >
            重试
          </button>
        </div>
      ) : tmdbActorResults && tmdbActorResults.length > 0 ? (
        <div className='grid grid-cols-3 gap-x-2 gap-y-14 sm:gap-y-20 px-0 sm:px-2 sm:grid-cols-[repeat(auto-fill,_minmax(11rem,_1fr))] sm:gap-x-8'>
          {tmdbActorResults.map((item, index) => (
            <div key={item.id || index} className='w-full'>
              <VideoCard
                id={item.id}
                title={item.title}
                poster={item.poster}
                year={item.year}
                rate={item.rate}
                from='douban'
                type={tmdbActorType}
              />
            </div>
          ))}
        </div>
      ) : !tmdbActorLoading ? (
        <div className='text-center text-gray-500 py-8 dark:text-gray-400'>
          未找到相关演员作品
        </div>
      ) : null}
    </>
  );
}
