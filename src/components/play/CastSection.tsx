'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { memo, useCallback } from 'react';

import type { Celebrity } from '@/lib/types';

interface CastSectionProps {
  celebrities: Celebrity[];
  onCelebrityClick?: (name: string) => void;
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
    <div className='mt-6 border-t border-gray-200 dark:border-gray-700 pt-6'>
      <h3 className='text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4 flex items-center gap-2'>
        <span>🎭</span>
        <span>演员阵容</span>
      </h3>
      <div className='flex gap-4 overflow-x-auto pb-4 scrollbar-hide'>
        {celebrities.slice(0, 15).map((celebrity) => (
          <div
            key={celebrity.id}
            onClick={() => handleClick(celebrity.name)}
            className='shrink-0 text-center group cursor-pointer'
          >
            <div className='w-20 h-20 rounded-full overflow-hidden bg-gray-200 dark:bg-gray-700 mb-2 ring-2 ring-transparent group-hover:ring-blue-500 transition-all duration-300 group-hover:scale-110 shadow-md group-hover:shadow-xl'>
              <Image
                src={celebrity.avatar}
                alt={celebrity.name}
                width={80}
                height={80}
                unoptimized
                className='w-full h-full object-cover'
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
            </div>
            <p
              className='text-xs font-medium text-gray-700 dark:text-gray-300 w-20 truncate group-hover:text-blue-500 transition-colors'
              title={celebrity.name}
            >
              {celebrity.name}
            </p>
            {celebrity.role && (
              <p
                className='text-[10px] text-gray-500 dark:text-gray-500 w-20 truncate mt-0.5'
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
