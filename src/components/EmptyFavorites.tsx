'use client';

/**
 * 收藏夹空状态组件 - 显示空心爱心图标和提示文字
 */
export default function EmptyFavorites() {
  return (
    <div className='col-span-full flex flex-col items-center justify-center py-16 px-4'>
      <div className='mb-6 relative'>
        <div className='absolute inset-0 bg-gradient-to-r from-pink-300 to-purple-300 dark:from-pink-600 dark:to-purple-600 opacity-20 blur-3xl rounded-full animate-pulse'></div>
        <svg
          className='w-32 h-32 relative z-10'
          viewBox='0 0 200 200'
          fill='none'
          xmlns='http://www.w3.org/2000/svg'
        >
          <path
            d='M100 170C100 170 30 130 30 80C30 50 50 30 70 30C85 30 95 40 100 50C105 40 115 30 130 30C150 30 170 50 170 80C170 130 100 170 100 170Z'
            className='fill-gray-300 dark:fill-gray-600 stroke-gray-400 dark:stroke-gray-500 transition-colors duration-300'
            strokeWidth='3'
          />
          <path
            d='M100 170C100 170 30 130 30 80C30 50 50 30 70 30C85 30 95 40 100 50C105 40 115 30 130 30C150 30 170 50 170 80C170 130 100 170 100 170Z'
            fill='none'
            stroke='currentColor'
            strokeWidth='2'
            strokeDasharray='5,5'
            className='text-gray-400 dark:text-gray-500'
          />
        </svg>
      </div>

      <h3 className='text-xl font-semibold text-gray-700 dark:text-gray-300 mb-2'>
        收藏夹空空如也
      </h3>
      <p className='text-sm text-gray-500 dark:text-gray-400 text-center max-w-xs'>
        快去发现喜欢的影视作品，点击 ❤️ 添加到收藏吧！
      </p>
    </div>
  );
}
