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
      className='relative flex items-center space-x-2 rounded-md border border-[#b85c38]/30 bg-[#d97757] px-4 py-2 font-medium text-white shadow-sm transition-all hover:-translate-y-0.5 hover:bg-[#b85c38] hover:shadow-md dark:border-[#f0b195]/30 dark:bg-[#e09a7a] dark:text-[#141413] dark:hover:bg-[#f0b195]'
      title='AI影视推荐'
    >
      <Brain className='h-4 w-4 transition-transform duration-300 group-hover:rotate-6' />
      <span>AI推荐</span>
    </button>
  );
}
