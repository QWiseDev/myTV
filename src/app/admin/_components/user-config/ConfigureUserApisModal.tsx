'use client';

/**
 * 配置用户采集源权限弹窗
 */

import { AdminConfig } from '@/lib/admin.types';

import { ModalShell } from './ModalShell';
import { buttonStyles } from '../adminShared';

type SourceConfig = NonNullable<AdminConfig['SourceConfig']>;

// 提取URL域名的辅助函数
const extractDomain = (url: string): string => {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch {
    // 如果URL格式不正确，返回原字符串
    return url;
  }
};

interface ConfigureUserApisModalProps {
  username: string;
  selectedApis: string[];
  onToggleApi: (api: string, checked: boolean) => void;
  onSetApis: (apis: string[]) => void;
  onClose: () => void;
  onSave: () => void;
  loading: boolean;
  sourceConfig?: SourceConfig;
}

export function ConfigureUserApisModal({
  username,
  selectedApis,
  onToggleApi,
  onSetApis,
  onClose,
  onSave,
  loading,
  sourceConfig,
}: ConfigureUserApisModalProps) {
  return (
    <ModalShell title={`配置用户采集源权限 - ${username}`} onClose={onClose}>
      <div className='mb-6'>
        <div className='bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4'>
          <div className='flex items-center space-x-2 mb-2'>
            <svg
              className='w-5 h-5 text-blue-600 dark:text-blue-400'
              fill='none'
              stroke='currentColor'
              viewBox='0 0 24 24'
            >
              <path
                strokeLinecap='round'
                strokeLinejoin='round'
                strokeWidth={2}
                d='M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z'
              />
            </svg>
            <span className='text-sm font-medium text-blue-800 dark:text-blue-300'>
              配置说明
            </span>
          </div>
          <p className='text-sm text-blue-700 dark:text-blue-400 mt-1'>
            提示：全不选为无限制，选中的采集源将限制用户只能访问这些源
          </p>
        </div>
      </div>

      {/* 采集源选择 - 多列布局 */}
      <div className='mb-6'>
        <h4 className='text-sm font-medium text-gray-700 dark:text-gray-300 mb-4'>
          选择可用的采集源：
        </h4>
        <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'>
          {sourceConfig?.map((source) => (
            <label
              key={source.key}
              className='flex items-center space-x-3 p-3 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer transition-colors'
            >
              <input
                type='checkbox'
                checked={selectedApis.includes(source.key)}
                onChange={(e) => onToggleApi(source.key, e.target.checked)}
                className='rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700'
              />
              <div className='flex-1 min-w-0'>
                <div className='text-sm font-medium text-gray-900 dark:text-gray-100 truncate'>
                  {source.name}
                </div>
                {source.api && (
                  <div className='text-xs text-gray-500 dark:text-gray-400 truncate'>
                    {extractDomain(source.api)}
                  </div>
                )}
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* 快速操作按钮 */}
      <div className='flex flex-wrap items-center justify-between mb-6 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg'>
        <div className='flex space-x-2'>
          <button onClick={() => onSetApis([])} className={buttonStyles.quickAction}>
            全不选（无限制）
          </button>
          <button
            onClick={() => {
              const allApis =
                sourceConfig?.filter((source) => !source.disabled).map((s) => s.key) ||
                [];
              onSetApis(allApis);
            }}
            className={buttonStyles.quickAction}
          >
            全选
          </button>
        </div>
        <div className='text-sm text-gray-600 dark:text-gray-400'>
          已选择：
          <span className='font-medium text-blue-600 dark:text-blue-400'>
            {selectedApis.length > 0 ? `${selectedApis.length} 个源` : '无限制'}
          </span>
        </div>
      </div>

      {/* 操作按钮 */}
      <div className='flex justify-end space-x-3'>
        <button
          onClick={onClose}
          className={`px-6 py-2.5 text-sm font-medium ${buttonStyles.secondary}`}
        >
          取消
        </button>
        <button
          onClick={onSave}
          disabled={loading}
          className={`px-6 py-2.5 text-sm font-medium ${
            loading ? buttonStyles.disabled : buttonStyles.primary
          }`}
        >
          {loading ? '配置中...' : '确认配置'}
        </button>
      </div>
    </ModalShell>
  );
}
