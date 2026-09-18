'use client';

/**
 * 删除用户组确认弹窗（展示受影响用户）
 */

import { ModalShell } from './ModalShell';
import { buttonStyles } from '../adminShared';

interface AffectedUser {
  username: string;
  role: 'user' | 'admin' | 'owner';
}

interface DeleteUserGroupModalProps {
  groupName: string;
  affectedUsers: AffectedUser[];
  onClose: () => void;
  onConfirm: () => void;
  loading: boolean;
}

export function DeleteUserGroupModal({
  groupName,
  affectedUsers,
  onClose,
  onConfirm,
  loading,
}: DeleteUserGroupModalProps) {
  return (
    <ModalShell title='确认删除用户组' onClose={onClose} maxWidth='2xl' scrollable={false}>
      <div className='mb-6'>
        <div className='bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-4'>
          <div className='flex items-center space-x-2 mb-2'>
            <svg
              className='w-5 h-5 text-red-600 dark:text-red-400'
              fill='none'
              stroke='currentColor'
              viewBox='0 0 24 24'
            >
              <path
                strokeLinecap='round'
                strokeLinejoin='round'
                strokeWidth={2}
                d='M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z'
              />
            </svg>
            <span className='text-sm font-medium text-red-800 dark:text-red-300'>
              危险操作警告
            </span>
          </div>
          <p className='text-sm text-red-700 dark:text-red-400'>
            删除用户组 <strong>{groupName}</strong>{' '}
            将影响所有使用该组的用户，此操作不可恢复！
          </p>
        </div>

        {affectedUsers.length > 0 ? (
          <div className='bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4'>
            <div className='flex items-center space-x-2 mb-2'>
              <svg
                className='w-5 h-5 text-yellow-600 dark:text-yellow-400'
                fill='none'
                stroke='currentColor'
                viewBox='0 0 24 24'
              >
                <path
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  strokeWidth={2}
                  d='M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z'
                />
              </svg>
              <span className='text-sm font-medium text-yellow-800 dark:text-yellow-300'>
                ⚠️ 将影响 {affectedUsers.length} 个用户：
              </span>
            </div>
            <div className='space-y-1'>
              {affectedUsers.map((user, index) => (
                <div
                  key={index}
                  className='text-sm text-yellow-700 dark:text-yellow-300'
                >
                  • {user.username} ({user.role})
                </div>
              ))}
            </div>
            <p className='text-xs text-yellow-600 dark:text-yellow-400 mt-2'>
              这些用户的用户组将被自动移除
            </p>
          </div>
        ) : (
          <div className='bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4'>
            <div className='flex items-center space-x-2'>
              <svg
                className='w-5 h-5 text-green-600 dark:text-green-400'
                fill='none'
                stroke='currentColor'
                viewBox='0 0 24 24'
              >
                <path
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  strokeWidth={2}
                  d='M5 13l4 4L19 7'
                />
              </svg>
              <span className='text-sm font-medium text-green-800 dark:text-green-300'>
                ✅ 当前没有用户使用此用户组
              </span>
            </div>
          </div>
        )}
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
          onClick={onConfirm}
          disabled={loading}
          className={`px-6 py-2.5 text-sm font-medium ${
            loading ? buttonStyles.disabled : buttonStyles.danger
          }`}
        >
          {loading ? '删除中...' : '确认删除'}
        </button>
      </div>
    </ModalShell>
  );
}
