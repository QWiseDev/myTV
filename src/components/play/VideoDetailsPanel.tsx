import dynamic from 'next/dynamic';

import type { DoubanComment, SearchResult } from '@/lib/types';

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
  { ssr: false },
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
  movieComments?: DoubanComment[];
  loadingComments?: boolean;
  commentsError?: string | null;
  // 演员点击回调
  onCelebrityClick?: (name: string) => void;
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
  movieComments = [],
  loadingComments = false,
  commentsError = null,
  onCelebrityClick,
}: VideoDetailsPanelProps) {
  const videoDoubanId = detail?.douban_id;

  return (
    <div className='md:col-span-3'>
      <div className='p-6 flex flex-col min-h-0'>
        {/* 标题 */}
        <div className='mb-4 flex-shrink-0'>
          <div className='flex flex-col md:flex-row md:items-center gap-3'>
            <h1 className='text-2xl md:text-3xl font-bold tracking-wide text-center md:text-left bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 dark:from-gray-100 dark:via-gray-200 dark:to-gray-100 bg-clip-text text-transparent'>
              {videoTitle || '影片标题'}
            </h1>

            {/* 按钮组 */}
            <div className='flex items-center justify-center md:justify-start gap-2 flex-wrap'>
              {/* 收藏按钮 */}
              <FavoriteButton
                favorited={favorited}
                onClick={onToggleFavorite}
              />

              {/* 网盘资源按钮 */}
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
                className='group relative flex-shrink-0 transition-all duration-300 hover:scale-105'
              >
                <div className='absolute inset-0 bg-gradient-to-r from-blue-400 to-cyan-400 rounded-full opacity-0 group-hover:opacity-30 blur-xl transition-opacity duration-300'></div>
                <div className='relative flex items-center gap-1.5 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white px-3 py-1.5 rounded-full text-sm font-medium shadow-lg hover:shadow-xl transition-all duration-300'>
                  📁
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
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* 关键信息行 */}
        <div className='flex flex-wrap items-center gap-3 text-base mb-4 opacity-80 flex-shrink-0'>
          {detail?.class && (
            <span className='text-green-600 font-semibold'>{detail.class}</span>
          )}
          {(detail?.year || videoYear) && (
            <span>{detail?.year || videoYear}</span>
          )}
          {detail?.source_name && (
            <span className='border border-gray-500/60 px-2 py-[1px] rounded'>
              {detail.source_name}
            </span>
          )}
          {detail?.type_name && <span>{detail.type_name}</span>}
        </div>

        {/* 番剧/豆瓣详情 */}
        {videoDoubanId && videoDoubanId !== 0 && detail && (
          <div className='mb-4 flex-shrink-0'>
            {/* 加载状态 */}
            {(loadingMovieDetails || loadingBangumiDetails) &&
              !movieDetails &&
              !bangumiDetails && (
                <div className='animate-pulse'>
                  <div className='h-4 bg-gray-300 rounded w-64 mb-2'></div>
                  <div className='h-4 bg-gray-300 rounded w-48'></div>
                </div>
              )}

            {/* Bangumi详情 */}
            {bangumiDetails && (
              <BangumiDetails bangumiDetails={bangumiDetails} />
            )}

            {/* 豆瓣详情 */}
            {movieDetails && <MovieDetails movieDetails={movieDetails} />}
          </div>
        )}

        {/* 剧情简介 */}
        {(detail?.desc || bangumiDetails?.summary) && (
          <div
            className='mt-0 text-base leading-relaxed opacity-90 overflow-y-auto pr-2 flex-1 min-h-0 scrollbar-hide'
            style={{ whiteSpace: 'pre-line' }}
          >
            {bangumiDetails?.summary || detail?.desc}
          </div>
        )}

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
        <CommentSection
          comments={movieComments}
          loading={loadingComments}
          error={commentsError}
          videoDoubanId={detail?.douban_id}
        />

        {/* 网盘资源区域 */}
        <div id='netdisk-section' className='mt-6'>
          <div className='border-t border-gray-200 dark:border-gray-700 pt-6'>
            <div className='mb-4'>
              <h3 className='text-xl font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2'>
                📁 网盘资源
                {netdiskLoading && (
                  <span className='inline-block align-middle'>
                    <span className='inline-block h-4 w-4 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin'></span>
                  </span>
                )}
                {netdiskTotal > 0 && (
                  <span className='inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300'>
                    {netdiskTotal} 个资源
                  </span>
                )}
              </h3>
              {videoTitle && !netdiskLoading && !netdiskResults && (
                <p className='text-sm text-gray-500 dark:text-gray-400 mt-2'>
                  点击上方"📁 网盘资源"按钮开始搜索
                </p>
              )}
              {videoTitle &&
                !netdiskLoading &&
                (netdiskResults || netdiskError) && (
                  <p className='text-sm text-gray-500 dark:text-gray-400 mt-2'>
                    搜索关键词：{videoTitle}
                  </p>
                )}
            </div>

            <NetDiskSearchResults
              results={netdiskResults}
              loading={netdiskLoading}
              error={netdiskError}
              total={netdiskTotal}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// Bangumi 详情子组件
function BangumiDetails({
  bangumiDetails,
}: {
  bangumiDetails: BangumiDetailsData;
}) {
  return (
    <div className='space-y-2 text-sm'>
      {/* Bangumi评分 */}
      {bangumiDetails.rating?.score &&
        parseFloat(bangumiDetails.rating.score) > 0 && (
          <div className='flex items-center gap-2'>
            <span className='font-semibold text-gray-700 dark:text-gray-300'>
              Bangumi评分:{' '}
            </span>
            <RatingDisplay score={bangumiDetails.rating.score} color='pink' />
          </div>
        )}

      {/* 播出日期 */}
      {bangumiDetails.date && (
        <div>
          <span className='font-semibold text-gray-700 dark:text-gray-300'>
            播出日期:{' '}
          </span>
          <span className='text-gray-600 dark:text-gray-400'>
            {bangumiDetails.date}
          </span>
        </div>
      )}

      {/* 标签信息 */}
      <div className='flex flex-wrap gap-2 mt-3'>
        {bangumiDetails.tags &&
          bangumiDetails.tags.slice(0, 4).map((tag, index) => (
            <InfoBadge key={index} color='blue'>
              {tag.name}
            </InfoBadge>
          ))}
        {bangumiDetails.total_episodes && (
          <InfoBadge color='green'>
            共{bangumiDetails.total_episodes}话
          </InfoBadge>
        )}
      </div>
    </div>
  );
}

// 豆瓣详情子组件
function MovieDetails({ movieDetails }: { movieDetails: MovieDetailsData }) {
  return (
    <div className='space-y-2 text-sm'>
      {/* 豆瓣评分 */}
      {movieDetails.rate &&
        movieDetails.rate !== '0' &&
        parseFloat(movieDetails.rate) > 0 && (
          <div className='flex items-center gap-2'>
            <span className='font-semibold text-gray-700 dark:text-gray-300'>
              豆瓣评分:{' '}
            </span>
            <RatingDisplay score={movieDetails.rate} color='yellow' />
          </div>
        )}

      {/* 导演 */}
      {movieDetails.directors && movieDetails.directors.length > 0 && (
        <div>
          <span className='font-semibold text-gray-700 dark:text-gray-300'>
            导演:{' '}
          </span>
          <span className='text-gray-600 dark:text-gray-400'>
            {movieDetails.directors.join('、')}
          </span>
        </div>
      )}

      {/* 编剧 */}
      {movieDetails.screenwriters && movieDetails.screenwriters.length > 0 && (
        <div>
          <span className='font-semibold text-gray-700 dark:text-gray-300'>
            编剧:{' '}
          </span>
          <span className='text-gray-600 dark:text-gray-400'>
            {movieDetails.screenwriters.join('、')}
          </span>
        </div>
      )}

      {/* 主演 */}
      {movieDetails.cast && movieDetails.cast.length > 0 && (
        <div>
          <span className='font-semibold text-gray-700 dark:text-gray-300'>
            主演:{' '}
          </span>
          <span className='text-gray-600 dark:text-gray-400'>
            {movieDetails.cast.join('、')}
          </span>
        </div>
      )}

      {/* 首播日期 */}
      {movieDetails.first_aired && (
        <div>
          <span className='font-semibold text-gray-700 dark:text-gray-300'>
            {movieDetails.episodes ? '首播' : '上映'}:
          </span>
          <span className='text-gray-600 dark:text-gray-400'>
            {movieDetails.first_aired}
          </span>
        </div>
      )}

      {/* 标签信息 */}
      <div className='flex flex-wrap gap-2 mt-3'>
        {movieDetails.countries &&
          movieDetails.countries
            .slice(0, 2)
            .map((country: string, index: number) => (
              <InfoBadge key={index} color='blue'>
                {country}
              </InfoBadge>
            ))}
        {movieDetails.languages &&
          movieDetails.languages
            .slice(0, 2)
            .map((language: string, index: number) => (
              <InfoBadge key={index} color='purple'>
                {language}
              </InfoBadge>
            ))}
        {movieDetails.episodes && (
          <InfoBadge color='green'>共{movieDetails.episodes}集</InfoBadge>
        )}
        {movieDetails.episode_length && (
          <InfoBadge color='orange'>
            单集{movieDetails.episode_length}分钟
          </InfoBadge>
        )}
        {movieDetails.movie_duration && (
          <InfoBadge color='red'>{movieDetails.movie_duration}分钟</InfoBadge>
        )}
      </div>
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
    yellow: 'text-yellow-500 drop-shadow-[0_0_4px_rgba(234,179,8,0.5)]',
    pink: 'text-pink-500 drop-shadow-[0_0_4px_rgba(236,72,153,0.5)]',
  };

  return (
    <div className='flex items-center group'>
      <span
        className={`relative text-transparent bg-clip-text bg-gradient-to-r ${colorClasses[color]} font-bold text-lg transition-all duration-300 group-hover:scale-110`}
      >
        {score}
      </span>
      <div className='flex ml-2 gap-0.5'>
        {[...Array(5)].map((_, i) => (
          <svg
            key={i}
            className={`w-4 h-4 transition-all duration-300 ${
              i < Math.floor(parseFloat(score) / 2)
                ? `${starColorClasses[color]} group-hover:scale-110`
                : 'text-gray-300 dark:text-gray-600'
            }`}
            fill='currentColor'
            viewBox='0 0 20 20'
            style={{ transitionDelay: `${i * 50}ms` }}
          >
            <path d='M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z' />
          </svg>
        ))}
      </div>
    </div>
  );
}

// 信息徽章组件
function InfoBadge({
  children,
  color,
}: {
  children: React.ReactNode;
  color: string;
}) {
  const colorMap: Record<string, { from: string; to: string }> = {
    blue: { from: 'from-blue-500/90', to: 'to-indigo-500/90' },
    green: { from: 'from-green-500/90', to: 'to-emerald-500/90' },
    purple: { from: 'from-purple-500/90', to: 'to-pink-500/90' },
    orange: { from: 'from-orange-500/90', to: 'to-amber-500/90' },
    red: { from: 'from-red-500/90', to: 'to-rose-500/90' },
  };

  const darkColorMap: Record<string, { from: string; to: string }> = {
    blue: { from: 'dark:from-blue-600/90', to: 'dark:to-indigo-600/90' },
    green: { from: 'dark:from-green-600/90', to: 'dark:to-emerald-600/90' },
    purple: { from: 'dark:from-purple-600/90', to: 'dark:to-pink-600/90' },
    orange: { from: 'dark:from-orange-600/90', to: 'dark:to-amber-600/90' },
    red: { from: 'dark:from-red-600/90', to: 'dark:to-rose-600/90' },
  };

  const hoverColorMap: Record<string, string> = {
    blue: 'hover:shadow-blue-500/30',
    green: 'hover:shadow-green-500/30',
    purple: 'hover:shadow-purple-500/30',
    orange: 'hover:shadow-orange-500/30',
    red: 'hover:shadow-red-500/30',
  };

  const glowColorMap: Record<string, { from: string; to: string }> = {
    blue: { from: 'from-blue-400', to: 'to-indigo-400' },
    green: { from: 'from-green-400', to: 'to-emerald-400' },
    purple: { from: 'from-purple-400', to: 'to-pink-400' },
    orange: { from: 'from-orange-400', to: 'to-amber-400' },
    red: { from: 'from-red-400', to: 'to-rose-400' },
  };

  const c = colorMap[color] || colorMap.blue;
  const dc = darkColorMap[color] || darkColorMap.blue;
  const hc = hoverColorMap[color] || hoverColorMap.blue;
  const gc = glowColorMap[color] || glowColorMap.blue;

  return (
    <span
      className={`relative group bg-gradient-to-r ${c.from} ${c.to} ${dc.from} ${dc.to} text-white px-3 py-1 rounded-full text-xs font-medium shadow-md hover:shadow-lg ${hc} transition-all duration-300 hover:scale-105`}
    >
      <span
        className={`absolute inset-0 bg-gradient-to-r ${gc.from} ${gc.to} rounded-full opacity-0 group-hover:opacity-20 blur transition-opacity duration-300`}
      ></span>
      <span className='relative'>{children}</span>
    </span>
  );
}
