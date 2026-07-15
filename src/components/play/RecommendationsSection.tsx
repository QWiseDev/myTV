'use client';

import Image from 'next/image';
import { useEffect, useMemo, useState } from 'react';

import { getImageFallbackUrls, processImageUrl } from '@/lib/utils';
import { navigateVideoCardPlayUrl } from '@/lib/video-card-utils';

interface RecommendationItem {
  id: string;
  title: string;
  poster: string;
  rate: string;
}

interface RecommendationsSectionProps {
  recommendations: RecommendationItem[];
  /**
   * 当前影片是否是剧集（用于显示"喜欢这部剧"还是"喜欢这部电影"）
   */
  isEpisodic?: boolean;
}

interface RecommendationPosterProps {
  poster: string;
  title: string;
}

function RecommendationPoster({ poster, title }: RecommendationPosterProps) {
  const [fallbackIndex, setFallbackIndex] = useState(0);
  const [failed, setFailed] = useState(false);
  const normalizedPoster = poster.replace(/^http:/, 'https:');
  const fallbackUrls = useMemo(
    () => getImageFallbackUrls(normalizedPoster),
    [normalizedPoster],
  );
  const imageSrc =
    fallbackUrls[fallbackIndex] || processImageUrl(normalizedPoster);

  useEffect(() => {
    setFallbackIndex(0);
    setFailed(false);
  }, [normalizedPoster]);

  if (!imageSrc || failed) {
    return null;
  }

  return (
    <Image
      src={imageSrc}
      alt={title}
      fill
      sizes='(min-width: 1280px) 16vw, (min-width: 1024px) 20vw, (min-width: 768px) 25vw, (min-width: 640px) 33vw, 50vw'
      unoptimized={
        imageSrc.startsWith('http://') ||
        imageSrc.startsWith('https://') ||
        imageSrc.startsWith('/api/image-proxy')
      }
      referrerPolicy='no-referrer'
      className='w-full h-full object-cover transition-transform duration-300 group-hover:scale-105'
      onError={() => {
        if (fallbackIndex < fallbackUrls.length - 1) {
          setFallbackIndex((index) => index + 1);
          return;
        }
        setFailed(true);
      }}
    />
  );
}

/**
 * 推荐影片展示组件
 * 显示"喜欢这部剧/电影的人也喜欢"区域
 */
export default function RecommendationsSection({
  recommendations,
  isEpisodic = false,
}: RecommendationsSectionProps) {
  if (!recommendations || recommendations.length === 0) {
    return null;
  }

  const handleItemClick = (item: RecommendationItem) => {
    const playUrl = `/play?title=${encodeURIComponent(item.title)}&douban_id=${
      item.id
    }&prefer=true`;
    navigateVideoCardPlayUrl(playUrl);
  };

  return (
    <div className='mt-6 border-t border-gray-200 dark:border-gray-700 pt-6'>
      <h3 className='text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4 flex items-center gap-2'>
        <span>💡</span>
        <span>喜欢这部{isEpisodic ? '剧' : '电影'}的人也喜欢</span>
      </h3>
      <div className='grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3'>
        {recommendations.map((item) => (
          <div
            key={item.id}
            onClick={() => handleItemClick(item)}
            className='cursor-pointer group'
            style={{
              WebkitTapHighlightColor: 'transparent',
              touchAction: 'manipulation',
            }}
          >
            {/* 影片卡片 */}
            <div className='relative overflow-hidden rounded-lg bg-gray-200 dark:bg-gray-700 aspect-[2/3] shadow-md hover:shadow-xl transition-all duration-300 group-hover:scale-[1.02]'>
              {/* 海报 */}
              <RecommendationPoster poster={item.poster} title={item.title} />

              {/* 渐变遮罩 */}
              <div className='absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-100' />

              {/* 评分标签 */}
              {item.rate && parseFloat(item.rate) > 0 && (
                <div className='absolute top-2 right-2 bg-yellow-500/90 backdrop-blur-sm text-white text-xs font-bold px-1.5 py-0.5 rounded shadow-lg'>
                  ⭐ {item.rate}
                </div>
              )}

              {/* 标题 */}
              <div className='absolute bottom-0 left-0 right-0 p-2'>
                <p className='text-white text-sm font-medium line-clamp-2 drop-shadow-md'>
                  {item.title}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
