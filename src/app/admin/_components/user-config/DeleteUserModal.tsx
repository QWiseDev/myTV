'use client';

/**
 * 删除用户确认弹窗
 */

import { ModalShell } from './ModalShell';
import { buttonStyles } from '../adminShared';

interface DeleteUserModalProps {
  username: string;
  onClose: () => void;
  onConfirm: () => void;
}

export function DeleteUserModal({
  username,
  onClose,
  onConfirm,
}: DeleteUserModalProps) {
  return (
    <ModalShell title='确认删除用户' onClose={onClose} maxWidth='2xl' scrollable={false}>
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
            删除用户 <strong>{username}</strong>{' '}
            将同时删除其搜索历史、播放记录和收藏夹，此操作不可恢复！
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
            onClick={onConfirm}
            className={`px-6 py-2.5 text-sm font-medium ${buttonStyles.danger}`}
          >
            确认删除
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
