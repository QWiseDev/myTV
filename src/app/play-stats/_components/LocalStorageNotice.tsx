'use client';

interface LocalStorageNoticeProps {
  isAdmin: boolean;
}

const LocalStorageNotice = ({ isAdmin }: LocalStorageNoticeProps) => {
  return (
    <div className='max-w-6xl mx-auto px-4 py-8'>
      <div className='mb-8'>
        <h1 className='text-3xl font-bold text-gray-900 dark:text-white'>
          {isAdmin ? '播放统计' : '个人统计'}
        </h1>
        <p className='text-gray-600 dark:text-gray-400 mt-2'>
          {isAdmin
            ? '查看用户播放数据和趋势分析'
            : '查看您的个人播放记录和统计'}
        </p>
      </div>

      <div className='p-6 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800'>
        <div className='flex items-center space-x-3'>
          <div className='text-yellow-600 dark:text-yellow-400'>
            <svg
              className='w-6 h-6'
              fill='none'
              stroke='currentColor'
              viewBox='0 0 24 24'
            >
              <path
                strokeLinecap='round'
                strokeLinejoin='round'
                strokeWidth='2'
                d='M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z'
              />
            </svg>
          </div>
          <div>
            <h3 className='text-lg font-semibold text-yellow-800 dark:text-yellow-300'>
              统计功能不可用
            </h3>
            <p className='text-yellow-700 dark:text-yellow-400 mt-1'>
              当前使用本地存储模式（localStorage），不支持统计功能。
              <br />
              如需使用此功能，请配置 Redis 或 Upstash 数据库存储。
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LocalStorageNotice;
