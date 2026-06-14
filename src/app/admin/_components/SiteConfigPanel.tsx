'use client';

import { Check,ChevronDown } from 'lucide-react';
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

interface SiteConfig {
  SiteName: string;
  Announcement: string;
  SearchDownstreamMaxPage: number;
  SiteInterfaceCacheTime: number;
  DoubanProxyType: string;
  DoubanProxy: string;
  DoubanImageProxyType: string;
  DoubanImageProxy: string;
  DisableYellowFilter: boolean;
  FluidSearch: boolean;
  TMDBApiKey?: string;
  TMDBLanguage?: string;
  EnableTMDBActorSearch?: boolean;
}

const SiteConfigComponent = ({
  config,
  refreshConfig,
}: {
  config: AdminConfig | null;
  refreshConfig: () => Promise<void>;
}) => {
  const { alertModal, showAlert, hideAlert } = useAlertModal();
  const { isLoading, withLoading } = useLoadingState();
  const [siteSettings, setSiteSettings] = useState<SiteConfig>({
    SiteName: '',
    Announcement: '',
    SearchDownstreamMaxPage: 1,
    SiteInterfaceCacheTime: 7200,
    DoubanProxyType: 'direct',
    DoubanProxy: '',
    DoubanImageProxyType: 'direct',
    DoubanImageProxy: '',
    DisableYellowFilter: false,
    FluidSearch: true,
    // TMDB配置默认值
    TMDBApiKey: '',
    TMDBLanguage: 'zh-CN',
    EnableTMDBActorSearch: false,
  });

  // 豆瓣数据源相关状态
  const [isDoubanDropdownOpen, setIsDoubanDropdownOpen] = useState(false);
  const [isDoubanImageProxyDropdownOpen, setIsDoubanImageProxyDropdownOpen] =
    useState(false);

  // 豆瓣数据源选项
  const doubanDataSourceOptions = [
    { value: 'direct', label: '直连（服务器直接请求豆瓣）' },
    { value: 'cors-proxy-zwei', label: 'Cors Proxy By Zwei' },
    {
      value: 'cmliussss-cdn-tencent',
      label: '豆瓣 CDN By CMLiussss（腾讯云）',
    },
    { value: 'cmliussss-cdn-ali', label: '豆瓣 CDN By CMLiussss（阿里云）' },
    { value: 'custom', label: '自定义代理' },
  ];

  // 豆瓣图片代理选项
  const doubanImageProxyTypeOptions = [
    { value: 'direct', label: '直连（浏览器直接请求豆瓣）' },
    { value: 'server', label: '服务器代理（由服务器代理请求豆瓣）' },
    { value: 'img3', label: '豆瓣官方精品 CDN（阿里云）' },
    {
      value: 'cmliussss-cdn-tencent',
      label: '豆瓣 CDN By CMLiussss（腾讯云）',
    },
    { value: 'cmliussss-cdn-ali', label: '豆瓣 CDN By CMLiussss（阿里云）' },
    { value: 'custom', label: '自定义代理' },
  ];

  // 获取感谢信息
  const getThanksInfo = (dataSource: string) => {
    switch (dataSource) {
      case 'cors-proxy-zwei':
        return '感谢 @Zwei 提供豆瓣代理服务';
      case 'cmliussss-cdn-tencent':
      case 'cmliussss-cdn-ali':
        return '感谢 @CMLiussss 提供豆瓣 CDN 支持';
      default:
        return null;
    }
  };

  useEffect(() => {
    if (config?.SiteConfig) {
      setSiteSettings({
        ...config.SiteConfig,
        DoubanProxyType: config.SiteConfig.DoubanProxyType || 'direct',
        DoubanProxy: config.SiteConfig.DoubanProxy || '',
        DoubanImageProxyType:
          config.SiteConfig.DoubanImageProxyType || 'direct',
        DoubanImageProxy: config.SiteConfig.DoubanImageProxy || '',
        DisableYellowFilter: config.SiteConfig.DisableYellowFilter || false,
        FluidSearch: config.SiteConfig.FluidSearch || true,
        // TMDB配置
        TMDBApiKey: config.SiteConfig.TMDBApiKey || '',
        TMDBLanguage: config.SiteConfig.TMDBLanguage || 'zh-CN',
        EnableTMDBActorSearch: config.SiteConfig.EnableTMDBActorSearch || false,
      });
    }
  }, [config]);

  // 点击外部区域关闭下拉框
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (isDoubanDropdownOpen) {
        const target = event.target as Element;
        if (!target.closest('[data-dropdown="douban-datasource"]')) {
          setIsDoubanDropdownOpen(false);
        }
      }
    };

    if (isDoubanDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () =>
        document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isDoubanDropdownOpen]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (isDoubanImageProxyDropdownOpen) {
        const target = event.target as Element;
        if (!target.closest('[data-dropdown="douban-image-proxy"]')) {
          setIsDoubanImageProxyDropdownOpen(false);
        }
      }
    };

    if (isDoubanImageProxyDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () =>
        document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isDoubanImageProxyDropdownOpen]);

  // 处理豆瓣数据源变化
  const handleDoubanDataSourceChange = (value: string) => {
    setSiteSettings((prev) => ({
      ...prev,
      DoubanProxyType: value,
    }));
  };

  // 处理豆瓣图片代理变化
  const handleDoubanImageProxyChange = (value: string) => {
    setSiteSettings((prev) => ({
      ...prev,
      DoubanImageProxyType: value,
    }));
  };

  // 保存站点配置
  const handleSave = async () => {
    await withLoading('saveSiteConfig', async () => {
      try {
        const resp = await fetch('/api/admin/site', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...siteSettings }),
        });

        if (!resp.ok) {
          const data = await resp.json().catch(() => ({}));
          throw new Error(data.error || `保存失败: ${resp.status}`);
        }

        showSuccess('保存成功, 请刷新页面', showAlert);
        await refreshConfig();
      } catch (err) {
        showError(err instanceof Error ? err.message : '保存失败', showAlert);
        throw err;
      }
    });
  };

  if (!config) {
    return (
      <div className='flex justify-center items-center py-8'>
        <div className='flex items-center gap-3 px-6 py-3 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-xl border border-blue-200/50 dark:border-blue-700/50 shadow-md'>
          <div className='animate-spin rounded-full h-5 w-5 border-2 border-blue-300 border-t-blue-600 dark:border-blue-700 dark:border-t-blue-400'></div>
          <span className='text-sm font-medium text-gray-700 dark:text-gray-300'>
            加载配置中...
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className='space-y-6'>
      {/* 站点名称 */}
      <div>
        <label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2'>
          站点名称
        </label>
        <input
          type='text'
          value={siteSettings.SiteName}
          onChange={(e) =>
            setSiteSettings((prev) => ({ ...prev, SiteName: e.target.value }))
          }
          className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-green-500 focus:border-transparent'
        />
      </div>

      {/* 站点公告 */}
      <div>
        <label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2'>
          站点公告
        </label>
        <textarea
          value={siteSettings.Announcement}
          onChange={(e) =>
            setSiteSettings((prev) => ({
              ...prev,
              Announcement: e.target.value,
            }))
          }
          rows={3}
          className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-green-500 focus:border-transparent'
        />
      </div>

      {/* 豆瓣数据源设置 */}
      <div className='space-y-3'>
        <div>
          <label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2'>
            豆瓣数据代理
          </label>
          <div className='relative' data-dropdown='douban-datasource'>
            {/* 自定义下拉选择框 */}
            <button
              type='button'
              onClick={() => setIsDoubanDropdownOpen(!isDoubanDropdownOpen)}
              className='w-full px-3 py-2.5 pr-10 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all duration-200 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-sm hover:border-gray-400 dark:hover:border-gray-500 text-left'
            >
              {
                doubanDataSourceOptions.find(
                  (option) => option.value === siteSettings.DoubanProxyType
                )?.label
              }
            </button>

            {/* 下拉箭头 */}
            <div className='absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none'>
              <ChevronDown
                className={`w-4 h-4 text-gray-400 dark:text-gray-500 transition-transform duration-200 ${
                  isDoubanDropdownOpen ? 'rotate-180' : ''
                }`}
              />
            </div>

            {/* 下拉选项列表 */}
            {isDoubanDropdownOpen && (
              <div className='absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg max-h-60 overflow-auto'>
                {doubanDataSourceOptions.map((option) => (
                  <button
                    key={option.value}
                    type='button'
                    onClick={() => {
                      handleDoubanDataSourceChange(option.value);
                      setIsDoubanDropdownOpen(false);
                    }}
                    className={`w-full px-3 py-2.5 text-left text-sm transition-colors duration-150 flex items-center justify-between hover:bg-gray-100 dark:hover:bg-gray-700 ${
                      siteSettings.DoubanProxyType === option.value
                        ? 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400'
                        : 'text-gray-900 dark:text-gray-100'
                    }`}
                  >
                    <span className='truncate'>{option.label}</span>
                    {siteSettings.DoubanProxyType === option.value && (
                      <Check className='w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0 ml-2' />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
          <p className='mt-1 text-xs text-gray-500 dark:text-gray-400'>
            选择获取豆瓣数据的方式
          </p>

          {/* 感谢信息 */}
          {getThanksInfo(siteSettings.DoubanProxyType) && (
            <div className='mt-3 flex items-center justify-center px-3 text-xs text-gray-500 dark:text-gray-400'>
              <span className='font-medium'>
                {getThanksInfo(siteSettings.DoubanProxyType)}
              </span>
            </div>
          )}
        </div>

        {/* 豆瓣代理地址设置 - 仅在选择自定义代理时显示 */}
        {siteSettings.DoubanProxyType === 'custom' && (
          <div>
            <label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2'>
              豆瓣代理地址
            </label>
            <input
              type='text'
              placeholder='例如: https://proxy.example.com/fetch?url='
              value={siteSettings.DoubanProxy}
              onChange={(e) =>
                setSiteSettings((prev) => ({
                  ...prev,
                  DoubanProxy: e.target.value,
                }))
              }
              className='w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all duration-200 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 shadow-sm hover:border-gray-400 dark:hover:border-gray-500'
            />
            <p className='mt-1 text-xs text-gray-500 dark:text-gray-400'>
              自定义代理服务器地址
            </p>
          </div>
        )}
      </div>

      {/* 豆瓣图片代理设置 */}
      <div className='space-y-3'>
        <div>
          <label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2'>
            豆瓣图片代理
          </label>
          <div className='relative' data-dropdown='douban-image-proxy'>
            {/* 自定义下拉选择框 */}
            <button
              type='button'
              onClick={() =>
                setIsDoubanImageProxyDropdownOpen(
                  !isDoubanImageProxyDropdownOpen
                )
              }
              className='w-full px-3 py-2.5 pr-10 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all duration-200 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-sm hover:border-gray-400 dark:hover:border-gray-500 text-left'
            >
              {
                doubanImageProxyTypeOptions.find(
                  (option) => option.value === siteSettings.DoubanImageProxyType
                )?.label
              }
            </button>

            {/* 下拉箭头 */}
            <div className='absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none'>
              <ChevronDown
                className={`w-4 h-4 text-gray-400 dark:text-gray-500 transition-transform duration-200 ${
                  isDoubanImageProxyDropdownOpen ? 'rotate-180' : ''
                }`}
              />
            </div>

            {/* 下拉选项列表 */}
            {isDoubanImageProxyDropdownOpen && (
              <div className='absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg max-h-60 overflow-auto'>
                {doubanImageProxyTypeOptions.map((option) => (
                  <button
                    key={option.value}
                    type='button'
                    onClick={() => {
                      handleDoubanImageProxyChange(option.value);
                      setIsDoubanImageProxyDropdownOpen(false);
                    }}
                    className={`w-full px-3 py-2.5 text-left text-sm transition-colors duration-150 flex items-center justify-between hover:bg-gray-100 dark:hover:bg-gray-700 ${
                      siteSettings.DoubanImageProxyType === option.value
                        ? 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400'
                        : 'text-gray-900 dark:text-gray-100'
                    }`}
                  >
                    <span className='truncate'>{option.label}</span>
                    {siteSettings.DoubanImageProxyType === option.value && (
                      <Check className='w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0 ml-2' />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
          <p className='mt-1 text-xs text-gray-500 dark:text-gray-400'>
            选择获取豆瓣图片的方式
          </p>

          {/* 感谢信息 */}
          {getThanksInfo(siteSettings.DoubanImageProxyType) && (
            <div className='mt-3 flex items-center justify-center px-3 text-xs text-gray-500 dark:text-gray-400'>
              <span className='font-medium'>
                {getThanksInfo(siteSettings.DoubanImageProxyType)}
              </span>
            </div>
          )}
        </div>

        {/* 豆瓣代理地址设置 - 仅在选择自定义代理时显示 */}
        {siteSettings.DoubanImageProxyType === 'custom' && (
          <div>
            <label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2'>
              豆瓣图片代理地址
            </label>
            <input
              type='text'
              placeholder='例如: https://proxy.example.com/fetch?url='
              value={siteSettings.DoubanImageProxy}
              onChange={(e) =>
                setSiteSettings((prev) => ({
                  ...prev,
                  DoubanImageProxy: e.target.value,
                }))
              }
              className='w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all duration-200 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 shadow-sm hover:border-gray-400 dark:hover:border-gray-500'
            />
            <p className='mt-1 text-xs text-gray-500 dark:text-gray-400'>
              自定义图片代理服务器地址
            </p>
          </div>
        )}
      </div>

      {/* 搜索接口可拉取最大页数 */}
      <div>
        <label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2'>
          搜索接口可拉取最大页数
        </label>
        <input
          type='number'
          min={1}
          value={siteSettings.SearchDownstreamMaxPage}
          onChange={(e) =>
            setSiteSettings((prev) => ({
              ...prev,
              SearchDownstreamMaxPage: Number(e.target.value),
            }))
          }
          className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-green-500 focus:border-transparent'
        />
      </div>

      {/* 站点接口缓存时间 */}
      <div>
        <label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2'>
          站点接口缓存时间（秒）
        </label>
        <input
          type='number'
          min={1}
          value={siteSettings.SiteInterfaceCacheTime}
          onChange={(e) =>
            setSiteSettings((prev) => ({
              ...prev,
              SiteInterfaceCacheTime: Number(e.target.value),
            }))
          }
          className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-green-500 focus:border-transparent'
        />
      </div>

      {/* 禁用黄色过滤器 */}
      <div>
        <div className='flex items-center justify-between'>
          <label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2'>
            禁用黄色过滤器
          </label>
          <button
            type='button'
            onClick={() =>
              setSiteSettings((prev) => ({
                ...prev,
                DisableYellowFilter: !prev.DisableYellowFilter,
              }))
            }
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 ${
              siteSettings.DisableYellowFilter
                ? buttonStyles.toggleOn
                : buttonStyles.toggleOff
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full ${
                buttonStyles.toggleThumb
              } transition-transform ${
                siteSettings.DisableYellowFilter
                  ? buttonStyles.toggleThumbOn
                  : buttonStyles.toggleThumbOff
              }`}
            />
          </button>
        </div>
        <p className='mt-1 text-xs text-gray-500 dark:text-gray-400'>
          禁用黄色内容的过滤功能，允许显示所有内容。
        </p>
      </div>

      {/* 流式搜索 */}
      <div>
        <div className='flex items-center justify-between'>
          <label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2'>
            启用流式搜索
          </label>
          <button
            type='button'
            onClick={() =>
              setSiteSettings((prev) => ({
                ...prev,
                FluidSearch: !prev.FluidSearch,
              }))
            }
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 ${
              siteSettings.FluidSearch
                ? buttonStyles.toggleOn
                : buttonStyles.toggleOff
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full ${
                buttonStyles.toggleThumb
              } transition-transform ${
                siteSettings.FluidSearch
                  ? buttonStyles.toggleThumbOn
                  : buttonStyles.toggleThumbOff
              }`}
            />
          </button>
        </div>
        <p className='mt-1 text-xs text-gray-500 dark:text-gray-400'>
          启用后搜索结果将实时流式返回，提升用户体验。
        </p>
      </div>

      {/* TMDB配置 */}
      <div className='border-t border-gray-200 dark:border-gray-700 pt-6'>
        <h3 className='text-lg font-medium text-gray-900 dark:text-gray-100 mb-4'>
          TMDB 演员搜索配置
        </h3>

        {/* TMDB API Key */}
        <div className='mb-6'>
          <label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2'>
            TMDB API Key
          </label>
          <input
            type='password'
            value={siteSettings.TMDBApiKey || ''}
            onChange={(e) =>
              setSiteSettings((prev) => ({
                ...prev,
                TMDBApiKey: e.target.value,
              }))
            }
            placeholder='请输入TMDB API Key'
            className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-green-500 focus:border-transparent'
          />
          <p className='mt-1 text-xs text-gray-500 dark:text-gray-400'>
            请在{' '}
            <a
              href='https://www.themoviedb.org/settings/api'
              target='_blank'
              rel='noopener noreferrer'
              className='text-blue-500 hover:text-blue-600'
            >
              TMDB 官网
            </a>{' '}
            申请免费的 API Key
          </p>
        </div>

        {/* TMDB 语言配置 */}
        <div className='mb-6'>
          <label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2'>
            TMDB 语言
          </label>
          <select
            value={siteSettings.TMDBLanguage || 'zh-CN'}
            onChange={(e) =>
              setSiteSettings((prev) => ({
                ...prev,
                TMDBLanguage: e.target.value,
              }))
            }
            className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-green-500 focus:border-transparent'
          >
            <option value='zh-CN'>中文（简体）</option>
            <option value='zh-TW'>中文（繁体）</option>
            <option value='en-US'>英语</option>
            <option value='ja-JP'>日语</option>
            <option value='ko-KR'>韩语</option>
          </select>
        </div>

        {/* 启用TMDB演员搜索 */}
        <div className='flex items-center justify-between'>
          <div>
            <label className='text-sm font-medium text-gray-700 dark:text-gray-300'>
              启用 TMDB 演员搜索
            </label>
            <p className='mt-1 text-xs text-gray-500 dark:text-gray-400'>
              启用后用户可以在搜索页面按演员名字搜索相关影视作品
            </p>
          </div>
          <button
            type='button'
            onClick={() =>
              setSiteSettings((prev) => ({
                ...prev,
                EnableTMDBActorSearch: !prev.EnableTMDBActorSearch,
              }))
            }
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              siteSettings.EnableTMDBActorSearch
                ? 'bg-green-600'
                : 'bg-gray-200 dark:bg-gray-700'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                siteSettings.EnableTMDBActorSearch
                  ? 'translate-x-6'
                  : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </div>

      {/* 操作按钮 */}
      <div className='flex justify-end'>
        <button
          onClick={handleSave}
          disabled={isLoading('saveSiteConfig')}
          className={`px-4 py-2 ${
            isLoading('saveSiteConfig')
              ? buttonStyles.disabled
              : buttonStyles.success
          } rounded-lg transition-colors`}
        >
          {isLoading('saveSiteConfig') ? '保存中…' : '保存'}
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

// 直播源配置组件

export default SiteConfigComponent;
