'use client';

import { Calendar } from 'lucide-react';

import type { BangumiCalendarData } from '@/lib/bangumi.client';
import { HOME_RENDER_LIMITS } from '@/lib/constants/home';
import { selectUsableImageUrl } from '@/lib/utils';

import HomeCardShell from './HomeCardShell';
import HomeSectionHeader from './HomeSectionHeader';
import ScrollableRow from './ScrollableRow';
import SkeletonRow from './SkeletonRow';
import VideoCard from './VideoCard';

interface BangumiSectionProps {
  bangumiCalendarData: BangumiCalendarData[];
  loading: boolean;
}

const bangumiWeekdayFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Shanghai',
  weekday: 'short',
});

function getTodayAnimes(
  bangumiCalendarData: BangumiCalendarData[],
  now = new Date(),
) {
  const currentWeekday = bangumiWeekdayFormatter.format(now);
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
  const todayAnimes = getTodayAnimes(bangumiCalendarData).slice(
    0,
    HOME_RENDER_LIMITS.BANGUMI,
  );

  return (
    <section className='mb-8'>
      <HomeSectionHeader
        title='新番放送'
        icon={Calendar}
        linkHref='/douban?type=anime'
      />
      <ScrollableRow enableAnimation={false}>
        {loading ? (
          <SkeletonRow />
        ) : (
          todayAnimes.map((anime, index) => (
            <HomeCardShell key={`${anime.id}-${index}`}>
              <VideoCard
                from='douban'
                title={anime.name_cn || anime.name}
                poster={resolveBangumiPoster(anime.images)}
                douban_id={anime.id}
                rate={anime.rating?.score?.toFixed(1) || ''}
                year={anime.air_date?.split('-')?.[0] || ''}
                isBangumi={true}
              />
            </HomeCardShell>
          ))
        )}
      </ScrollableRow>
    </section>
  );
}
