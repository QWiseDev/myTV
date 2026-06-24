'use client';

import { Calendar, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { lazy, Suspense } from 'react';

import { BangumiCalendarData } from '@/lib/bangumi.client';
import { WEEKDAY_NAMES } from '@/lib/constants/home';

import SectionTitle from './SectionTitle';
import SkeletonCard from './SkeletonCard';
import SkeletonRow from './SkeletonRow';

const ScrollableRow = lazy(() => import('./ScrollableRow'));
const VideoCard = lazy(() => import('./VideoCard'));

interface BangumiSectionProps {
  bangumiCalendarData: BangumiCalendarData[];
  loading: boolean;
}

/**
 * 新番放送区块组件 - 显示今日更新的番剧
 */
export default function BangumiSection({
  bangumiCalendarData,
  loading,
}: BangumiSectionProps) {
  // 获取今日的番剧列表
  const getTodayAnimes = () => {
    const today = new Date();
    const currentWeekday = WEEKDAY_NAMES[today.getDay()];
    return (
      bangumiCalendarData.find((item) => item.weekday.en === currentWeekday)
        ?.items || []
    );
  };

  return (
    <section className='mb-8'>
      <div className='mb-4 flex items-center justify-between'>
        <SectionTitle title='新番放送' icon={Calendar} />
        <Link
          href='/douban?type=anime'
          className='flex items-center text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors'
        >
          查看更多
          <ChevronRight className='w-4 h-4 ml-1' />
        </Link>
      </div>
      <ScrollableRow enableAnimation={false}>
        {loading ? (
          <SkeletonRow />
        ) : (
          getTodayAnimes().map((anime, index) => (
            <div
              key={`${anime.id}-${index}`}
              className='min-w-[96px] w-24 sm:min-w-[180px] sm:w-44'
            >
              <Suspense fallback={<SkeletonCard />}>
                <VideoCard
                  from='douban'
                  title={anime.name_cn || anime.name}
                  poster={
                    anime.images?.large ||
                    anime.images?.common ||
                    anime.images?.medium ||
                    anime.images?.small ||
                    anime.images?.grid ||
                    '/placeholder-poster.jpg'
                  }
                  douban_id={anime.id}
                  rate={anime.rating?.score?.toFixed(1) || ''}
                  year={anime.air_date?.split('-')?.[0] || ''}
                  isBangumi={true}
                />
              </Suspense>
            </div>
          ))
        )}
      </ScrollableRow>
    </section>
  );
}
