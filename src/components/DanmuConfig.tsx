/* eslint-disable @typescript-eslint/no-explicit-any */

'use client';

import { AlertCircle, CheckCircle, MessageSquare } from 'lucide-react';
import { useEffect, useState } from 'react';

import { AdminConfig } from '@/lib/admin.types';

interface DanmuConfigProps {
  config: AdminConfig | null;
  refreshConfig: () => Promise<void>;
}

const EXAMPLE_DANMU_API_BASE = 'https://your-danmu-api.example.com';

const DanmuConfig = ({ config, refreshConfig }: DanmuConfigProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [apiBaseUrl, setApiBaseUrl] = useState('');

  useEffect(() => {
    setApiBaseUrl(config?.DanmuConfig?.apiBaseUrl || '');
  }, [config]);

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  };

  const handleSave = async () => {
    const trimmedUrl = apiBaseUrl.trim();

    if (trimmedUrl) {
      try {
        new URL(trimmedUrl);
      } catch {
        showMessage('error', '弹幕 API 地址格式不正确');
        return;
      }
    }

    setIsLoading(true);
    try {
      const response = await fetch('/api/admin/danmu', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiBaseUrl: trimmedUrl }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '保存失败');
      }

      showMessage(
        'success',
        trimmedUrl ? '弹幕配置保存成功' : '已清空弹幕 API 地址'
      );
      await refreshConfig();
    } catch (error) {
      showMessage(
        'error',
        error instanceof Error ? error.message : '保存失败'
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className='bg-white dark:bg-gray-800 rounded-lg shadow-md p-6'>
      <div className='flex items-center gap-3 mb-6'>
        <MessageSquare className='h-6 w-6 text-blue-600' />
        <div>
          <h2 className='text-xl font-bold text-gray-900 dark:text-gray-100'>
            弹幕配置
          </h2>
          <p className='text-sm text-gray-600 dark:text-gray-400'>
            配置 huangxd-/danmu_api 兼容服务地址，用于获取第三方平台弹幕。
          </p>
        </div>
      </div>

      {message && (
        <div
          className={`mb-4 p-4 rounded-lg flex items-center gap-2 ${
            message.type === 'success'
              ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
              : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'
          }`}
        >
          {message.type === 'success' ? (
            <CheckCircle className='h-5 w-5' />
          ) : (
            <AlertCircle className='h-5 w-5' />
          )}
          {message.text}
        </div>
      )}

      <div className='space-y-4'>
        <div>
          <label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2'>
            弹幕 API 地址
          </label>
          <input
            type='url'
            value={apiBaseUrl}
            onChange={(e) => setApiBaseUrl(e.target.value)}
            placeholder={EXAMPLE_DANMU_API_BASE}
            className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-gray-100'
          />
          <p className='mt-1 text-sm text-gray-500 dark:text-gray-400'>
            填写你自建的 danmu_api 服务根地址。未配置时不会请求自建弹幕 API。
          </p>
        </div>

        <div className='flex justify-end'>
          <button
            onClick={handleSave}
            disabled={isLoading}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              isLoading
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            {isLoading ? '保存中...' : '保存配置'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default DanmuConfig;
