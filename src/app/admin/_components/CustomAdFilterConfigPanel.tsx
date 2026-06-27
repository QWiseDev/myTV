'use client';

import { useEffect, useState } from 'react';

import {
  DEFAULT_CUSTOM_AD_FILTER_CODE,
  validateCustomAdFilterCode,
} from '@/lib/ad-filter';
import { AdminConfig } from '@/lib/admin.types';

import {
  AlertModal,
  buttonStyles,
  showError,
  showSuccess,
  useAlertModal,
  useLoadingState,
} from './adminShared';

const CustomAdFilterConfigPanel = ({
  config,
  refreshConfig,
}: {
  config: AdminConfig | null;
  refreshConfig: () => Promise<void>;
}) => {
  const { alertModal, showAlert, hideAlert } = useAlertModal();
  const { isLoading, withLoading } = useLoadingState();
  const [adFilterCode, setAdFilterCode] = useState(
    DEFAULT_CUSTOM_AD_FILTER_CODE,
  );

  useEffect(() => {
    setAdFilterCode(
      config?.SiteConfig?.CustomAdFilterCode || DEFAULT_CUSTOM_AD_FILTER_CODE,
    );
  }, [config]);

  const handleSave = async () => {
    await withLoading('saveAdFilterCode', async () => {
      try {
        const code = adFilterCode.trim();
        if (code) {
          validateCustomAdFilterCode(code);
        }

        if (!config) {
          showError('配置未加载', showAlert);
          return;
        }

        const response = await fetch('/api/admin/site', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...config.SiteConfig,
            CustomAdFilterCode: code,
            CustomAdFilterVersion: code ? Date.now() : 0,
          }),
        });

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error || `保存失败: ${response.status}`);
        }

        await refreshConfig();
        showSuccess('去广告代码保存成功，刷新后生效', showAlert);
      } catch (error) {
        showError(
          error instanceof Error ? error.message : '保存失败',
          showAlert,
        );
        throw error;
      }
    });
  };

  if (!config) {
    return (
      <div className='text-center text-gray-500 dark:text-gray-400'>
        加载中...
      </div>
    );
  }

  return (
    <div className='space-y-4'>
      <div className='rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-700 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-300'>
        <p>此配置用于自定义 M3U8 播放列表的去广告逻辑。</p>
        <p className='mt-1'>
          函数签名必须为{' '}
          <code className='rounded bg-blue-100 px-1 dark:bg-blue-900/40'>
            filterAdsFromM3U8(type, m3u8Content)
          </code>
          ，返回值必须是处理后的 M3U8 字符串。
        </p>
      </div>

      <div className='flex items-center justify-between gap-3'>
        <label className='text-sm font-medium text-gray-700 dark:text-gray-300'>
          自定义去广告代码
        </label>
        <button
          type='button'
          onClick={() => setAdFilterCode(DEFAULT_CUSTOM_AD_FILTER_CODE)}
          className={buttonStyles.secondarySmall}
        >
          重置为默认
        </button>
      </div>

      <textarea
        value={adFilterCode}
        onChange={(event) => setAdFilterCode(event.target.value)}
        rows={24}
        spellCheck={false}
        data-gramm={false}
        className='w-full resize-y rounded-lg border border-gray-300 bg-white px-4 py-3 font-mono text-sm leading-relaxed text-gray-900 transition-colors focus:border-transparent focus:ring-2 focus:ring-green-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100'
      />

      <div className='flex items-center justify-between gap-3'>
        <p className='text-xs text-gray-500 dark:text-gray-400'>
          清空代码并保存会关闭自定义规则，播放端会回退内置规则。
        </p>
        <button
          type='button'
          onClick={handleSave}
          disabled={isLoading('saveAdFilterCode')}
          className={`px-4 py-2 ${
            isLoading('saveAdFilterCode')
              ? buttonStyles.disabled
              : buttonStyles.success
          } rounded-lg transition-colors`}
        >
          {isLoading('saveAdFilterCode') ? '保存中...' : '保存'}
        </button>
      </div>

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

export default CustomAdFilterConfigPanel;
