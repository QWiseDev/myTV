'use client';

import { Calendar } from 'lucide-react';
import { lazy, Suspense, useMemo } from 'react';

import type { BangumiCalendarData } from '@/lib/bangumi.client';
import { HOME_RENDER_LIMITS, WEEKDAY_NAMES } from '@/lib/constants/home';
import { selectUsableImageUrl } from '@/lib/utils';

import HomeCardShell from './HomeCardShell';
import HomeSectionHeader from './HomeSectionHeader';
import SkeletonCard from './SkeletonCard';
import SkeletonRow from './SkeletonRow';

const ScrollableRow = lazy(() => import('./ScrollableRow'));
const VideoCard = lazy(() => import('./VideoCard'));

interface BangumiSectionProps {
  bangumiCalendarData: BangumiCalendarData[];
  loading: boolean;
}

function getTodayAnimes(bangumiCalendarData: BangumiCalendarData[]) {
  const currentWeekday = WEEKDAY_NAMES[new Date().getDay()];
  return (
    bangumiCalendarData.find((item) => item.weekday.en === currentWeekday)
      ?.items || []
  );
}

function resolveBangumiPoster(
  images?: BangumiCalendarData['items'][number]['images'],
): string {
  // 首页卡片尺寸小，优先中小图降低 image-proxy 带宽与并发压力
  return (
    selectUsableImageUrl(
      images?.medium,
      images?.common,
      images?.small,
      images?.large,
      images?.grid,
    ) || '/placeholder-poster.jpg'
  );
}

/**
 * 新番放送区块组件 - 显示今日更新的番剧
 */
export default function BangumiSection({
  bangumiCalendarData,
  loading,
}: BangumiSectionProps) {
  const todayAnimes = useMemo(() => {
    const items = getTodayAnimes(bangumiCalendarData);
    return items.slice(0, HOME_RENDER_LIMITS.BANGUMI);
  }, [bangumiCalendarData]);

  return (
    <section className='mb-8'>
      <HomeSectionHeader
        title='新番放送'
        icon={Calendar}
        linkHref='/douban?type=anime'
      />
      <Suspense fallback={<SkeletonRow />}>
        <ScrollableRow enableAnimation={false}>
          {loading ? (
            <SkeletonRow />
          ) : (
            todayAnimes.map((anime, index) => (
              <HomeCardShell key={`${anime.id}-${index}`}>
                <Suspense fallback={<SkeletonCard />}>
                  <VideoCard
                    from='douban'
                    title={anime.name_cn || anime.name}
                    poster={resolveBangumiPoster(anime.images)}
                    douban_id={anime.id}
                    rate={anime.rating?.score?.toFixed(1) || ''}
                    year={anime.air_date?.split('-')?.[0] || ''}
                    isBangumi={true}
                  />
                </Suspense>
              </HomeCardShell>
            ))
          )}
        </ScrollableRow>
      </Suspense>
    </section>
  );
}
