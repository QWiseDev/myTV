import { X } from 'lucide-react';

import {
  CHANGE_PASSWORD_PANEL_CONTENT_STYLE,
  stopPanelTouchPropagation,
  UserMenuPanelBackdrop,
} from './UserMenuPanelPrimitives';

interface UserMenuChangePasswordPanelProps {
  confirmPassword: string;
  error: string;
  isLoading: boolean;
  newPassword: string;
  onClose: () => void;
  onConfirmPasswordChange: (value: string) => void;
  onNewPasswordChange: (value: string) => void;
  onSubmit: () => void;
}

export function UserMenuChangePasswordPanel({
  confirmPassword,
  error,
  isLoading,
  newPassword,
  onClose,
  onConfirmPasswordChange,
  onNewPasswordChange,
  onSubmit,
}: UserMenuChangePasswordPanelProps) {
  return (
    <>
      <UserMenuPanelBackdrop onClick={onClose} />

      <div className='fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-white dark:bg-gray-900 rounded-xl shadow-xl z-[1001] overflow-hidden'>
        <div
          className='h-full p-6'
          data-panel-content
          onTouchMove={stopPanelTouchPropagation}
          style={CHANGE_PASSWORD_PANEL_CONTENT_STYLE}
        >
          <div className='flex items-center justify-between mb-6'>
            <h3 className='text-xl font-bold text-gray-800 dark:text-gray-200'>
              修改密码
            </h3>
            <button
              onClick={onClose}
              className='w-8 h-8 p-1 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors'
              aria-label='Close'
            >
              <X className='w-full h-full' />
            </button>
          </div>

          <div className='space-y-4'>
            <div>
              <label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2'>
                新密码
              </label>
              <input
                type='password'
                className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-colors bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400'
                placeholder='请输入新密码'
                value={newPassword}
                onChange={(event) => onNewPasswordChange(event.target.value)}
                disabled={isLoading}
              />
            </div>

            <div>
              <label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2'>
                确认密码
              </label>
              <input
                type='password'
                className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-colors bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400'
                placeholder='请再次输入新密码'
                value={confirmPassword}
                onChange={(event) =>
                  onConfirmPasswordChange(event.target.value)
                }
                disabled={isLoading}
              />
            </div>

            {error && (
              <div className='text-red-500 text-sm bg-red-50 dark:bg-red-900/20 p-3 rounded-md border border-red-200 dark:border-red-800'>
                {error}
              </div>
            )}
          </div>

          <div className='flex gap-3 mt-6 pt-4 border-t border-gray-200 dark:border-gray-700'>
            <button
              onClick={onClose}
              className='flex-1 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-md transition-colors'
              disabled={isLoading}
            >
              取消
            </button>
            <button
              onClick={onSubmit}
              className='flex-1 px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 dark:bg-green-700 dark:hover:bg-green-600 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
              disabled={isLoading || !newPassword || !confirmPassword}
            >
              {isLoading ? '修改中...' : '确认修改'}
            </button>
          </div>

          <div className='mt-4 pt-4 border-t border-gray-200 dark:border-gray-700'>
            <p className='text-xs text-gray-500 dark:text-gray-400 text-center'>
              修改密码后需要重新登录
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
