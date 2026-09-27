/* eslint-disable @typescript-eslint/no-explicit-any -- 与原搜索页实现逐字一致 */

import { SearchResult } from '@/lib/types';

import SearchResultFilter, {
  SearchFilterCategory,
} from '@/components/SearchResultFilter';
import VirtualSearchGrid from '@/components/VirtualSearchGrid';

import type { SearchFilterValues } from '../hooks/useSearchFilters';

// 聚合分组统计：取集数众数、来源名集合与豆瓣 ID 众数
const computeGroupStats = (group: SearchResult[]) => {
  const episodes = (() => {
    const countMap = new Map<number, number>();
    group.forEach((g) => {
      const len = g.episodes?.length || 0;
      if (len > 0) countMap.set(len, (countMap.get(len) || 0) + 1);
    });
    let max = 0;
    let res = 0;
    countMap.forEach((v, k) => {
      if (v > max) {
        max = v;
        res = k;
      }
    });
    return res;
  })();
  const source_names = Array.from(
    new Set(group.map((g) => g.source_name).filter(Boolean)),
  ) as string[];

  const douban_id = (() => {
    const countMap = new Map<number, number>();
    group.forEach((g) => {
      if (g.douban_id && g.douban_id > 0) {
        countMap.set(g.douban_id, (countMap.get(g.douban_id) || 0) + 1);
      }
    });
    let max = 0;
    let res: number | undefined;
    countMap.forEach((v, k) => {
      if (v > max) {
        max = v;
        res = k;
      }
    });
    return res;
  })();

  return { episodes, source_names, douban_id };
};

export interface VideoResultsSectionProps {
  viewMode: 'agg' | 'all';
  setViewMode: (mode: 'agg' | 'all') => void;
  filterAll: SearchFilterValues;
  setFilterAll: (values: SearchFilterValues) => void;
  filterAgg: SearchFilterValues;
  setFilterAgg: (values: SearchFilterValues) => void;
  filterOptions: {
    categoriesAll: SearchFilterCategory[];
    categoriesAgg: SearchFilterCategory[];
  };
  filteredAllResults: SearchResult[];
  filteredAggResults: [string, SearchResult[]][];
  searchQuery: string;
  isLoading: boolean;
  totalSources: number;
  completedSources: number;
  useFluidSearch: boolean;
}

/**
 * 影视搜索结果区：加载进度、聚合/非聚合筛选器、聚合开关与结果网格，
 * 拆分自搜索页原 JSX,文案与结构原样保留。
 */
export function VideoResultsSection({
  viewMode,
  setViewMode,
  filterAll,
  setFilterAll,
  filterAgg,
  setFilterAgg,
  filterOptions,
  filteredAllResults,
  filteredAggResults,
  searchQuery,
  isLoading,
  totalSources,
  completedSources,
  useFluidSearch,
}: VideoResultsSectionProps) {
  return (
    <>
      {/* 标题 */}
      <div className='mb-4'>
        <h2 className='text-xl font-bold text-gray-800 dark:text-gray-200'>
          搜索结果
          {totalSources > 0 && useFluidSearch && (
            <span className='ml-2 text-sm font-normal text-gray-500 dark:text-gray-400'>
              {completedSources}/{totalSources}
            </span>
          )}
          {isLoading && useFluidSearch && (
            <span className='ml-2 inline-block align-middle'>
              <span className='inline-block h-3 w-3 border-2 border-gray-300 border-t-green-500 rounded-full animate-spin'></span>
            </span>
          )}
        </h2>
      </div>
      {/* 筛选器 + 开关控件 */}
      <div className='mb-8 space-y-4'>
        {/* 筛选器 */}
        <div className='flex-1 min-w-0'>
          {viewMode === 'agg' ? (
            <SearchResultFilter
              categories={filterOptions.categoriesAgg}
              values={filterAgg}
              onChange={(v) => setFilterAgg(v as any)}
            />
          ) : (
            <SearchResultFilter
              categories={filterOptions.categoriesAll}
              values={filterAll}
              onChange={(v) => setFilterAll(v as any)}
            />
          )}
        </div>

        {/* 开关控件行 */}
        <div className='flex items-center justify-end gap-6'>
          {/* 聚合开关 */}
          <label className='flex items-center gap-3 cursor-pointer select-none shrink-0 group'>
            <span className='text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors'>
              🔄 聚合
            </span>
            <div className='relative'>
              <input
                type='checkbox'
                className='sr-only peer'
                checked={viewMode === 'agg'}
                onChange={() =>
                  setViewMode(viewMode === 'agg' ? 'all' : 'agg')
                }
              />
              <div className='w-11 h-6 bg-gradient-to-r from-gray-200 to-gray-300 rounded-full peer-checked:from-emerald-400 peer-checked:to-green-500 transition-all duration-300 dark:from-gray-600 dark:to-gray-700 dark:peer-checked:from-emerald-500 dark:peer-checked:to-green-600 shadow-inner'></div>
              <div className='absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-all duration-300 peer-checked:translate-x-5 shadow-lg peer-checked:shadow-emerald-300 dark:peer-checked:shadow-emerald-500/50 peer-checked:scale-105'></div>
              {/* 开关内图标 */}
              <div className='absolute top-1.5 left-1.5 w-3 h-3 flex items-center justify-center pointer-events-none transition-all duration-300 peer-checked:translate-x-5'>
                <span className='text-[10px] peer-checked:text-white text-gray-500'>
                  {viewMode === 'agg' ? '🔗' : '○'}
                </span>
              </div>
            </div>
          </label>
        </div>
      </div>
      <VirtualSearchGrid
        filteredResults={filteredAllResults}
        filteredAggResults={filteredAggResults}
        viewMode={viewMode}
        searchQuery={searchQuery}
        isLoading={isLoading}
        computeGroupStats={computeGroupStats}
      />
    </>
  );
}
