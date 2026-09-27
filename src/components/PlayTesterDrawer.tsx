import { XMarkIcon } from '@heroicons/react/24/outline';
import { createPortal } from 'react-dom';

import type {
  PlayerState,
  PlayTesterDrawerState,
} from '@/hooks/usePlayTester';

export interface PlayTesterDrawerProps {
  /** 客户端挂载标记，未挂载时不渲染 Portal */
  mounted: boolean;
  playTester: PlayTesterDrawerState;
  playDrawerAnimating: boolean;
  playerState: PlayerState;
  videoRef: React.MutableRefObject<HTMLVideoElement | null>;
  latestPlayUrlRef: React.MutableRefObject<string | undefined>;
  handleClosePlayTester: () => void;
  handleSelectPlayResult: (index: number) => void;
  handleSelectPlayLine: (index: number) => void;
  handleSelectPlayEpisode: (index: number) => void;
}

/**
 * 播放检测抽屉：结果/线路/剧集三栏选择与内嵌检测播放器，
 * 拆分自 SourceTestModule 原 Portal JSX,文案与结构原样保留。
 */
export function PlayTesterDrawer({
  mounted,
  playTester,
  playDrawerAnimating,
  playerState,
  videoRef,
  latestPlayUrlRef,
  handleClosePlayTester,
  handleSelectPlayResult,
  handleSelectPlayLine,
  handleSelectPlayEpisode,
}: PlayTesterDrawerProps) {
  return (
    <>
      {mounted &&
        playTester.visible &&
        createPortal(
          <>
            <div
              className={`fixed inset-0 bg-black z-[1180] transition-opacity duration-300 ${
                playDrawerAnimating ? 'bg-opacity-50' : 'bg-opacity-0'
              }`}
              onClick={handleClosePlayTester}
            />
            <div
              className={`fixed inset-y-0 right-0 z-[1190] w-full md:w-5/6 lg:w-3/4 xl:w-2/3 bg-white dark:bg-gray-900 shadow-2xl transition-transform duration-300 ease-in-out flex flex-col ${
                playDrawerAnimating ? 'translate-x-0' : 'translate-x-full'
              }`}
            >
              <div className='flex items-center justify-between p-4 sm:p-5 border-b border-gray-200 dark:border-gray-800 shadow-sm'>
                <div className='flex-1 min-w-0'>
                  <div className='flex items-center gap-2'>
                    <h3 className='text-lg sm:text-xl font-semibold text-gray-900 dark:text-white'>
                      播放检测
                    </h3>
                    {playTester.sourceName && (
                      <span className='px-2 py-1 text-xs bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded'>
                        {playTester.sourceName}
                      </span>
                    )}
                  </div>
                  {playerState.message && (
                    <p
                      className={`text-xs sm:text-sm mt-1 ${
                        playerState.status === 'error'
                          ? 'text-red-500'
                          : 'text-gray-500'
                      }`}
                    >
                      {playerState.message}
                      {playerState.details && `（${playerState.details}）`}
                    </p>
                  )}
                </div>
                <button
                  onClick={handleClosePlayTester}
                  className='p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300'
                  title='关闭 (ESC)'
                >
                  <XMarkIcon className='w-6 h-6' />
                </button>
              </div>

              <div className='flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 bg-gray-50 dark:bg-gray-950/60'>
                {/* 结果列表与线路选择 */}
                <div className='grid grid-cols-1 lg:grid-cols-3 gap-4'>
                  <div className='bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg shadow-sm overflow-hidden'>
                    <div className='px-3 py-2 border-b border-gray-200 dark:border-gray-800 text-sm font-medium text-gray-700 dark:text-gray-200'>
                      搜索结果 ({playTester.parsedResults.length})
                    </div>
                    <div className='max-h-80 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800'>
                      {playTester.parsedResults.map((item, idx) => (
                        <button
                          key={`${item.info.id}-${idx}`}
                          onClick={() => handleSelectPlayResult(idx)}
                          className={`w-full text-left px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors ${
                            playTester.selectedResultIndex === idx
                              ? 'bg-blue-50 dark:bg-blue-900/30'
                              : ''
                          }`}
                        >
                          <div className='flex items-center justify-between gap-2'>
                            <div className='truncate text-sm text-gray-900 dark:text-white'>
                              {item.info.title}
                            </div>
                            <span className='text-xs text-gray-500'>
                              {item.lines.length} 条线路
                            </span>
                          </div>
                          <div className='text-xs text-gray-500 truncate'>
                            ID: {item.info.id}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className='bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg shadow-sm p-3 space-y-3'>
                    <div className='flex items-center justify-between text-sm text-gray-700 dark:text-gray-200'>
                      <span>线路 / 剧集</span>
                      {playerState.url && (
                        <span className='text-xs text-gray-500 truncate max-w-[12rem]'>
                          {playerState.url}
                        </span>
                      )}
                    </div>
                    <div className='flex flex-wrap gap-2'>
                      {playTester.parsedResults[
                        playTester.selectedResultIndex
                      ]?.lines.map((line, idx) => (
                        <button
                          key={line.lineIndex}
                          onClick={() => handleSelectPlayLine(idx)}
                          className={`px-3 py-1 rounded-full border text-xs ${
                            playTester.selectedLineIndex === idx
                              ? 'bg-blue-600 text-white border-blue-600'
                              : 'border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800'
                          }`}
                        >
                          {line.label}（{line.episodes.length}）
                        </button>
                      ))}
                    </div>
                    <div className='flex flex-wrap gap-2 max-h-32 overflow-y-auto'>
                      {playTester.parsedResults[
                        playTester.selectedResultIndex
                      ]?.lines[playTester.selectedLineIndex]?.episodes.map(
                        (ep, idx) => (
                          <button
                            key={`${ep.title}-${idx}`}
                            onClick={() => handleSelectPlayEpisode(idx)}
                            className={`px-3 py-1 rounded-lg text-xs border ${
                              playTester.selectedEpisodeIndex === idx
                                ? 'bg-green-600 text-white border-green-600'
                                : 'border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800'
                            }`}
                            title={ep.url}
                          >
                            {ep.title || `第${idx + 1}集`}
                          </button>
                        )
                      )}
                    </div>
                    <div className='text-xs text-gray-500 dark:text-gray-400'>
                      提示：若提示跨域或 403，可在源配置中添加代理或白名单。
                    </div>
                  </div>

                  <div className='bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg shadow-sm p-3 flex flex-col gap-3'>
                    <div className='flex items-center justify-between text-sm text-gray-700 dark:text-gray-200'>
                      <span>播放器</span>
                      <span
                        className={`text-xs ${
                          playerState.status === 'error'
                            ? 'text-red-500'
                            : playerState.status === 'playing'
                            ? 'text-green-600'
                            : 'text-gray-500'
                        }`}
                      >
                        {playerState.status === 'loading'
                          ? '检测中...'
                          : playerState.status === 'playing'
                          ? '播放成功'
                          : playerState.status === 'error'
                          ? '播放异常'
                          : '待检测'}
                      </span>
                    </div>
                    <div className='aspect-video bg-black rounded-lg overflow-hidden flex items-center justify-center'>
                      <video
                        ref={videoRef}
                        className='w-full h-full'
                        controls
                        playsInline
                        muted
                        crossOrigin='anonymous'
                      />
                    </div>
                    {playerState.title && (
                      <div className='text-xs text-gray-600 dark:text-gray-300'>
                        {playerState.title}
                      </div>
                    )}
                    {latestPlayUrlRef.current && (
                      <div className='text-xs text-gray-500 break-all'>
                        {latestPlayUrlRef.current}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </>,
          document.body
        )}
    </>
  );
}
