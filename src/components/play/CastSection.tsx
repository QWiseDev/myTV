'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { memo, useCallback } from 'react';

import type { Celebrity } from '@/lib/types';
import { useImageFallback } from '@/hooks/useImageFallback';

interface CastSectionProps {
  celebrities: Celebrity[];
  onCelebrityClick?: (name: string) => void;
}

interface CastAvatarProps {
  avatar: string;
  name: string;
}

function CastAvatar({ avatar, name }: CastAvatarProps) {
  const { imageSrc, handleError } = useImageFallback(avatar);

  if (!imageSrc) {
    return null;
  }

  return (
    <Image
      src={imageSrc}
      alt={name}
      width={80}
      height={80}
      unoptimized={
        imageSrc.startsWith('http://') ||
        imageSrc.startsWith('https://') ||
        imageSrc.startsWith('/api/image-proxy')
      }
      referrerPolicy='no-referrer'
      className='w-full h-full object-cover'
      onError={handleError}
    />
  );
}

/**
 * 演员阵容组件 - 展示演员头像、姓名和角色
 * 使用 React.memo 防止不必要的重新渲染
 */
const CastSection = memo(function CastSection({
  celebrities,
  onCelebrityClick,
}: CastSectionProps) {
  const router = useRouter();

  const handleClick = useCallback(
    (name: string) => {
      if (onCelebrityClick) {
        onCelebrityClick(name);
      } else {
        // 默认跳转到搜索页面
        router.push(`/?search=${encodeURIComponent(name)}`);
      }
    },
    [onCelebrityClick, router],
  );

  // 如果没有演员数据，不显示
  if (!celebrities || celebrities.length === 0) {
    return null;
  }

  return (
    <div className='mt-6 border-t border-gray-200 dark:border-gray-700 pt-5'>
      <h3 className='text-base font-semibold text-gray-800 dark:text-gray-200 mb-4'>
        演职员
      </h3>
      <div className='flex gap-3 overflow-x-auto pb-4 scrollbar-hide'>
        {celebrities.slice(0, 15).map((celebrity) => (
          <div
            key={celebrity.id}
            onClick={() => handleClick(celebrity.name)}
            className='w-[96px] shrink-0 group cursor-pointer'
          >
            {/* 爱奇艺式照片卡：圆角竖版照片 + 底部姓名渐变叠字 */}
            <div className='relative w-[96px] h-[128px] rounded-lg overflow-hidden bg-gray-200 dark:bg-[#2a2a2a] transition-transform duration-300 group-hover:scale-[1.03]'>
              <CastAvatar avatar={celebrity.avatar} name={celebrity.name} />
              <div className='absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent px-2 pt-5 pb-1.5'>
                <p
                  className='text-xs font-medium text-white truncate'
                  title={celebrity.name}
                >
                  {celebrity.name}
                </p>
              </div>
            </div>
            {celebrity.role && (
              <p
                className='mt-1.5 text-[11px] leading-4 text-gray-500 dark:text-gray-500 truncate'
                title={celebrity.role}
              >
                {celebrity.role}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
});

export default CastSection;
