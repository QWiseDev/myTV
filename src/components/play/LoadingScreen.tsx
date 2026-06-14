import PageLayout from '@/components/PageLayout';

interface LoadingScreenProps {
  loadingStage?: string;
  loadingMessage?: string;
  speedTestProgress?: {
    current: number;
    total: number;
    currentSource: string;
    result?: string;
  } | null;
}

export default function LoadingScreen({
  loadingStage = 'searching',
  loadingMessage = '正在加载...',
  speedTestProgress,
}: LoadingScreenProps) {
  return (
    <PageLayout activePath='/play'>
      <div className='flex items-center justify-center min-h-screen bg-transparent'>
        <div className='text-center max-w-md mx-auto px-6'>
          {/* 动画影院图标 */}
          <div className='relative mb-8'>
            <div className='relative mx-auto w-24 h-24 bg-gradient-to-r from-green-500 to-emerald-600 rounded-2xl shadow-2xl flex items-center justify-center transform hover:scale-105 transition-transform duration-300'>
              <div className='text-white text-4xl'>
                {loadingStage === 'searching' && '🔍'}
                {loadingStage === 'preferring' && '⚡'}
                {loadingStage === 'fetching' && '🎬'}
                {loadingStage === 'ready' && '✨'}
              </div>
              {/* 旋转光环 */}
              <div className='absolute -inset-2 bg-gradient-to-r from-green-500 to-emerald-600 rounded-2xl opacity-20 animate-spin'></div>
            </div>

            {/* 浮动粒子效果 */}
            <div className='absolute top-0 left-0 w-full h-full pointer-events-none'>
              <div className='absolute top-2 left-2 w-2 h-2 bg-green-400 rounded-full animate-bounce'></div>
              <div
                className='absolute top-4 right-4 w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce'
                style={{ animationDelay: '0.5s' }}
              ></div>
              <div
                className='absolute bottom-3 left-6 w-1 h-1 bg-lime-400 rounded-full animate-bounce'
                style={{ animationDelay: '1s' }}
              ></div>
            </div>
          </div>

          {/* 进度指示器 */}
          <div className='mb-6 w-80 mx-auto'>
            <div className='flex justify-center space-x-2 mb-4'>
              <div
                className={`w-3 h-3 rounded-full transition-all duration-500 ${
                  loadingStage === 'searching' || loadingStage === 'fetching'
                    ? 'bg-green-500 scale-125'
                    : loadingStage === 'preferring' || loadingStage === 'ready'
                    ? 'bg-green-500'
                    : 'bg-gray-300'
                }`}
              ></div>
              <div
                className={`w-3 h-3 rounded-full transition-all duration-500 ${
                  loadingStage === 'preferring'
                    ? 'bg-green-500 scale-125'
                    : loadingStage === 'ready'
                    ? 'bg-green-500'
                    : 'bg-gray-300'
                }`}
              ></div>
              <div
                className={`w-3 h-3 rounded-full transition-all duration-500 ${
                  loadingStage === 'ready' ? 'bg-green-500 scale-125' : 'bg-gray-300'
                }`}
              ></div>
            </div>

            {/* 进度条 */}
            <div className='w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden'>
              <div
                className='h-full bg-gradient-to-r from-green-500 to-emerald-600 rounded-full transition-all duration-1000 ease-out'
                style={{
                  width:
                    loadingStage === 'searching' || loadingStage === 'fetching'
                      ? '33%'
                      : loadingStage === 'preferring'
                      ? '66%'
                      : '100%',
                }}
              ></div>
            </div>
          </div>

          {/* 加载消息 */}
          <div className='space-y-3'>
            <p className='text-xl font-semibold text-gray-800 dark:text-gray-200 animate-pulse'>
              {loadingMessage}
            </p>

            {/* 测速进度显示 */}
            {speedTestProgress && (
              <div className='mt-4 space-y-2'>
                <div className='flex items-center justify-center gap-2 text-sm text-gray-600 dark:text-gray-400'>
                  <span className='font-medium'>
                    [{speedTestProgress.current}/{speedTestProgress.total}]
                  </span>
                  <span className='text-green-600 dark:text-green-400'>
                    {speedTestProgress.currentSource}
                  </span>
                </div>
                {speedTestProgress.result && (
                  <div className='text-xs text-gray-500 dark:text-gray-500 font-mono'>
                    {speedTestProgress.result}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
