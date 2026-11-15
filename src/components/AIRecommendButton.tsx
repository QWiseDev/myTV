'use client';

import { Brain } from 'lucide-react';

interface AIRecommendButtonProps {
  onClick: () => void;
}

/**
 * AI 推荐按钮组件
 */
export default function AIRecommendButton({ onClick }: AIRecommendButtonProps) {
  return (
    <button
      onClick={onClick}
      className='relative flex items-center space-x-2 rounded-md border border-[#00a304]/30 bg-[#00be06] px-4 py-2 font-medium text-white shadow-sm transition-all hover:-translate-y-0.5 hover:bg-[#00a304] hover:shadow-md dark:border-[#57e07a]/30 dark:bg-[#1acd50] dark:text-[#111111] dark:hover:bg-[#57e07a]'
      title='AI影视推荐'
    >
      <Brain className='h-4 w-4 transition-transform duration-300 group-hover:rotate-6' />
      <span>AI推荐</span>
    </button>
  );
}
