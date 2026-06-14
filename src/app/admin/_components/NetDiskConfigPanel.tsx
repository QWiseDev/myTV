'use client';

import { CheckCircle } from 'lucide-react';
import { useEffect, useState } from 'react';

import { AdminConfig } from '@/lib/admin.types';

import {
  AlertModal,
  buttonStyles,
  showError,
  showSuccess,
  useAlertModal,
  useLoadingState,
} from './adminShared';

const NetDiskConfig = ({
  config,
  refreshConfig,
}: {
  config: AdminConfig | null;
  refreshConfig: () => Promise<void>;
}) => {
  const { alertModal, showAlert, hideAlert } = useAlertModal();
  const { isLoading, withLoading } = useLoadingState();

  const [netDiskSettings, setNetDiskSettings] = useState({
    enabled: true,
    pansouUrl: 'https://so.252035.xyz',
    timeout: 30,
    enabledCloudTypes: [
      'baidu',
      'aliyun',
      'quark',
      'tianyi',
      'uc',
      'mobile',
      '115',
      'pikpak',
      'xunlei',
      '123',
      'magnet',
      'ed2k',
    ],
  });

  // 网盘类型选项
  const CLOUD_TYPE_OPTIONS = [
    { key: 'baidu', name: '百度网盘', icon: '📁' },
    { key: 'aliyun', name: '阿里云盘', icon: '☁️' },
    { key: 'quark', name: '夸克网盘', icon: '⚡' },
    { key: 'tianyi', name: '天翼云盘', icon: '📱' },
    { key: 'uc', name: 'UC网盘', icon: '🌐' },
    { key: 'mobile', name: '移动云盘', icon: '📲' },
    { key: '115', name: '115网盘', icon: '💾' },
    { key: 'pikpak', name: 'PikPak', icon: '📦' },
    { key: 'xunlei', name: '迅雷网盘', icon: '⚡' },
    { key: '123', name: '123网盘', icon: '🔢' },
    { key: 'magnet', name: '磁力链接', icon: '🧲' },
    { key: 'ed2k', name: '电驴链接', icon: '🐴' },
  ];

  // 从config加载设置
  useEffect(() => {
    if (config?.NetDiskConfig) {
      setNetDiskSettings({
        enabled: config.NetDiskConfig.enabled ?? true,
        pansouUrl: config.NetDiskConfig.pansouUrl || 'https://so.252035.xyz',
        timeout: config.NetDiskConfig.timeout || 30,
        enabledCloudTypes: config.NetDiskConfig.enabledCloudTypes || [
          'baidu',
          'aliyun',
          'quark',
          'tianyi',
          'uc',
        ],
      });
    }
  }, [config]);

  // 保存网盘搜索配置
  const handleSave = async () => {
    await withLoading('saveNetDiskConfig', async () => {
      try {
        const response = await fetch('/api/admin/netdisk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(netDiskSettings),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || '保存失败');
        }

        showSuccess('网盘搜索配置保存成功', showAlert);
        await refreshConfig();
      } catch (err) {
        showError(err instanceof Error ? err.message : '保存失败', showAlert);
      }
    });
  };

  // 处理网盘类型选择
  const handleCloudTypeChange = (type: string, enabled: boolean) => {
    setNetDiskSettings((prev) => ({
      ...prev,
      enabledCloudTypes: enabled
        ? [...prev.enabledCloudTypes, type]
        : prev.enabledCloudTypes.filter((t) => t !== type),
    }));
  };

  // 全选/取消全选网盘类型
  const handleSelectAll = (selectAll: boolean) => {
    setNetDiskSettings((prev) => ({
      ...prev,
      enabledCloudTypes: selectAll
        ? CLOUD_TYPE_OPTIONS.map((option) => option.key)
        : [],
    }));
  };

  return (
    <div className='space-y-6'>
      {/* 基础设置 */}
      <div className='bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700 shadow-sm'>
        <div className='mb-6'>
          <h3 className='text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2'>
            基础设置
          </h3>
          <div className='flex items-center space-x-2 text-sm text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-3 py-2 rounded-lg'>
            <svg className='h-4 w-4' fill='currentColor' viewBox='0 0 20 20'>
              <path
                fillRule='evenodd'
                d='M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z'
                clipRule='evenodd'
              />
            </svg>
            <span>
              📡 集成开源项目 <strong>PanSou</strong> 提供网盘资源搜索功能
            </span>
            <span className='text-blue-700 dark:text-blue-300 font-medium'>
              更多信息请联系管理员
            </span>
          </div>
        </div>

        {/* 启用网盘搜索 */}
        <div className='space-y-4'>
          <div className='flex items-center space-x-3'>
            <label className='flex items-center cursor-pointer'>
              <input
                type='checkbox'
                checked={netDiskSettings.enabled}
                onChange={(e) =>
                  setNetDiskSettings((prev) => ({
                    ...prev,
                    enabled: e.target.checked,
                  }))
                }
                className='w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700'
              />
              <span className='ml-2 text-sm font-medium text-gray-900 dark:text-gray-100'>
                启用网盘搜索功能
              </span>
            </label>
          </div>

          {/* PanSou服务地址 */}
          <div className='space-y-2'>
            <label className='block text-sm font-medium text-gray-700 dark:text-gray-300'>
              PanSou服务地址
            </label>
            <input
              type='url'
              value={netDiskSettings.pansouUrl}
              onChange={(e) =>
                setNetDiskSettings((prev) => ({
                  ...prev,
                  pansouUrl: e.target.value,
                }))
              }
              placeholder='https://so.252035.xyz'
              className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-blue-500 focus:border-blue-500'
            />
            <div className='flex items-start space-x-2 text-sm text-gray-500 dark:text-gray-400'>
              <div className='flex-1'>
                默认使用公益服务，您也可以填入自己搭建的PanSou服务地址
              </div>
              <span className='inline-flex items-center px-2 py-1 text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 rounded-md whitespace-nowrap'>
                搭建教程请联系管理员获取
              </span>
            </div>
          </div>

          {/* 超时设置 */}
          <div className='space-y-2'>
            <label className='block text-sm font-medium text-gray-700 dark:text-gray-300'>
              请求超时时间（秒）
            </label>
            <input
              type='number'
              min='10'
              max='120'
              value={netDiskSettings.timeout}
              onChange={(e) =>
                setNetDiskSettings((prev) => ({
                  ...prev,
                  timeout: parseInt(e.target.value) || 30,
                }))
              }
              className='w-32 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-blue-500 focus:border-blue-500'
            />
          </div>
        </div>
      </div>

      {/* 支持的网盘类型 */}
      <div className='bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700 shadow-sm'>
        <div className='flex items-center justify-between mb-4'>
          <h3 className='text-lg font-semibold text-gray-900 dark:text-gray-100'>
            支持的网盘类型
          </h3>
          <div className='space-x-2'>
            <button
              onClick={() => handleSelectAll(true)}
              className={buttonStyles.quickAction}
            >
              全选
            </button>
            <button
              onClick={() => handleSelectAll(false)}
              className={buttonStyles.quickAction}
            >
              清空
            </button>
          </div>
        </div>

        <div className='grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4'>
          {CLOUD_TYPE_OPTIONS.map((option) => (
            <label
              key={option.key}
              className='flex items-center space-x-3 p-3 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer transition-colors'
            >
              <input
                type='checkbox'
                checked={netDiskSettings.enabledCloudTypes.includes(option.key)}
                onChange={(e) =>
                  handleCloudTypeChange(option.key, e.target.checked)
                }
                className='w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700'
              />
              <span className='text-lg'>{option.icon}</span>
              <span className='text-sm font-medium text-gray-900 dark:text-gray-100'>
                {option.name}
              </span>
            </label>
          ))}
        </div>

        <div className='mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg'>
          <div className='flex items-start space-x-2'>
            <CheckCircle
              size={16}
              className='text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0'
            />
            <div className='text-sm text-blue-700 dark:text-blue-300'>
              <p className='font-medium mb-1'>配置说明</p>
              <p>
                选择要在搜索结果中显示的网盘类型。取消选择的类型不会出现在搜索结果中。
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 保存按钮 */}
      <div className='flex justify-end'>
        <button
          onClick={handleSave}
          disabled={isLoading('saveNetDiskConfig')}
          className={`px-4 py-2 ${
            isLoading('saveNetDiskConfig')
              ? buttonStyles.disabled
              : buttonStyles.success
          } rounded-lg transition-colors`}
        >
          {isLoading('saveNetDiskConfig') ? '保存中…' : '保存配置'}
        </button>
      </div>

      {/* 通用弹窗组件 */}
      <AlertModal
        isOpen={alertModal.isOpen}
        onClose={hideAlert}
        type={alertModal.type}
        title={alertModal.title}
        message={alertModal.message}
        timer={alertModal.timer}
        showConfirm={alertModal.showConfirm}
      />
    </div>
  );
};

export default NetDiskConfig;
