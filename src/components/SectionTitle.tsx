import { LucideIcon } from 'lucide-react';
import React from 'react';

interface SectionTitleProps {
  title: string;
  icon?: LucideIcon;
}

/**
 * 首页板块标题 - 爱奇艺绿统一风格
 * 图标置于白底圆角描边容器内，品牌绿色图标，hover 时微浮起并显示绿色下划线
 */
export default function SectionTitle({ title, icon: Icon }: SectionTitleProps) {
  return (
    <div className='relative inline-flex group'>
      <div className='flex items-center gap-2.5'>
        {/* 图标容器：淡米色圆角描边 + 暖色图标，悬浮时微浮起 */}
        {Icon && (
          <div className='relative flex items-center justify-center w-8 h-8 rounded-lg bg-[#ffffff] dark:bg-[#232220] ring-1 ring-[#e8e8e8] dark:ring-[#3a3a3a] shadow-sm text-[#00a304] dark:text-[#1acd50] transition-all duration-300 group-hover:scale-105 group-hover:-translate-y-0.5 group-hover:shadow-md group-hover:shadow-[#00a304]/15 group-hover:ring-[#00a304]/30 dark:group-hover:ring-[#1acd50]/40 dark:group-hover:text-[#57e07a]'>
            <Icon size={18} strokeWidth={2.25} />
          </div>
        )}

        <h2 className='text-lg sm:text-xl font-semibold tracking-normal text-[#111111] transition-colors duration-300 group-hover:text-[#00a304] dark:text-[#f5f5f5] dark:group-hover:text-[#57e07a] font-display'>
          {title}
        </h2>
      </div>

      {/* 悬浮展开的暖色渐变下划线 */}
      <div className='absolute -bottom-1.5 left-0 h-0.5 w-0 rounded-full bg-gradient-to-r from-[#00a304] to-[#00be06] transition-all duration-500 ease-out group-hover:w-full' />
    </div>
  );
}
