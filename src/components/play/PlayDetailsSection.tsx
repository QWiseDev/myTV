'use client';

import dynamic from 'next/dynamic';

import type { DoubanComment, SearchResult } from '@/lib/types';

import type {
  BangumiDetails,
  MovieDetails,
  NetDiskResults,
} from '@/app/play/types';

const VideoDetailsPanel = dynamic(
  () => import('@/components/play/VideoDetailsPanel'),
  {
    ssr: false,
    loading: () => (
      <div className='h-32 bg-gray-800 animate-pulse rounded-lg' />
    ),
  },
);

const CoverImage = dynamic(() => import('@/components/play/CoverImage'), {
  ssr: false,
});

interface PlayDetailsSectionProps {
  detail: SearchResult | null;
  videoTitle: string;
  videoYear?: string;
  bangumiDetails: BangumiDetails | null;
  movieDetails: MovieDetails | null;
  loadingBangumiDetails: boolean;
  loadingMovieDetails: boolean;
  favorited: boolean;
  onToggleFavorite: () => void;
  netdiskResults: NetDiskResults | null;
  netdiskLoading: boolean;
  netdiskError: string | null;
  netdiskTotal: number;
  onNetDiskSearch: (keyword: string) => void | Promise<void>;
  videoCover: string;
  videoDoubanId: number;
  // 豆瓣短评相关
  movieComments?: DoubanComment[];
  loadingComments?: boolean;
  commentsError?: string | null;
  // 演员点击回调
  onCelebrityClick?: (name: string) => void;
}

/**
 * 播放页右侧的详情信息与封面展示
 */
export default function PlayDetailsSection({
  detail,
  videoTitle,
  videoYear,
  bangumiDetails,
  movieDetails,
  loadingBangumiDetails,
  loadingMovieDetails,
  favorited,
  onToggleFavorite,
  netdiskResults,
  netdiskLoading,
  netdiskError,
  netdiskTotal,
  onNetDiskSearch,
  videoCover,
  videoDoubanId,
  movieComments = [],
  loadingComments = false,
  commentsError = null,
  onCelebrityClick,
}: PlayDetailsSectionProps) {
  return (
    <div className='grid grid-cols-1 md:grid-cols-4 gap-4'>
      <VideoDetailsPanel
        videoTitle={videoTitle}
        videoYear={videoYear}
        detail={detail}
        bangumiDetails={bangumiDetails}
        movieDetails={movieDetails}
        loadingBangumiDetails={loadingBangumiDetails}
        loadingMovieDetails={loadingMovieDetails}
        favorited={favorited}
        onToggleFavorite={onToggleFavorite}
        netdiskResults={netdiskResults}
        netdiskLoading={netdiskLoading}
        netdiskError={netdiskError}
        netdiskTotal={netdiskTotal}
        onNetDiskSearch={onNetDiskSearch}
        movieComments={movieComments}
        loadingComments={loadingComments}
        commentsError={commentsError}
        onCelebrityClick={onCelebrityClick}
      />

      <CoverImage
        videoCover={videoCover}
        videoTitle={videoTitle}
        videoDoubanId={videoDoubanId}
        bangumiDetails={bangumiDetails}
        movieDetails={movieDetails}
      />
    </div>
  );
}
