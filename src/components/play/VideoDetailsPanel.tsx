import dynamic from 'next/dynamic';
import Image from 'next/image';

import type { SearchResult } from '@/lib/types';
import { processImageUrl } from '@/lib/utils';
import { useIsLoggedIn } from '@/hooks/useIsLoggedIn';

import type {
  BangumiDetails as BangumiDetailsData,
  MovieDetails as MovieDetailsData,
  NetDiskResults,
} from '@/app/play/types';

import CastSection from './CastSection';
import CommentSection from './CommentSection';
import FavoriteButton from './FavoriteButton';
import RecommendationsSection from './RecommendationsSection';

const NetDiskSearchResults = dynamic(
  () => import('@/components/NetDiskSearchResults'),
  {
    ssr: false,
  },
);

interface VideoDetailsPanelProps {
  videoTitle: string;
  videoYear?: string;
  detail: SearchResult | null;
  bangumiDetails: BangumiDetailsData | null;
  movieDetails: MovieDetailsData | null;
  loadingBangumiDetails: boolean;
  loadingMovieDetails: boolean;
  favorited: boolean;
  onToggleFavorite: () => void;
  // 网盘搜索相关
  netdiskResults: NetDiskResults | null;
  netdiskLoading: boolean;
  netdiskError: string | null;
  netdiskTotal: number;
  onNetDiskSearch: (query: string) => void | Promise<void>;
  // 豆瓣短评相关
  videoDoubanId?: number;
  // 演员点击回调
  onCelebrityClick?: (name: string) => void;
}

/** 面板头部海报图源：bangumi > 豆瓣 > 播放源封面 */
function resolvePoster(
  detail: SearchResult | null,
  bangumiDetails: BangumiDetailsData | null,
  movieDetails: MovieDetailsData | null,
): string {
  const raw =
    bangumiDetails?.images?.large ||
    movieDetails?.poster ||
    detail?.poster ||
    '';
  return raw ? processImageUrl(raw) : '';
}

/** 爱奇艺式「标签 | 值」信息行 */
function MetaRow({
  label,
  value,
  clampLines = 1,
}: {
  label: string;
  value?: string | string[];
  clampLines?: number;
}) {
  const text = Array.isArray(value) ? value.filter(Boolean).join(' / ') : value;
  if (!text) return null;

  return (
    <div className='flex text-sm leading-6'>
      <span className='w-11 shrink-0 text-gray-400 dark:text-gray-500'>
        {label}
      </span>
      <span
        className={`flex-1 min-w-0 text-gray-600 dark:text-gray-400 ${
          clampLines === 1 ? 'line-clamp-1' : 'line-clamp-2'
        }`}
      >
        {text}
      </span>
    </div>
  );
}

/** 中性描边小标签（替代原彩色渐变徽章） */
function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className='px-2 py-0.5 rounded border border-gray-300/80 dark:border-white/15 text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap'>
      {children}
    </span>
  );
}

export default function VideoDetailsPanel({
  videoTitle,
  videoYear,
  detail,
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
  videoDoubanId: resolvedDoubanId,
  onCelebrityClick,
}: VideoDetailsPanelProps) {
  const videoDoubanId = resolvedDoubanId || detail?.douban_id;
  const poster = resolvePoster(detail, bangumiDetails, movieDetails);

  const bangumiRating = parseFloat(bangumiDetails?.rating?.score || '');
  const doubanRating = parseFloat(movieDetails?.rate || '');

  const overview =
    bangumiDetails?.summary || movieDetails?.intro || detail?.desc || '';

  const genreText = movieDetails?.genres?.length
    ? movieDetails.genres.slice(0, 3).join(' ')
    : detail?.type_name || detail?.class || '';

  // 访客（未登录）隐藏收藏与网盘等登录功能
  const isLoggedIn = useIsLoggedIn();

  return (
    <div className='pb-6 @container'>
      {/* 头部：海报 + 标题/评分/操作 — 爱奇艺式布局 */}
      <div className='flex gap-4'>
        <div className='relative w-[104px] sm:w-[124px] aspect-[2/3] shrink-0 rounded-lg overflow-hidden bg-gray-200 dark:bg-[#2a2a2a]'>
          {poster ? (
            <Image
              src={poster}
              alt={videoTitle}
              fill
              sizes='124px'
              unoptimized={
                poster.startsWith('http://') ||
                poster.startsWith('https://') ||
                poster.startsWith('/api/image-proxy')
              }
              referrerPolicy='no-referrer'
              className='object-cover'
            />
          ) : (
            <div className='absolute inset-0 flex items-center justify-center'>
              <span className='text-xs text-gray-400'>暂无封面</span>
            </div>
          )}
        </div>

        <div className='flex-1 min-w-0 flex flex-col'>
          <h1 className='text-xl font-bold leading-snug text-gray-900 dark:text-gray-100 line-clamp-2'>
            {videoTitle || '影片标题'}
          </h1>

          {/* 评分行 */}
          {(doubanRating > 0 || bangumiRating > 0) && (
            <div className='mt-2 flex items-center gap-3 flex-wrap'>
              {doubanRating > 0 && movieDetails?.rate ? (
                <RatingDisplay score={movieDetails.rate} color='yellow' />
              ) : null}
              {bangumiRating > 0 && bangumiDetails?.rating?.score ? (
                <RatingDisplay
                  score={bangumiDetails.rating.score}
                  color='pink'
                />
              ) : null}
            </div>
          )}

          {/* 年份 · 类型 · 地区 · 片长 */}
          <div className='mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400 line-clamp-2'>
            {[
              detail?.year || videoYear,
              genreText,
              movieDetails?.countries?.slice(0, 2).join('/'),
              movieDetails?.movie_duration
                ? `${movieDetails.movie_duration}分钟`
                : movieDetails?.episode_length
                  ? `单集${movieDetails.episode_length}分钟`
                  : '',
            ]
              .filter(Boolean)
              .join(' · ')}
          </div>

          {/* 操作行 */}
          {isLoggedIn && (
            <div className='mt-auto pt-3 flex items-center gap-2 flex-wrap'>
              <FavoriteButton
                favorited={favorited}
                onClick={onToggleFavorite}
              />

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (!netdiskResults && !netdiskLoading && videoTitle) {
                    onNetDiskSearch(videoTitle);
                  }
                  setTimeout(() => {
                    const element = document.getElementById('netdisk-section');
                    if (element) {
                      element.scrollIntoView({
                        behavior: 'smooth',
                        block: 'start',
                      });
                    }
                  }, 100);
                }}
                className='flex-shrink-0 flex items-center gap-1.5 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white px-3 py-1.5 rounded-full text-sm font-medium shadow-lg hover:shadow-xl transition-all duration-300'
              >
                {netdiskLoading ? (
                  <span className='flex items-center gap-1'>
                    <span className='inline-block h-3 w-3 border-2 border-white border-t-transparent rounded-full animate-spin'></span>
                    搜索中...
                  </span>
                ) : netdiskTotal > 0 ? (
                  <span>{netdiskTotal}个资源</span>
                ) : (
                  <span>网盘资源</span>
                )}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 加载骨架 */}
      {(loadingMovieDetails || loadingBangumiDetails) &&
        !movieDetails &&
        !bangumiDetails && (
          <div className='mt-4 animate-pulse space-y-2'>
            <div className='h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4'></div>
            <div className='h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2'></div>
          </div>
        )}

      {/* 导演 / 编剧 / 主演 */}
      <div className='mt-4 space-y-1'>
        <MetaRow label='导演' value={movieDetails?.directors} />
        <MetaRow label='编剧' value={movieDetails?.screenwriters} />
        <MetaRow
          label='主演'
          value={movieDetails?.cast?.length ? movieDetails.cast : undefined}
          clampLines={2}
        />
        {bangumiDetails?.date && (
          <MetaRow label='播出' value={bangumiDetails.date} />
        )}
      </div>

      {/* 剧情简介 */}
      {overview && (
        <p
          className='mt-4 text-[15px] leading-7 text-gray-700 dark:text-gray-300'
          style={{ whiteSpace: 'pre-line' }}
        >
          {overview}
        </p>
      )}

      {/* 标签行：国家/语言/集数/时长/共话 */}
      {(() => {
        const tags: React.ReactNode[] = [];
        movieDetails?.countries
          ?.slice(0, 2)
          .forEach((c, i) => tags.push(<Tag key={`c${i}`}>{c}</Tag>));
        movieDetails?.languages
          ?.slice(0, 2)
          .forEach((l, i) => tags.push(<Tag key={`l${i}`}>{l}</Tag>));
        if (movieDetails?.episodes)
          tags.push(<Tag key='ep'>共{movieDetails.episodes}集</Tag>);
        bangumiDetails?.tags
          ?.slice(0, 4)
          .forEach((t, i) => tags.push(<Tag key={`t${i}`}>{t.name}</Tag>));
        if (bangumiDetails?.total_episodes)
          tags.push(<Tag key='tep'>共{bangumiDetails.total_episodes}话</Tag>);
        return tags.length > 0 ? (
          <div className='mt-4 flex flex-wrap gap-2'>{tags}</div>
        ) : null;
      })()}

      {/* 演员阵容 */}
      <CastSection
        celebrities={movieDetails?.celebrities || []}
        onCelebrityClick={onCelebrityClick}
      />

      {/* 推荐影片 */}
      <RecommendationsSection
        recommendations={movieDetails?.recommendations || []}
        isEpisodic={!!movieDetails?.episodes}
      />

      {/* 豆瓣短评 */}
      <CommentSection key={videoDoubanId} videoDoubanId={videoDoubanId} />

      {/* 网盘资源区域（访客隐藏） */}
      {isLoggedIn && (
        <div id='netdisk-section' className='mt-6'>
          <div className='border-t border-gray-200 dark:border-gray-700 pt-5'>
            <div className='mb-3 flex items-center gap-2'>
              <h3 className='text-base font-semibold text-gray-800 dark:text-gray-200'>
                网盘资源
              </h3>
              {netdiskLoading && (
                <span className='inline-block h-4 w-4 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin'></span>
              )}
              {netdiskTotal > 0 && <Tag>{netdiskTotal} 个资源</Tag>}
            </div>
            {videoTitle && !netdiskLoading && !netdiskResults && (
              <p className='text-sm text-gray-500 dark:text-gray-400 mb-3'>
                点击上方「网盘资源」按钮开始搜索
              </p>
            )}
            {videoTitle &&
              !netdiskLoading &&
              (netdiskResults || netdiskError) && (
                <p className='text-sm text-gray-500 dark:text-gray-400 mb-3'>
                  搜索关键词：{videoTitle}
                </p>
              )}

            <NetDiskSearchResults
              results={netdiskResults}
              loading={netdiskLoading}
              error={netdiskError}
              total={netdiskTotal}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// 评分显示组件
function RatingDisplay({
  score,
  color,
}: {
  score: string;
  color: 'yellow' | 'pink';
}) {
  const colorClasses = {
    yellow:
      'from-yellow-600 via-amber-600 to-yellow-600 dark:from-yellow-400 dark:via-amber-400 dark:to-yellow-400',
    pink: 'from-pink-600 via-rose-600 to-pink-600 dark:from-pink-400 dark:via-rose-400 dark:to-pink-400',
  };

  const starColorClasses = {
    yellow: 'text-yellow-500',
    pink: 'text-pink-500',
  };

  return (
    <div className='flex items-center'>
      <span
        className={`text-transparent bg-clip-text bg-gradient-to-r ${colorClasses[color]} font-bold text-lg`}
      >
        {score}
      </span>
      <div className='flex ml-1.5 gap-0.5'>
        {[...Array(5)].map((_, i) => (
          <svg
            key={i}
            className={`w-3.5 h-3.5 ${
              i < Math.floor(parseFloat(score) / 2)
                ? starColorClasses[color]
                : 'text-gray-300 dark:text-gray-600'
            }`}
            fill='currentColor'
            viewBox='0 0 20 20'
          >
            <path d='M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z' />
          </svg>
        ))}
      </div>
    </div>
  );
}
