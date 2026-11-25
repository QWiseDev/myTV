/**
 * 片源库 / 黄果模块内容区加载骨架（供路由 loading.tsx 与页内加载态共用）
 */
export function SourceBrowserContentSkeleton() {
  return (
    <div className='space-y-4'>
      <div className='h-10 rounded-lg bg-[#e8e8e8] dark:bg-[#2a2a2a] animate-pulse' />
      <div className='flex flex-wrap gap-2 pb-1'>
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className='h-8 w-20 rounded-full bg-[#e8e8e8] dark:bg-[#2a2a2a] animate-pulse'
          />
        ))}
      </div>
      <div className='grid gap-x-3 gap-y-5 grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6'>
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i}>
            <div className='aspect-[2/3] rounded-lg bg-[#e8e8e8] dark:bg-[#2a2a2a] animate-pulse' />
            <div className='mt-2 h-3.5 rounded bg-[#e8e8e8] dark:bg-[#2a2a2a] animate-pulse' />
          </div>
        ))}
      </div>
    </div>
  );
}
