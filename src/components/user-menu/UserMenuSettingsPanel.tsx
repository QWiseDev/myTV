import { Check, ChevronDown, X } from 'lucide-react';

import type { UserMenuSettingsSnapshot } from '@/lib/user-menu-settings';

import {
  SCROLLABLE_PANEL_STYLE,
  UserMenuPanelBackdrop,
} from './UserMenuPanelPrimitives';

const DOUBAN_DATA_SOURCE_OPTIONS = [
  { value: 'direct', label: '直连（服务器直接请求豆瓣）' },
  { value: 'cors-proxy-zwei', label: 'Cors Proxy By Zwei' },
  {
    value: 'cmliussss-cdn-tencent',
    label: '豆瓣 CDN By CMLiussss（腾讯云）',
  },
  { value: 'cmliussss-cdn-ali', label: '豆瓣 CDN By CMLiussss（阿里云）' },
  { value: 'custom', label: '自定义代理' },
];

const DOUBAN_IMAGE_PROXY_TYPE_OPTIONS = [
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

interface UserMenuSettingsPanelProps {
  isDoubanDataSourceDropdownOpen: boolean;
  isDoubanImageProxyDropdownOpen: boolean;
  onAutoNextEpisodeChange: (value: boolean) => void;
  onAutoSkipChange: (value: boolean) => void;
  onClose: () => void;
  onContinueWatchingFilterChange: (value: boolean) => void;
  onContinueWatchingMaxProgressChange: (value: number) => void;
  onContinueWatchingMinProgressChange: (value: number) => void;
  onDefaultAggregateSearchChange: (value: boolean) => void;
  onDoubanDataSourceChange: (value: string) => void;
  onDoubanDataSourceDropdownOpenChange: (open: boolean) => void;
  onDoubanImageProxyDropdownOpenChange: (open: boolean) => void;
  onDoubanImageProxyTypeChange: (value: string) => void;
  onDoubanImageProxyUrlChange: (value: string) => void;
  onDoubanProxyUrlChange: (value: string) => void;
  onFluidSearchChange: (value: boolean) => void;
  onLiveDirectConnectChange: (value: boolean) => void;
  onOptimizationChange: (value: boolean) => void;
  onReset: () => void;
  settings: UserMenuSettingsSnapshot;
}

function getThanksInfo(dataSource: string) {
  switch (dataSource) {
    case 'cors-proxy-zwei':
      return '感谢 @Zwei 提供豆瓣代理服务';
    case 'cmliussss-cdn-tencent':
    case 'cmliussss-cdn-ali':
      return '感谢 @CMLiussss 提供豆瓣 CDN 支持';
    default:
      return null;
  }
}

export function UserMenuSettingsPanel({
  isDoubanDataSourceDropdownOpen,
  isDoubanImageProxyDropdownOpen,
  onAutoNextEpisodeChange,
  onAutoSkipChange,
  onClose,
  onContinueWatchingFilterChange,
  onContinueWatchingMaxProgressChange,
  onContinueWatchingMinProgressChange,
  onDefaultAggregateSearchChange,
  onDoubanDataSourceChange,
  onDoubanDataSourceDropdownOpenChange,
  onDoubanImageProxyDropdownOpenChange,
  onDoubanImageProxyTypeChange,
  onDoubanImageProxyUrlChange,
  onDoubanProxyUrlChange,
  onFluidSearchChange,
  onLiveDirectConnectChange,
  onOptimizationChange,
  onReset,
  settings,
}: UserMenuSettingsPanelProps) {
  const {
    continueWatchingMaxProgress,
    continueWatchingMinProgress,
    defaultAggregateSearch,
    doubanDataSource,
    doubanImageProxyType,
    doubanImageProxyUrl,
    doubanProxyUrl,
    enableAutoNextEpisode,
    enableAutoSkip,
    enableContinueWatchingFilter,
    enableOptimization,
    fluidSearch,
    liveDirectConnect,
  } = settings;

  return (
    <>
      <UserMenuPanelBackdrop onClick={onClose} />

      <div className='fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-xl max-h-[90vh] bg-white dark:bg-gray-900 rounded-xl shadow-xl z-[1001] flex flex-col'>
        <div
          className='flex-1 p-6 overflow-y-auto'
          data-panel-content
          style={SCROLLABLE_PANEL_STYLE}
        >
          <div className='flex items-center justify-between mb-6'>
            <div className='flex items-center gap-3'>
              <h3 className='text-xl font-bold text-gray-800 dark:text-gray-200'>
                本地设置
              </h3>
              <button
                onClick={onReset}
                className='px-2 py-1 text-xs text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 border border-red-200 hover:border-red-300 dark:border-red-800 dark:hover:border-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors'
                title='重置为默认设置'
              >
                恢复默认
              </button>
            </div>
            <button
              onClick={onClose}
              className='w-8 h-8 p-1 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors'
              aria-label='Close'
            >
              <X className='w-full h-full' />
            </button>
          </div>

          <div className='space-y-6'>
            <div className='space-y-3'>
              <div>
                <h4 className='text-sm font-medium text-gray-700 dark:text-gray-300'>
                  豆瓣数据代理
                </h4>
                <p className='text-xs text-gray-500 dark:text-gray-400 mt-1'>
                  选择获取豆瓣数据的方式
                </p>
              </div>
              <div className='relative' data-dropdown='douban-datasource'>
                <button
                  type='button'
                  onClick={() =>
                    onDoubanDataSourceDropdownOpenChange(
                      !isDoubanDataSourceDropdownOpen,
                    )
                  }
                  className='w-full px-3 py-2.5 pr-10 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all duration-200 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-sm hover:border-gray-400 dark:hover:border-gray-500 text-left'
                >
                  {
                    DOUBAN_DATA_SOURCE_OPTIONS.find(
                      (option) => option.value === doubanDataSource,
                    )?.label
                  }
                </button>

                <div className='absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none'>
                  <ChevronDown
                    className={`w-4 h-4 text-gray-400 dark:text-gray-500 transition-transform duration-200 ${
                      isDoubanDataSourceDropdownOpen ? 'rotate-180' : ''
                    }`}
                  />
                </div>

                {isDoubanDataSourceDropdownOpen && (
                  <div className='absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg max-h-60 overflow-auto'>
                    {DOUBAN_DATA_SOURCE_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type='button'
                        onClick={() => {
                          onDoubanDataSourceChange(option.value);
                          onDoubanDataSourceDropdownOpenChange(false);
                        }}
                        className={`w-full px-3 py-2.5 text-left text-sm transition-colors duration-150 flex items-center justify-between hover:bg-gray-100 dark:hover:bg-gray-700 ${
                          doubanDataSource === option.value
                            ? 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400'
                            : 'text-gray-900 dark:text-gray-100'
                        }`}
                      >
                        <span className='truncate'>{option.label}</span>
                        {doubanDataSource === option.value && (
                          <Check className='w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0 ml-2' />
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {getThanksInfo(doubanDataSource) && (
                <div className='mt-3 flex items-center justify-center px-3 text-xs text-gray-500 dark:text-gray-400'>
                  <span className='font-medium'>
                    {getThanksInfo(doubanDataSource)}
                  </span>
                </div>
              )}
            </div>

            {doubanDataSource === 'custom' && (
              <div className='space-y-3'>
                <div>
                  <h4 className='text-sm font-medium text-gray-700 dark:text-gray-300'>
                    豆瓣代理地址
                  </h4>
                  <p className='text-xs text-gray-500 dark:text-gray-400 mt-1'>
                    自定义代理服务器地址
                  </p>
                </div>
                <input
                  type='text'
                  className='w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all duration-200 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 shadow-sm hover:border-gray-400 dark:hover:border-gray-500'
                  placeholder='例如: https://proxy.example.com/fetch?url='
                  value={doubanProxyUrl}
                  onChange={(event) =>
                    onDoubanProxyUrlChange(event.target.value)
                  }
                />
              </div>
            )}

            <div className='border-t border-gray-200 dark:border-gray-700'></div>

            <div className='space-y-3'>
              <div>
                <h4 className='text-sm font-medium text-gray-700 dark:text-gray-300'>
                  豆瓣图片代理
                </h4>
                <p className='text-xs text-gray-500 dark:text-gray-400 mt-1'>
                  选择获取豆瓣图片的方式
                </p>
              </div>
              <div className='relative' data-dropdown='douban-image-proxy'>
                <button
                  type='button'
                  onClick={() =>
                    onDoubanImageProxyDropdownOpenChange(
                      !isDoubanImageProxyDropdownOpen,
                    )
                  }
                  className='w-full px-3 py-2.5 pr-10 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all duration-200 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-sm hover:border-gray-400 dark:hover:border-gray-500 text-left'
                >
                  {
                    DOUBAN_IMAGE_PROXY_TYPE_OPTIONS.find(
                      (option) => option.value === doubanImageProxyType,
                    )?.label
                  }
                </button>

                <div className='absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none'>
                  <ChevronDown
                    className={`w-4 h-4 text-gray-400 dark:text-gray-500 transition-transform duration-200 ${
                      isDoubanDataSourceDropdownOpen ? 'rotate-180' : ''
                    }`}
                  />
                </div>

                {isDoubanImageProxyDropdownOpen && (
                  <div className='absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg max-h-60 overflow-auto'>
                    {DOUBAN_IMAGE_PROXY_TYPE_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type='button'
                        onClick={() => {
                          onDoubanImageProxyTypeChange(option.value);
                          onDoubanImageProxyDropdownOpenChange(false);
                        }}
                        className={`w-full px-3 py-2.5 text-left text-sm transition-colors duration-150 flex items-center justify-between hover:bg-gray-100 dark:hover:bg-gray-700 ${
                          doubanImageProxyType === option.value
                            ? 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400'
                            : 'text-gray-900 dark:text-gray-100'
                        }`}
                      >
                        <span className='truncate'>{option.label}</span>
                        {doubanImageProxyType === option.value && (
                          <Check className='w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0 ml-2' />
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {getThanksInfo(doubanImageProxyType) && (
                <div className='mt-3 flex items-center justify-center px-3 text-xs text-gray-500 dark:text-gray-400'>
                  <span className='font-medium'>
                    {getThanksInfo(doubanImageProxyType)}
                  </span>
                </div>
              )}
            </div>

            {doubanImageProxyType === 'custom' && (
              <div className='space-y-3'>
                <div>
                  <h4 className='text-sm font-medium text-gray-700 dark:text-gray-300'>
                    豆瓣图片代理地址
                  </h4>
                  <p className='text-xs text-gray-500 dark:text-gray-400 mt-1'>
                    自定义图片代理服务器地址
                  </p>
                </div>
                <input
                  type='text'
                  className='w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all duration-200 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 shadow-sm hover:border-gray-400 dark:hover:border-gray-500'
                  placeholder='例如: https://proxy.example.com/fetch?url='
                  value={doubanImageProxyUrl}
                  onChange={(event) =>
                    onDoubanImageProxyUrlChange(event.target.value)
                  }
                />
              </div>
            )}

            <div className='border-t border-gray-200 dark:border-gray-700'></div>

            <div className='flex items-center justify-between'>
              <div>
                <h4 className='text-sm font-medium text-gray-700 dark:text-gray-300'>
                  默认聚合搜索结果
                </h4>
                <p className='text-xs text-gray-500 dark:text-gray-400 mt-1'>
                  搜索时默认按标题和年份聚合显示结果
                </p>
              </div>
              <label className='flex items-center cursor-pointer'>
                <div className='relative'>
                  <input
                    type='checkbox'
                    className='sr-only peer'
                    checked={defaultAggregateSearch}
                    onChange={(event) =>
                      onDefaultAggregateSearchChange(event.target.checked)
                    }
                  />
                  <div className='w-11 h-6 bg-gray-300 rounded-full peer-checked:bg-green-500 transition-colors dark:bg-gray-600'></div>
                  <div className='absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform peer-checked:translate-x-5'></div>
                </div>
              </label>
            </div>

            <div className='flex items-center justify-between'>
              <div>
                <h4 className='text-sm font-medium text-gray-700 dark:text-gray-300'>
                  优选和测速
                </h4>
                <p className='text-xs text-gray-500 dark:text-gray-400 mt-1'>
                  如出现播放器劫持问题可关闭
                </p>
              </div>
              <label className='flex items-center cursor-pointer'>
                <div className='relative'>
                  <input
                    type='checkbox'
                    className='sr-only peer'
                    checked={enableOptimization}
                    onChange={(event) =>
                      onOptimizationChange(event.target.checked)
                    }
                  />
                  <div className='w-11 h-6 bg-gray-300 rounded-full peer-checked:bg-green-500 transition-colors dark:bg-gray-600'></div>
                  <div className='absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform peer-checked:translate-x-5'></div>
                </div>
              </label>
            </div>

            <div className='flex items-center justify-between'>
              <div>
                <h4 className='text-sm font-medium text-gray-700 dark:text-gray-300'>
                  流式搜索输出
                </h4>
                <p className='text-xs text-gray-500 dark:text-gray-400 mt-1'>
                  启用搜索结果实时流式输出，关闭后使用传统一次性搜索
                </p>
              </div>
              <label className='flex items-center cursor-pointer'>
                <div className='relative'>
                  <input
                    type='checkbox'
                    className='sr-only peer'
                    checked={fluidSearch}
                    onChange={(event) =>
                      onFluidSearchChange(event.target.checked)
                    }
                  />
                  <div className='w-11 h-6 bg-gray-300 rounded-full peer-checked:bg-green-500 transition-colors dark:bg-gray-600'></div>
                  <div className='absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform peer-checked:translate-x-5'></div>
                </div>
              </label>
            </div>

            <div className='flex items-center justify-between'>
              <div>
                <h4 className='text-sm font-medium text-gray-700 dark:text-gray-300'>
                  IPTV 视频浏览器直连
                </h4>
                <p className='text-xs text-gray-500 dark:text-gray-400 mt-1'>
                  开启 IPTV 视频浏览器直连时，需要自备 Allow CORS 插件
                </p>
              </div>
              <label className='flex items-center cursor-pointer'>
                <div className='relative'>
                  <input
                    type='checkbox'
                    className='sr-only peer'
                    checked={liveDirectConnect}
                    onChange={(event) =>
                      onLiveDirectConnectChange(event.target.checked)
                    }
                  />
                  <div className='w-11 h-6 bg-gray-300 rounded-full peer-checked:bg-green-500 transition-colors dark:bg-gray-600'></div>
                  <div className='absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform peer-checked:translate-x-5'></div>
                </div>
              </label>
            </div>

            <div className='border-t border-gray-200 dark:border-gray-700'></div>

            <div className='space-y-4'>
              <div>
                <h4 className='text-sm font-medium text-gray-700 dark:text-gray-300'>
                  跳过片头片尾设置
                </h4>
                <p className='text-xs text-gray-500 dark:text-gray-400 mt-1'>
                  控制播放器默认的片头片尾跳过行为
                </p>
              </div>

              <div className='flex items-center justify-between'>
                <div>
                  <h5 className='text-sm font-medium text-gray-700 dark:text-gray-300'>
                    启用自动跳过
                  </h5>
                  <p className='text-xs text-gray-500 dark:text-gray-400 mt-1'>
                    开启后将自动跳过片头片尾，关闭则显示手动跳过按钮
                  </p>
                </div>
                <label className='flex items-center cursor-pointer'>
                  <div className='relative'>
                    <input
                      type='checkbox'
                      className='sr-only peer'
                      checked={enableAutoSkip}
                      onChange={(event) =>
                        onAutoSkipChange(event.target.checked)
                      }
                    />
                    <div className='w-11 h-6 bg-gray-300 rounded-full peer-checked:bg-green-500 transition-colors dark:bg-gray-600'></div>
                    <div className='absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform peer-checked:translate-x-5'></div>
                  </div>
                </label>
              </div>

              <div className='flex items-center justify-between'>
                <div>
                  <h5 className='text-sm font-medium text-gray-700 dark:text-gray-300'>
                    片尾自动播放下一集
                  </h5>
                  <p className='text-xs text-gray-500 dark:text-gray-400 mt-1'>
                    开启后片尾结束时自动跳转到下一集
                  </p>
                </div>
                <label className='flex items-center cursor-pointer'>
                  <div className='relative'>
                    <input
                      type='checkbox'
                      className='sr-only peer'
                      checked={enableAutoNextEpisode}
                      onChange={(event) =>
                        onAutoNextEpisodeChange(event.target.checked)
                      }
                    />
                    <div className='w-11 h-6 bg-gray-300 rounded-full peer-checked:bg-green-500 transition-colors dark:bg-gray-600'></div>
                    <div className='absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform peer-checked:translate-x-5'></div>
                  </div>
                </label>
              </div>

              <div className='text-xs text-gray-500 dark:text-gray-400 bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg border border-blue-200 dark:border-blue-800'>
                💡
                这些设置会作为新视频的默认配置。对于已配置的视频，请在播放页面的"跳过设置"中单独调整。
              </div>
            </div>

            <div className='border-t border-gray-200 dark:border-gray-700'></div>

            <div className='space-y-4'>
              <div className='flex items-center justify-between'>
                <div>
                  <h4 className='text-sm font-medium text-gray-700 dark:text-gray-300'>
                    继续观看进度筛选
                  </h4>
                  <p className='text-xs text-gray-500 dark:text-gray-400 mt-1'>
                    是否启用"继续观看"的播放进度筛选功能
                  </p>
                </div>
                <label className='flex items-center cursor-pointer'>
                  <div className='relative'>
                    <input
                      type='checkbox'
                      className='sr-only peer'
                      checked={enableContinueWatchingFilter}
                      onChange={(event) =>
                        onContinueWatchingFilterChange(event.target.checked)
                      }
                    />
                    <div className='w-11 h-6 bg-gray-300 rounded-full peer-checked:bg-green-500 transition-colors dark:bg-gray-600'></div>
                    <div className='absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform peer-checked:translate-x-5'></div>
                  </div>
                </label>
              </div>

              {enableContinueWatchingFilter && (
                <>
                  <div>
                    <h5 className='text-sm font-medium text-gray-600 dark:text-gray-400 mb-3'>
                      进度范围设置
                    </h5>
                  </div>

                  <div className='grid grid-cols-2 gap-4'>
                    <div>
                      <label className='block text-sm font-medium text-gray-600 dark:text-gray-400 mb-2'>
                        最小进度 (%)
                      </label>
                      <input
                        type='number'
                        min='0'
                        max='100'
                        className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all duration-200 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100'
                        value={continueWatchingMinProgress}
                        onChange={(event) => {
                          const value = Math.max(
                            0,
                            Math.min(100, parseInt(event.target.value) || 0),
                          );
                          onContinueWatchingMinProgressChange(value);
                        }}
                      />
                    </div>

                    <div>
                      <label className='block text-sm font-medium text-gray-600 dark:text-gray-400 mb-2'>
                        最大进度 (%)
                      </label>
                      <input
                        type='number'
                        min='0'
                        max='100'
                        className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all duration-200 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100'
                        value={continueWatchingMaxProgress}
                        onChange={(event) => {
                          const value = Math.max(
                            0,
                            Math.min(100, parseInt(event.target.value) || 100),
                          );
                          onContinueWatchingMaxProgressChange(value);
                        }}
                      />
                    </div>
                  </div>

                  <div className='text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 p-3 rounded-lg'>
                    当前设置：显示播放进度在 {continueWatchingMinProgress}% -{' '}
                    {continueWatchingMaxProgress}% 之间的内容
                  </div>
                </>
              )}

              {!enableContinueWatchingFilter && (
                <div className='text-xs text-gray-500 dark:text-gray-400 bg-orange-50 dark:bg-orange-900/20 p-3 rounded-lg border border-orange-200 dark:border-orange-800'>
                  筛选已关闭：将显示所有播放时间超过2分钟的内容
                </div>
              )}
            </div>
          </div>

          <div className='mt-6 pt-4 border-t border-gray-200 dark:border-gray-700'>
            <p className='text-xs text-gray-500 dark:text-gray-400 text-center'>
              这些设置保存在本地浏览器中
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
