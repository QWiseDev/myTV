'use client';

import SkeletonRow from './SkeletonRow';

interface SectionSkeletonProps {
  title: string;
}

/**
 * 区块骨架屏组件 - 用于数据加载时的占位显示
 */
export default function SectionSkeleton({ title }: SectionSkeletonProps) {
  return (
    <section className='mb-8'>
      <div className='mb-4 flex items-center justify-between'>
        <div className='h-8 w-32 bg-gray-200 dark:bg-gray-700 rounded animate-pulse' />
        <div className='h-6 w-20 bg-gray-200 dark:bg-gray-700 rounded animate-pulse' />
      </div>
      <div className='flex gap-4 overflow-hidden'>
        <SkeletonRow />
      </div>
    </section>
  );
}
