import type { BangumiCalendarData } from '@/lib/bangumi.client';
import { DATA_FETCH_TIMEOUTS } from '@/lib/constants/home';
import { fetchDoubanData } from '@/lib/douban';
import type { DoubanItem } from '@/lib/types';

import { EMPTY_HOME_DATA, HomeData } from './home-data-types';

interface DoubanCategoryApiResponse {
  items?: Array<{
    id: string;
    title: string;
    card_subtitle?: string;
    pic?: {
      large?: string;
      normal?: string;
    };
    rating?: {
      value?: number;
    };
  }>;
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  fallback: T
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((resolve) => {
        timeoutId = setTimeout(() => resolve(fallback), timeoutMs);
      }),
    ]);
  } catch {
    return fallback;
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

async function getDoubanCategory(params: {
  kind: 'movie' | 'tv';
  category: string;
  type: string;
}): Promise<DoubanItem[]> {
  const target = `https://m.douban.com/rexxar/api/v2/subject/recent_hot/${params.kind}?start=0&limit=20&category=${params.category}&type=${params.type}`;
  const data = await fetchDoubanData<DoubanCategoryApiResponse>(target);

  return (data.items || []).map((item) => ({
    id: item.id,
    title: item.title,
    poster: item.pic?.normal || item.pic?.large || '',
    rate: item.rating?.value ? item.rating.value.toFixed(1) : '',
    year: item.card_subtitle?.match(/(\d{4})/)?.[1] || '',
  }));
}

async function getBangumiCalendar(): Promise<BangumiCalendarData[]> {
  const response = await fetch('https://api.bgm.tv/calendar', {
    headers: { Accept: 'application/json' },
    next: { revalidate: 30 * 60 },
  });

  if (!response.ok) {
    return [];
  }

  const data = await response.json();
  return Array.isArray(data) ? data : [];
}

export async function getServerHomeData(): Promise<HomeData> {
  const [movies, tvShows, varietyShows, bangumiCalendarData] =
    await Promise.all([
      withTimeout(
        getDoubanCategory({ kind: 'movie', category: '热门', type: '全部' }),
        DATA_FETCH_TIMEOUTS.CRITICAL,
        EMPTY_HOME_DATA.hotMovies
      ),
      withTimeout(
        getDoubanCategory({ kind: 'tv', category: 'tv', type: 'tv' }),
        DATA_FETCH_TIMEOUTS.SECONDARY,
        EMPTY_HOME_DATA.hotTvShows
      ),
      withTimeout(
        getDoubanCategory({ kind: 'tv', category: 'show', type: 'show' }),
        DATA_FETCH_TIMEOUTS.SECONDARY,
        EMPTY_HOME_DATA.hotVarietyShows
      ),
      withTimeout(
        getBangumiCalendar(),
        DATA_FETCH_TIMEOUTS.TERTIARY,
        EMPTY_HOME_DATA.bangumiCalendarData
      ),
    ]);

  return {
    hotMovies: movies,
    hotTvShows: tvShows,
    hotVarietyShows: varietyShows,
    bangumiCalendarData,
  };
}
