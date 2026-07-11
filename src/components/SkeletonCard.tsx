/**
 * 海报卡骨架 — 尺寸由外层 HomeCardShell / 网格容器控制，避免双重宽度 class
 */
export default function SkeletonCard() {
  return (
    <div className='w-full'>
      {/* 海报骨架 */}
      <div className='relative aspect-[2/3] w-full overflow-hidden rounded-lg border border-[#e8e6dc] bg-[#f0eee6] dark:border-[#3d3934] dark:bg-[#302d29]'>
        {/* Shimmer 效果 */}
        <div
          className='absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/20 to-transparent'
          style={{
            animationDuration: '1.5s',
            animationIterationCount: 'infinite',
          }}
        />
        <div className='absolute inset-0 bg-[#e8e6dc] dark:bg-[#3d3934]'></div>
      </div>

      {/* 标题骨架 */}
      <div className='mt-2 space-y-2'>
        <div className='h-4 bg-[#e8e6dc] dark:bg-[#3d3934] rounded overflow-hidden relative'>
          <div
            className='absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/20 to-transparent'
            style={{
              animationDuration: '1.5s',
              animationIterationCount: 'infinite',
              animationDelay: '0.1s',
            }}
          />
        </div>
        <div className='h-3 w-3/4 bg-[#e8e6dc] dark:bg-[#3d3934] rounded overflow-hidden relative'>
          <div
            className='absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/20 to-transparent'
            style={{
              animationDuration: '1.5s',
              animationIterationCount: 'infinite',
              animationDelay: '0.2s',
            }}
          />
        </div>
      </div>
    </div>
  );
}
