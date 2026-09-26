'use client';

import type { Dispatch, SetStateAction } from 'react';
import { useEffect } from 'react';

import type { SkipSegment } from '@/lib/db.client';

import type { NewSkipSegment, SkipBatchSettings } from './types';

interface SkipSettingsDialogProps {
  batchSettings: SkipBatchSettings;
  setBatchSettings: Dispatch<SetStateAction<SkipBatchSettings>>;
  newSegment: NewSkipSegment;
  setNewSegment: Dispatch<SetStateAction<NewSkipSegment>>;
  isAdvancedSettingsOpen: boolean;
  onToggleAdvancedSettings: () => void;
  onClose: () => void;
  onMarkOpeningEnd: () => void;
  onMarkEndingStart: () => void;
  onSaveBatchSettings: () => void;
  onSaveSegment: () => void;
}

/**
 * 智能跳过设置弹窗。从 SkipController 拆出，JSX 与交互行为保持一致。
 */
export function SkipSettingsDialog({
  batchSettings,
  setBatchSettings,
  newSegment,
  setNewSegment,
  isAdvancedSettingsOpen,
  onToggleAdvancedSettings,
  onClose,
  onMarkOpeningEnd,
  onMarkEndingStart,
  onSaveBatchSettings,
  onSaveSegment,
}: SkipSettingsDialogProps) {
  // 监听 ESC 键关闭弹窗（组件仅在设置模式挂载，等价于原先按 isSettingMode 门控的监听）
  useEffect(() => {
    const handleEscKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleEscKey);
    return () => {
      window.removeEventListener('keydown', handleEscKey);
    };
  }, [onClose]);

  return (
    <div
      className='fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[9999] p-4 animate-fade-in'
      onClick={onClose}
    >
      <div
        className='bg-white/95 dark:bg-gray-800/95 backdrop-blur-xl rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-[0_20px_60px_0_rgba(0,0,0,0.4)] border border-white/20 dark:border-gray-700/50 animate-scale-in'
        style={{
          backdropFilter: 'blur(20px) saturate(180%)',
          WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题栏带关闭按钮 */}
        <div className='flex items-center justify-between mb-6 border-b border-gray-200/50 dark:border-gray-700/50 pb-4'>
          <h3 className='text-xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2'>
            <span className='text-2xl'>⚙️</span>
            智能跳过设置
          </h3>
          <button
            onClick={onClose}
            className='flex items-center justify-center w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors'
            title='关闭 (ESC)'
          >
            <svg
              className='w-5 h-5'
              fill='none'
              stroke='currentColor'
              viewBox='0 0 24 24'
            >
              <path
                strokeLinecap='round'
                strokeLinejoin='round'
                strokeWidth={2}
                d='M6 18L18 6M6 6l12 12'
              />
            </svg>
          </button>
        </div>

        {/* 全局开关 */}
        <div className='bg-gradient-to-br from-blue-50/80 to-indigo-50/80 dark:from-blue-900/30 dark:to-indigo-900/30 p-4 rounded-xl mb-6 border border-blue-100/50 dark:border-blue-800/50 shadow-sm backdrop-blur-sm flex flex-col gap-3'>
          <label className='flex items-center justify-between cursor-pointer group'>
            <span className='text-sm font-medium text-gray-900 dark:text-gray-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors'>
              启用自动跳过
            </span>
            <div className='relative inline-flex items-center cursor-pointer'>
              <input
                type='checkbox'
                className='sr-only peer'
                checked={batchSettings.autoSkip}
                onChange={(e) => {
                  const newValue = e.target.checked;
                  setBatchSettings({
                    ...batchSettings,
                    autoSkip: newValue,
                  });
                  localStorage.setItem(
                    'enableAutoSkip',
                    JSON.stringify(newValue)
                  );
                  window.dispatchEvent(new Event('localStorageChanged'));
                }}
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
            </div>
          </label>

          <label className='flex items-center justify-between cursor-pointer group'>
            <span className='text-sm font-medium text-gray-900 dark:text-gray-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors'>
              片尾自动切集
            </span>
            <div className='relative inline-flex items-center cursor-pointer'>
              <input
                type='checkbox'
                className='sr-only peer'
                checked={batchSettings.autoNextEpisode}
                onChange={(e) => {
                  const newValue = e.target.checked;
                  setBatchSettings({
                    ...batchSettings,
                    autoNextEpisode: newValue,
                  });
                  localStorage.setItem(
                    'enableAutoNextEpisode',
                    JSON.stringify(newValue)
                  );
                  window.dispatchEvent(new Event('localStorageChanged'));
                }}
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
            </div>
          </label>
        </div>

        {/* 主要设置区：片头 & 片尾 */}
        <div className='grid grid-cols-1 gap-4 mb-6'>
          {/* 片头卡片 */}
          <div className='relative overflow-hidden bg-gradient-to-br from-green-50/50 to-emerald-50/50 dark:from-green-900/20 dark:to-emerald-900/20 p-4 rounded-xl border border-green-100/50 dark:border-green-800/50'>
            <div className='flex items-center justify-between mb-3'>
              <div className='flex items-center gap-2'>
                <span className='text-2xl'>🎬</span>
                <div>
                  <h4 className='font-bold text-gray-900 dark:text-gray-100'>
                    片头
                  </h4>
                  <p className='text-xs text-gray-500 dark:text-gray-400'>
                    当前: 跳过前 {batchSettings.openingEnd}
                  </p>
                </div>
              </div>
            </div>

            <div className='flex gap-2'>
              <button
                onClick={onMarkOpeningEnd}
                className='flex-1 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-semibold transition-all shadow-md active:scale-95 flex items-center justify-center gap-2'
              >
                <span>📍 标记此处为片头结束</span>
              </button>
            </div>
          </div>

          {/* 片尾卡片 */}
          <div className='relative overflow-hidden bg-gradient-to-br from-purple-50/50 to-pink-50/50 dark:from-purple-900/20 dark:to-pink-900/20 p-4 rounded-xl border border-purple-100/50 dark:border-purple-800/50'>
            <div className='flex items-center justify-between mb-3'>
              <div className='flex items-center gap-2'>
                <span className='text-2xl'>🎭</span>
                <div>
                  <h4 className='font-bold text-gray-900 dark:text-gray-100'>
                    片尾
                  </h4>
                  <p className='text-xs text-gray-500 dark:text-gray-400'>
                    {batchSettings.endingMode === 'remaining'
                      ? `当前: 剩余 ${batchSettings.endingStart} 跳过`
                      : `当前: 第 ${batchSettings.endingStart} 跳过`}
                  </p>
                </div>
              </div>
            </div>

            <div className='flex gap-2'>
              <button
                onClick={onMarkEndingStart}
                className='flex-1 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-semibold transition-all shadow-md active:scale-95 flex items-center justify-center gap-2'
              >
                <span>📍 标记此处为片尾开始</span>
              </button>
            </div>
          </div>
        </div>

        {/* 底部操作栏 */}
        <div className='flex gap-3'>
          <button
            onClick={onSaveBatchSettings}
            className='flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-lg transition-all shadow-lg hover:shadow-blue-500/30 active:scale-95'
          >
            保存设置
          </button>
        </div>

        {/* 高级设置折叠区 */}
        <div className='mt-6 pt-4 border-t border-gray-100 dark:border-gray-700'>
          <button
            onClick={onToggleAdvancedSettings}
            className='flex items-center justify-center w-full text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors gap-1 py-2'
          >
            {isAdvancedSettingsOpen ? '收起高级设置' : '展开高级设置'}
            <svg
              className={`w-3 h-3 transition-transform ${
                isAdvancedSettingsOpen ? 'rotate-180' : ''
              }`}
              fill='none'
              stroke='currentColor'
              viewBox='0 0 24 24'
            >
              <path
                strokeLinecap='round'
                strokeLinejoin='round'
                strokeWidth={2}
                d='M19 9l-7 7-7 7'
              />
            </svg>
          </button>

          {isAdvancedSettingsOpen && (
            <div className='mt-4 space-y-6 animate-fade-in'>
              {/* 片头详细设置 */}
              <div className='space-y-3'>
                <label className='block text-xs font-semibold text-gray-500 uppercase tracking-wider'>
                  片头微调
                </label>
                <div className='grid grid-cols-2 gap-3'>
                  <div>
                    <label className='block text-xs text-gray-500 mb-1'>
                      开始时间
                    </label>
                    <input
                      type='text'
                      value={batchSettings.openingStart}
                      onChange={(e) =>
                        setBatchSettings({
                          ...batchSettings,
                          openingStart: e.target.value,
                        })
                      }
                      className='w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900/50'
                    />
                  </div>
                  <div>
                    <label className='block text-xs text-gray-500 mb-1'>
                      结束时间
                    </label>
                    <input
                      type='text'
                      value={batchSettings.openingEnd}
                      onChange={(e) =>
                        setBatchSettings({
                          ...batchSettings,
                          openingEnd: e.target.value,
                        })
                      }
                      className='w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900/50'
                    />
                  </div>
                </div>
              </div>

              {/* 片尾详细设置 */}
              <div className='space-y-3'>
                <label className='block text-xs font-semibold text-gray-500 uppercase tracking-wider'>
                  片尾微调
                </label>
                <div className='flex gap-2 text-xs mb-2'>
                  <label className='flex items-center px-3 py-1.5 rounded-full bg-gray-100 dark:bg-gray-800 cursor-pointer'>
                    <input
                      type='radio'
                      name='endingMode'
                      value='remaining'
                      checked={batchSettings.endingMode === 'remaining'}
                      onChange={(e) =>
                        setBatchSettings({
                          ...batchSettings,
                          endingMode: e.target
                            .value as SkipBatchSettings['endingMode'],
                        })
                      }
                      className='mr-1.5'
                    />
                    剩余时间模式
                  </label>
                  <label className='flex items-center px-3 py-1.5 rounded-full bg-gray-100 dark:bg-gray-800 cursor-pointer'>
                    <input
                      type='radio'
                      name='endingMode'
                      value='absolute'
                      checked={batchSettings.endingMode === 'absolute'}
                      onChange={(e) =>
                        setBatchSettings({
                          ...batchSettings,
                          endingMode: e.target
                            .value as SkipBatchSettings['endingMode'],
                        })
                      }
                      className='mr-1.5'
                    />
                    绝对时间模式
                  </label>
                </div>
                <div className='grid grid-cols-2 gap-3'>
                  <div>
                    <label className='block text-xs text-gray-500 mb-1'>
                      开始时间
                    </label>
                    <input
                      type='text'
                      value={batchSettings.endingStart}
                      onChange={(e) =>
                        setBatchSettings({
                          ...batchSettings,
                          endingStart: e.target.value,
                        })
                      }
                      className='w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900/50'
                    />
                  </div>
                  <div>
                    <label className='block text-xs text-gray-500 mb-1'>
                      结束时间 (可选)
                    </label>
                    <input
                      type='text'
                      value={batchSettings.endingEnd}
                      onChange={(e) =>
                        setBatchSettings({
                          ...batchSettings,
                          endingEnd: e.target.value,
                        })
                      }
                      placeholder='直接跳下一集'
                      className='w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900/50'
                    />
                  </div>
                </div>
              </div>

              {/* 特殊片段添加 */}
              <div className='pb-4'>
                <label className='block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3'>
                  添加特殊片段
                </label>
                <div className='bg-gray-50 dark:bg-gray-900/50 p-3 rounded-lg border border-gray-100 dark:border-gray-800 space-y-3'>
                  <select
                    value={newSegment.type || ''}
                    onChange={(e) =>
                      setNewSegment({
                        ...newSegment,
                        type: e.target.value as SkipSegment['type'],
                      })
                    }
                    className='w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800'
                  >
                    <option value=''>选择类型...</option>
                    <option value='opening'>片头</option>
                    <option value='ending'>片尾</option>
                  </select>
                  <div className='grid grid-cols-2 gap-3'>
                    <input
                      type='number'
                      placeholder='开始(秒)'
                      value={newSegment.start || ''}
                      onChange={(e) =>
                        setNewSegment({
                          ...newSegment,
                          start: parseFloat(e.target.value),
                        })
                      }
                      className='w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800'
                    />
                    <input
                      type='number'
                      placeholder='结束(秒)'
                      value={newSegment.end || ''}
                      onChange={(e) =>
                        setNewSegment({
                          ...newSegment,
                          end: parseFloat(e.target.value),
                        })
                      }
                      className='w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800'
                    />
                  </div>
                  <button
                    onClick={onSaveSegment}
                    className='w-full py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded text-sm font-medium transition-colors'
                  >
                    添加独立片段
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <style jsx>{`
        @keyframes fade-in {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes scale-in {
          from {
            opacity: 0;
            transform: scale(0.95);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
        .animate-fade-in {
          animation: fade-in 0.3s ease-out;
        }
        .animate-scale-in {
          animation: scale-in 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}
