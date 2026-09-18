'use client';

/**
 * 用户组添加/编辑弹窗（两种模式共享同一表单结构）
 */

import { AdminConfig } from '@/lib/admin.types';

import { ModalShell } from './ModalShell';
import { buttonStyles } from '../adminShared';

type SourceConfig = NonNullable<AdminConfig['SourceConfig']>;

interface UserGroupModalProps {
  title: string;
  /** 仅添加模式提供用户组名称输入 */
  name?: string;
  onNameChange?: (name: string) => void;
  enabledApis: string[];
  onToggleApi: (api: string, checked: boolean) => void;
  onSetEnabledApis: (apis: string[]) => void;
  onClose: () => void;
  onSubmit: () => void;
  submitLabel: string;
  submittingLabel: string;
  submitDisabled: boolean;
  loading: boolean;
  sourceConfig?: SourceConfig;
  /** 采集源勾选框主色：添加模式为 blue，编辑模式为 purple */
  checkboxAccent?: 'blue' | 'purple';
}

// 特殊功能权限（与普通采集源分开渲染，各自保留原有配色）
const SPECIAL_FEATURES = [
  {
    key: 'ai-recommend',
    icon: '🤖',
    name: 'AI推荐功能',
    description: '智能推荐影视内容 (消耗OpenAI API费用)',
    labelClasses:
      'border-orange-200 dark:border-orange-700 rounded-lg bg-orange-50 dark:bg-orange-900/10 hover:bg-orange-100 dark:hover:bg-orange-900/20',
    checkboxClasses:
      'rounded border-orange-300 text-orange-600 focus:ring-orange-500 dark:border-orange-600 dark:bg-orange-700',
    titleClasses: 'text-orange-900 dark:text-orange-100',
    descClasses: 'text-orange-700 dark:text-orange-300',
  },
  {
    key: 'youtube-search',
    icon: '📺',
    name: 'YouTube搜索功能',
    description: '搜索和推荐YouTube视频 (消耗YouTube API配额)',
    labelClasses:
      'border-red-200 dark:border-red-700 rounded-lg bg-red-50 dark:bg-red-900/10 hover:bg-red-100 dark:hover:bg-red-900/20',
    checkboxClasses:
      'rounded border-red-300 text-red-600 focus:ring-red-500 dark:border-red-600 dark:bg-red-700',
    titleClasses: 'text-red-900 dark:text-red-100',
    descClasses: 'text-red-700 dark:text-red-300',
  },
] as const;

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

export function UserGroupModal({
  title,
  name,
  onNameChange,
  enabledApis,
  onToggleApi,
  onSetEnabledApis,
  onClose,
  onSubmit,
  submitLabel,
  submittingLabel,
  submitDisabled,
  loading,
  sourceConfig,
  checkboxAccent = 'blue',
}: UserGroupModalProps) {
  const handleSelectAll = () => {
    const allApis =
      sourceConfig?.filter((source) => !source.disabled).map((s) => s.key) || [];
    onSetEnabledApis([
      ...allApis,
      ...SPECIAL_FEATURES.map((feature) => feature.key),
    ]);
  };

  return (
    <ModalShell title={title} onClose={onClose}>
      <div className='space-y-6'>
        {/* 用户组名称（仅添加模式） */}
        {name !== undefined && onNameChange && (
          <div>
            <label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2'>
              用户组名称
            </label>
            <input
              type='text'
              placeholder='请输入用户组名称'
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent'
            />
          </div>
        )}

        {/* 可用视频源 */}
        <div>
          <label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-4'>
            可用视频源
          </label>
          <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3'>
            {sourceConfig?.map((source) => (
              <label
                key={source.key}
                className='flex items-center space-x-3 p-3 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer transition-colors'
              >
                <input
                  type='checkbox'
                  checked={enabledApis.includes(source.key)}
                  onChange={(e) => onToggleApi(source.key, e.target.checked)}
                  className={`rounded border-gray-300 ${
                    checkboxAccent === 'purple'
                      ? 'text-purple-600 focus:ring-purple-500'
                      : 'text-blue-600 focus:ring-blue-500'
                  } dark:border-gray-600 dark:bg-gray-700`}
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

          {/* 特殊功能权限 */}
          <div className='mt-6 pt-6 border-t border-gray-200 dark:border-gray-700'>
            <label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3'>
              特殊功能权限
            </label>
            <div className='space-y-3'>
              {SPECIAL_FEATURES.map((feature) => (
                <label
                  key={feature.key}
                  className={`flex items-center space-x-3 p-3 ${feature.labelClasses} cursor-pointer transition-colors`}
                >
                  <input
                    type='checkbox'
                    checked={enabledApis.includes(feature.key)}
                    onChange={(e) => onToggleApi(feature.key, e.target.checked)}
                    className={feature.checkboxClasses}
                  />
                  <div className='flex-1'>
                    <div className={`text-sm font-medium ${feature.titleClasses}`}>
                      {feature.icon} {feature.name}
                    </div>
                    <div className={`text-xs ${feature.descClasses}`}>
                      {feature.description}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* 快速操作按钮 */}
          <div className='mt-4 flex space-x-2'>
            <button
              onClick={() => onSetEnabledApis([])}
              className={buttonStyles.quickAction}
            >
              全不选（无限制）
            </button>
            <button onClick={handleSelectAll} className={buttonStyles.quickAction}>
              全选
            </button>
          </div>
        </div>

        {/* 操作按钮 */}
        <div className='flex justify-end space-x-3 pt-4 border-t border-gray-200 dark:border-gray-700'>
          <button
            onClick={onClose}
            className={`px-6 py-2.5 text-sm font-medium ${buttonStyles.secondary}`}
          >
            取消
          </button>
          <button
            onClick={onSubmit}
            disabled={submitDisabled}
            className={`px-6 py-2.5 text-sm font-medium ${
              submitDisabled ? buttonStyles.disabled : buttonStyles.primary
            }`}
          >
            {loading ? submittingLabel : submitLabel}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
