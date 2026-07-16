'use client';

import { Calendar, Clapperboard, Star } from 'lucide-react';
import { memo } from 'react';

import { isSeriesCompleted } from '@/lib/utils';
import {
  getRatingBadgeStyle,
  noSelectStyle,
  preventContextMenu,
} from '@/lib/video-card-utils';

interface BaseBadgeProps {
  className?: string;
}

/**
 * 集数徽章 - 显示当前/总集数
 */
interface EpisodeBadgeProps extends BaseBadgeProps {
  episodes: number;
  currentEpisode?: number;
}

export const EpisodeBadge = memo(function EpisodeBadge({
  episodes,
  currentEpisode,
}: EpisodeBadgeProps) {
  if (!episodes || episodes <= 1) return null;

  return (
    <div
      className='pointer-events-none absolute top-2 left-2 z-30 rounded-full bg-[#141413]/88 px-3 py-1.5 text-xs font-bold text-[#faf9f5] shadow-sm ring-1 ring-white/25 backdrop-blur-md transition-all duration-300 ease-out group-hover:scale-105 dark:bg-[#f8f6f0]/90 dark:text-[#141413]'
      style={noSelectStyle}
      onContextMenu={preventContextMenu}
    >
      <span className='flex items-center gap-1'>
        <Clapperboard size={11} />
        {currentEpisode ? `${currentEpisode}/${episodes}` : `${episodes}集`}
      </span>
    </div>
  );
});

/**
 * 年份徽章
 */
interface YearBadgeProps extends BaseBadgeProps {
  year: string;
  hasEpisodeBadge?: boolean;
}

export const YearBadge = memo(function YearBadge({
  year,
  hasEpisodeBadge = false,
}: YearBadgeProps) {
  if (!year || year === 'unknown' || year.trim() === '') return null;

  return (
    <div
      className={`absolute left-2 rounded-full bg-[#d97757]/92 px-3 py-1.5 text-xs font-bold text-white shadow-sm ring-1 ring-white/25 backdrop-blur-md transition-all duration-300 ease-out group-hover:scale-105 dark:bg-[#e09a7a]/92 dark:text-[#141413] ${
        hasEpisodeBadge ? 'top-[48px]' : 'top-2'
      }`}
      style={noSelectStyle}
      onContextMenu={preventContextMenu}
    >
      <span className='flex items-center gap-1'>
        <Calendar size={11} />
        {year}
      </span>
    </div>
  );
});

/**
 * 已完结徽章
 */
interface CompletedBadgeProps extends BaseBadgeProps {
  remarks?: string;
}

export const CompletedBadge = memo(function CompletedBadge({
  remarks,
}: CompletedBadgeProps) {
  if (!remarks || !isSeriesCompleted(remarks)) return null;

  return (
    <div
      className='absolute bottom-2 left-2 rounded-full bg-[#5e5d59]/92 px-3 py-1.5 text-xs font-bold text-white shadow-sm ring-1 ring-white/25 backdrop-blur-md transition-all duration-300 ease-out group-hover:scale-105 dark:bg-[#d9d3c9]/92 dark:text-[#141413]'
      style={noSelectStyle}
      onContextMenu={preventContextMenu}
    >
      <span className='flex items-center gap-1'>
        <span className='text-[10px]'>✓</span>
        已完结
      </span>
    </div>
  );
});

/**
 * 评分徽章
 */
interface RatingBadgeProps extends BaseBadgeProps {
  rate: string;
}

export const RatingBadge = memo(function RatingBadge({
  rate,
}: RatingBadgeProps) {
  if (!rate) return null;

  const badgeStyle = getRatingBadgeStyle(rate);

  return (
    <div
      className={`absolute top-2 right-2 ${badgeStyle.bgColor} ${badgeStyle.ringColor} ${badgeStyle.shadowColor} ${badgeStyle.textColor} ${badgeStyle.glowClass} text-xs font-bold rounded-full flex flex-col items-center justify-center transition-all duration-300 ease-out group-hover:scale-110 backdrop-blur-sm w-9 h-9 sm:w-10 sm:h-10`}
      style={noSelectStyle}
      onContextMenu={preventContextMenu}
    >
      <Star size={10} className='fill-current mb-0.5' />
      <span className='text-[10px] sm:text-xs font-extrabold leading-none'>
        {rate}
      </span>
    </div>
  );
});
