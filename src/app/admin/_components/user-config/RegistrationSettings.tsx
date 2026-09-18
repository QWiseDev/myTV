'use client';

/**
 * 站长专属设置：允许注册开关、非活跃用户自动清理
 */

import { AdminConfig } from '@/lib/admin.types';

import { buttonStyles, showError } from '../adminShared';

interface RegistrationSettingsProps {
  config: AdminConfig;
  refreshConfig: () => Promise<void>;
  withLoading: (key: string, operation: () => Promise<unknown>) => Promise<unknown>;
  showAlert: (options: {
    type: 'success' | 'error' | 'warning';
    title: string;
    message?: string;
    timer?: number;
    showConfirm?: boolean;
  }) => void;
}

export function RegistrationSettings({
  config,
  refreshConfig,
  withLoading,
  showAlert,
}: RegistrationSettingsProps) {
  const saveUserConfig = async (
    loadingKey: string,
    patch: Partial<AdminConfig['UserConfig']>,
    successMessage: string,
    onError?: (err: unknown) => void
  ) => {
    await withLoading(loadingKey, async () => {
      try {
        const response = await fetch('/api/admin/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...config,
            UserConfig: {
              ...config.UserConfig,
              ...patch,
            },
          }),
        });

        if (response.ok) {
          await refreshConfig();
          showAlert({
            type: 'success',
            title: '设置已更新',
            message: successMessage,
            timer: 2000,
          });
        } else {
          throw new Error('更新配置失败');
        }
      } catch (err) {
        if (onError) {
          onError(err);
        } else {
          showError(err instanceof Error ? err.message : '操作失败', showAlert);
        }
      }
    });
  };

  return (
    <div>
      <h4 className='text-sm font-medium text-gray-700 dark:text-gray-300 mb-3'>
        注册设置
      </h4>
      <div className='p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800'>
        <div className='flex items-center justify-between'>
          <div>
            <div className='font-medium text-gray-900 dark:text-gray-100'>
              允许用户注册
            </div>
            <div className='text-sm text-gray-600 dark:text-gray-400'>
              控制是否允许新用户通过注册页面自行注册账户
            </div>
          </div>
          <div className='flex items-center'>
            <button
              type='button'
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 ${
                config.UserConfig.AllowRegister
                  ? buttonStyles.toggleOn
                  : buttonStyles.toggleOff
              }`}
              role='switch'
              aria-checked={config.UserConfig.AllowRegister}
              onClick={() =>
                saveUserConfig(
                  'toggleAllowRegister',
                  { AllowRegister: !config.UserConfig.AllowRegister },
                  config.UserConfig.AllowRegister
                    ? '已禁止用户注册'
                    : '已允许用户注册'
                )
              }
            >
              <span
                aria-hidden='true'
                className={`pointer-events-none inline-block h-5 w-5 rounded-full ${
                  buttonStyles.toggleThumb
                } shadow transform ring-0 transition duration-200 ease-in-out ${
                  config.UserConfig.AllowRegister
                    ? buttonStyles.toggleThumbOn
                    : buttonStyles.toggleThumbOff
                }`}
              />
            </button>
            <span className='ml-3 text-sm font-medium text-gray-900 dark:text-gray-100'>
              {config.UserConfig.AllowRegister ? '开启' : '关闭'}
            </span>
          </div>
        </div>

        {/* 自动清理非活跃用户设置 */}
        <div className='p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700'>
          <div className='flex items-center justify-between mb-4'>
            <div>
              <div className='font-medium text-gray-900 dark:text-gray-100'>
                自动清理非活跃用户
              </div>
              <div className='text-sm text-gray-600 dark:text-gray-400'>
                自动删除指定天数内未登录的非活跃用户账号
              </div>
            </div>
            <div className='flex items-center'>
              <button
                type='button'
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 ${
                  config.UserConfig.AutoCleanupInactiveUsers
                    ? buttonStyles.toggleOn
                    : buttonStyles.toggleOff
                }`}
                role='switch'
                aria-checked={config.UserConfig.AutoCleanupInactiveUsers}
                onClick={() =>
                  saveUserConfig(
                    'toggleAutoCleanup',
                    {
                      AutoCleanupInactiveUsers:
                        !config.UserConfig.AutoCleanupInactiveUsers,
                    },
                    config.UserConfig.AutoCleanupInactiveUsers
                      ? '已禁用自动清理'
                      : '已启用自动清理',
                    (err) =>
                      showAlert({
                        type: 'error',
                        title: '更新失败',
                        message: err instanceof Error ? err.message : '未知错误',
                      })
                  )
                }
              >
                <span
                  aria-hidden='true'
                  className={`pointer-events-none inline-block h-5 w-5 rounded-full ${
                    buttonStyles.toggleThumb
                  } shadow transform ring-0 transition duration-200 ease-in-out ${
                    config.UserConfig.AutoCleanupInactiveUsers
                      ? buttonStyles.toggleThumbOn
                      : buttonStyles.toggleThumbOff
                  }`}
                />
              </button>
              <span className='ml-3 text-sm font-medium text-gray-900 dark:text-gray-100'>
                {config.UserConfig.AutoCleanupInactiveUsers ? '开启' : '关闭'}
              </span>
            </div>
          </div>

          {/* 天数设置 */}
          <div className='flex items-center space-x-3'>
            <label className='text-sm font-medium text-gray-700 dark:text-gray-300'>
              保留天数：
            </label>
            <input
              type='number'
              min='1'
              max='365'
              defaultValue={config.UserConfig.InactiveUserDays || 7}
              onBlur={(e) => {
                const days = parseInt(e.target.value) || 7;
                if (days === (config.UserConfig.InactiveUserDays || 7)) {
                  return; // 没有变化，不需要保存
                }
                saveUserConfig(
                  'updateInactiveDays',
                  { InactiveUserDays: days },
                  `保留天数已设置为${days}天`,
                  (err) =>
                    showAlert({
                      type: 'error',
                      title: '更新失败',
                      message: err instanceof Error ? err.message : '未知错误',
                    })
                );
              }}
              className='w-20 px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
            />
            <span className='text-sm text-gray-600 dark:text-gray-400'>
              天（注册后超过此天数且从未登入的用户将被自动删除）
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
