'use client';

/**
 * 为单个用户配置用户组弹窗
 */

import { ModalShell } from './ModalShell';
import { buttonStyles } from '../adminShared';

interface UserGroup {
  name: string;
  enabledApis?: string[];
}

interface ConfigureUserGroupModalProps {
  username: string;
  userGroups: UserGroup[];
  selectedUserGroups: string[];
  onSelectGroup: (groupName: string) => void;
  onClose: () => void;
  onSave: () => void;
  loading: boolean;
}

export function ConfigureUserGroupModal({
  username,
  userGroups,
  selectedUserGroups,
  onSelectGroup,
  onClose,
  onSave,
  loading,
}: ConfigureUserGroupModalProps) {
  return (
    <ModalShell title={`配置用户组 - ${username}`} onClose={onClose}>
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
            提示：选择"无用户组"为无限制，选择特定用户组将限制用户只能访问该用户组允许的采集源
          </p>
        </div>
      </div>

      {/* 用户组选择 - 下拉选择器 */}
      <div className='mb-6'>
        <label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2'>
          选择用户组：
        </label>
        <select
          value={selectedUserGroups.length > 0 ? selectedUserGroups[0] : ''}
          onChange={(e) => {
            const value = e.target.value;
            onSelectGroup(value ? value : '');
          }}
          className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors'
        >
          <option value=''>无用户组（无限制）</option>
          {userGroups.map((group) => (
            <option key={group.name} value={group.name}>
              {group.name}{' '}
              {group.enabledApis && group.enabledApis.length > 0
                ? `(${group.enabledApis.length} 个源)`
                : ''}
            </option>
          ))}
        </select>
        <p className='mt-2 text-xs text-gray-500 dark:text-gray-400'>
          选择"无用户组"为无限制，选择特定用户组将限制用户只能访问该用户组允许的采集源
        </p>
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
