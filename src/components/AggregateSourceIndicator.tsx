'use client';

import { memo } from 'react';

import {
  noSelectStyle,
  preventContextMenu,
  sortSourcesByPriority,
} from '@/lib/video-card-utils';

interface AggregateSourceIndicatorProps {
  href: string;
  sourceNames: string[];
  title: string;
  maxDisplayCount?: number;
}

/**
 * 聚合播放源指示器 - 显示可用播放源数量和悬浮详情
 */
export const AggregateSourceIndicator = memo(function AggregateSourceIndicator({
  href,
  sourceNames,
  title,
  maxDisplayCount = 6,
}: AggregateSourceIndicatorProps) {
  if (!sourceNames || sourceNames.length === 0) return null;

  const uniqueSources = Array.from(new Set(sourceNames));
  const sourceCount = uniqueSources.length;
  const sortedSources = sortSourcesByPriority(uniqueSources);
  const displaySources = sortedSources.slice(0, maxDisplayCount);
  const hasMore = sortedSources.length > maxDisplayCount;
  const remainingCount = sortedSources.length - maxDisplayCount;

  return (
    <a
      href={href}
      aria-label={`${sourceCount} 个播放源，播放 ${title}`}
      className='group/sources pointer-events-none absolute bottom-2 right-2 z-[30] opacity-0 transition-all duration-300 ease-in-out delay-75 sm:group-hover:pointer-events-auto sm:group-hover:opacity-100 focus:pointer-events-auto focus:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white rounded-full'
      style={noSelectStyle}
      onClick={(event) => event.stopPropagation()}
      onContextMenu={preventContextMenu}
    >
      <div className='relative' style={noSelectStyle}>
        {/* 源数量徽章 */}
        <div
          className='bg-gradient-to-br from-orange-500/95 via-amber-500/95 to-yellow-500/95 backdrop-blur-md text-white text-xs font-bold w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center shadow-lg ring-2 ring-white/30 hover:scale-[1.15] transition-all duration-300 ease-out cursor-pointer hover:shadow-orange-500/50'
          style={noSelectStyle}
          onContextMenu={preventContextMenu}
        >
          <span className='flex flex-col items-center justify-center leading-none'>
            <span className='text-[9px] sm:text-[10px] font-normal'>源</span>
            <span className='text-xs sm:text-sm font-extrabold'>
              {sourceCount}
            </span>
          </span>
        </div>

        {/* 播放源详情悬浮框 */}
        <div
          className='absolute bottom-full mb-2 opacity-0 invisible group-hover/sources:opacity-100 group-hover/sources:visible group-focus/sources:opacity-100 group-focus/sources:visible transition-all duration-200 ease-out delay-100 pointer-events-none z-50 right-0 sm:right-0 -translate-x-0 sm:translate-x-0'
          style={noSelectStyle}
          onContextMenu={preventContextMenu}
        >
          <div
            className='bg-gray-800/90 backdrop-blur-sm text-white text-xs sm:text-xs rounded-lg shadow-xl border border-white/10 p-1.5 sm:p-2 min-w-[100px] sm:min-w-[120px] max-w-[140px] sm:max-w-[200px] overflow-hidden'
            style={noSelectStyle}
            onContextMenu={preventContextMenu}
          >
            {/* 播放源列表 */}
            <div className='space-y-0.5 sm:space-y-1'>
              {displaySources.map((sourceName, index) => (
                <div key={index} className='flex items-center gap-1 sm:gap-1.5'>
                  <div className='w-0.5 h-0.5 sm:w-1 sm:h-1 bg-blue-400 rounded-full flex-shrink-0' />
                  <span
                    className='truncate text-[10px] sm:text-xs leading-tight'
                    title={sourceName}
                  >
                    {sourceName}
                  </span>
                </div>
              ))}
            </div>

            {/* 显示更多提示 */}
            {hasMore && (
              <div className='mt-1 sm:mt-2 pt-1 sm:pt-1.5 border-t border-gray-700/50'>
                <div className='flex items-center justify-center text-gray-400'>
                  <span className='text-[10px] sm:text-xs font-medium'>
                    +{remainingCount} 播放源
                  </span>
                </div>
              </div>
            )}

            {/* 小箭头 */}
            <div className='absolute top-full right-2 sm:right-3 w-0 h-0 border-l-[4px] border-r-[4px] border-t-[4px] sm:border-l-[6px] sm:border-r-[6px] sm:border-t-[6px] border-transparent border-t-gray-800/90' />
          </div>
        </div>
      </div>
    </a>
  );
});

export default AggregateSourceIndicator;
