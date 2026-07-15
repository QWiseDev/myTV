'use client';

import type { LucideIcon } from 'lucide-react';
import { type ReactNode,useMemo } from 'react';

import { HOME_RENDER_LIMITS } from '@/lib/constants/home';
import type { DoubanItem } from '@/lib/types';

import HomeCardShell from './HomeCardShell';
import HomeSectionHeader from './HomeSectionHeader';
import ScrollableRow from './ScrollableRow';
import SkeletonRow from './SkeletonRow';

interface LazyVideoSectionProps {
  title: string;
  icon: LucideIcon;
  linkHref: string;
  data: DoubanItem[];
  loading: boolean;
  renderItem: (item: DoubanItem, index: number) => ReactNode;
  enableAnimation?: boolean;
  /** 首页横向列表渲染上限，控制图片并发 */
  limit?: number;
}

/**
 * 懒加载视频区块组件 - 用于展示热门电影、剧集、综艺等内容
 */
export default function LazyVideoSection({
  title,
  icon,
  linkHref,
  data,
  loading,
  renderItem,
  enableAnimation = true,
  limit = HOME_RENDER_LIMITS.HOT_SECTION,
}: LazyVideoSectionProps) {
  const visibleData = useMemo(
    () => (limit > 0 ? data.slice(0, limit) : data),
    [data, limit],
  );

  return (
    <section className='mb-8'>
      <HomeSectionHeader title={title} icon={icon} linkHref={linkHref} />
      <ScrollableRow enableAnimation={!loading && enableAnimation}>
        {loading ? (
          <SkeletonRow />
        ) : (
          visibleData.map((item, index) => (
            <HomeCardShell key={item.id || index}>
              {renderItem(item, index)}
            </HomeCardShell>
          ))
        )}
      </ScrollableRow>
    </section>
  );
}
