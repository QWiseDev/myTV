'use client';

import { ChevronRight, LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { lazy, Suspense } from 'react';

import { DoubanItem } from '@/lib/types';

import SectionTitle from './SectionTitle';
import SkeletonRow from './SkeletonRow';

const ScrollableRow = lazy(() => import('./ScrollableRow'));

interface LazyVideoSectionProps {
  title: string;
  icon: LucideIcon;
  linkHref: string;
  data: DoubanItem[];
  loading: boolean;
  renderItem: (item: DoubanItem, index: number) => React.ReactNode;
  enableAnimation?: boolean;
}

/**
 * 懒加载视频区块组件 - 用于展示热门电影、剧集、综艺等内容
 */
export default function LazyVideoSection({
  title,
  icon: Icon,
  linkHref,
  data,
  loading,
  renderItem,
  enableAnimation = true,
}: LazyVideoSectionProps) {
  return (
    <section className='mb-8'>
      <div className='mb-4 flex items-center justify-between'>
        <SectionTitle title={title} icon={Icon} />
        <Link
          href={linkHref}
          className='flex items-center text-sm text-[#5e5d59] hover:text-[#b85c38] dark:text-[#b7b1a8] dark:hover:text-[#f0b195] transition-colors'
        >
          查看更多
          <ChevronRight className='w-4 h-4 ml-1' />
        </Link>
      </div>
      <Suspense fallback={<SkeletonRow />}>
        <ScrollableRow enableAnimation={enableAnimation}>
          {loading ? (
            <SkeletonRow />
          ) : (
            data.map((item, index) => (
              <div
                key={item.id || index}
                className='min-w-[96px] w-24 sm:min-w-[180px] sm:w-44'
              >
                {renderItem(item, index)}
              </div>
            ))
          )}
        </ScrollableRow>
      </Suspense>
    </section>
  );
}
