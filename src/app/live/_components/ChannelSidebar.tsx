/* eslint-disable @next/next/no-img-element -- 频道 logo 走 /api/proxy 代理直连 img，使用 next/image 会改变原有请求行为 */

import { Radio, RefreshCw, Search, Tv, X } from 'lucide-react';
import type { MutableRefObject, RefObject } from 'react';

import { GroupTabBar } from './GroupTabBar';
import type { LiveChannel, LiveSource } from '../hooks/useLiveSources';

export interface ChannelSidebarProps {
  isChannelListCollapsed: boolean;
  activeTab: 'channels' | 'sources';
  onTabChange: (tab: 'channels' | 'sources') => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  currentSource: LiveSource | null;
  currentChannel: LiveChannel | null;
  isSwitchingSource: boolean;
  groupedChannels: { [key: string]: LiveChannel[] };
  selectedGroup: string;
  onGroupChange: (group: string) => void;
  groupContainerRef: RefObject<HTMLDivElement>;
  groupButtonRefs: MutableRefObject<(HTMLButtonElement | null)[]>;
  filteredChannels: LiveChannel[];
  channelListRef: RefObject<HTMLDivElement>;
  onChannelChange: (channel: LiveChannel) => void;
  currentSourceSearchResults: LiveChannel[];
  liveSources: LiveSource[];
  isRefreshingSource: boolean;
  onRefresh: () => void;
  autoRefreshEnabled: boolean;
  onAutoRefreshEnabledChange: (enabled: boolean) => void;
  autoRefreshInterval: number;
  onAutoRefreshIntervalChange: (interval: number) => void;
  onSourceChange: (source: LiveSource) => void;
}

/**
 * 直播页频道侧栏：Tab 切换、频道搜索、分组条、频道列表与直播源管理面板。
 * 拆分自直播页原 JSX，事件回调原样透传，不做任何额外状态处理。
 */
export function ChannelSidebar({
  isChannelListCollapsed,
  activeTab,
  onTabChange,
  searchQuery,
  onSearchChange,
  currentSource,
  currentChannel,
  isSwitchingSource,
  groupedChannels,
  selectedGroup,
  onGroupChange,
  groupContainerRef,
  groupButtonRefs,
  filteredChannels,
  channelListRef,
  onChannelChange,
  currentSourceSearchResults,
  liveSources,
  isRefreshingSource,
  onRefresh,
  autoRefreshEnabled,
  onAutoRefreshEnabledChange,
  autoRefreshInterval,
  onAutoRefreshIntervalChange,
  onSourceChange,
}: ChannelSidebarProps) {
  return (
    <div
      className={`h-[300px] lg:h-full md:overflow-hidden transition-all duration-300 ease-in-out ${
        isChannelListCollapsed
          ? 'md:col-span-1 lg:hidden lg:opacity-0 lg:scale-95'
          : 'md:col-span-1 lg:opacity-100 lg:scale-100'
      }`}
    >
      <div className='md:ml-2 px-4 py-0 h-full rounded-xl bg-black/10 dark:bg-white/5 flex flex-col border border-white/0 dark:border-white/30 overflow-hidden'>
        {/* 主要的 Tab 切换 */}
        <div className='flex mb-1 -mx-6 flex-shrink-0'>
          <div
            onClick={() => onTabChange('channels')}
            className={`flex-1 py-3 px-6 text-center cursor-pointer transition-all duration-200 font-medium
              ${
                activeTab === 'channels'
                  ? 'text-green-600 dark:text-green-400'
                  : 'text-gray-700 hover:text-green-600 bg-black/5 dark:bg-white/5 dark:text-gray-300 dark:hover:text-green-400 hover:bg-black/3 dark:hover:bg-white/3'
              }
            `.trim()}
          >
            频道
          </div>
          <div
            onClick={() => onTabChange('sources')}
            className={`flex-1 py-3 px-6 text-center cursor-pointer transition-all duration-200 font-medium
              ${
                activeTab === 'sources'
                  ? 'text-green-600 dark:text-green-400'
                  : 'text-gray-700 hover:text-green-600 bg-black/5 dark:bg-white/5 dark:text-gray-300 dark:hover:text-green-400 hover:bg-black/3 dark:hover:bg-white/3'
              }
            `.trim()}
          >
            直播源
          </div>
        </div>

        {/* 频道 Tab 内容 */}
        {activeTab === 'channels' && (
          <>
            {/* 搜索框 */}
            <div className='mb-4 -mx-6 px-6 flex-shrink-0'>
              <div className='relative'>
                <Search className='absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400' />
                <input
                  type='text'
                  placeholder='搜索频道...'
                  value={searchQuery}
                  onChange={(e) => onSearchChange(e.target.value)}
                  className='w-full pl-10 pr-8 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent'
                />
                {searchQuery && (
                  <button
                    onClick={() => onSearchChange('')}
                    className='absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
                  >
                    <X className='w-4 h-4' />
                  </button>
                )}
              </div>
            </div>

            {!searchQuery.trim() ? (
              // 原有的分组显示模式
              <>
                {/* 分组标签 */}
                <GroupTabBar
                  groupedChannels={groupedChannels}
                  selectedGroup={selectedGroup}
                  isSwitchingSource={isSwitchingSource}
                  onGroupChange={onGroupChange}
                  groupContainerRef={groupContainerRef}
                  groupButtonRefs={groupButtonRefs}
                />

                {/* 频道列表 */}
                <div
                  ref={channelListRef}
                  className='flex-1 overflow-y-auto space-y-2 pb-4'
                >
                  {filteredChannels.length > 0 ? (
                    filteredChannels.map((channel) => {
                      const isActive =
                        channel.id === currentChannel?.id;
                      return (
                        <button
                          key={channel.id}
                          data-channel-id={channel.id}
                          onClick={() => onChannelChange(channel)}
                          disabled={isSwitchingSource}
                          className={`w-full p-3 rounded-lg text-left transition-all duration-200 ${
                            isSwitchingSource
                              ? 'opacity-50 cursor-not-allowed'
                              : isActive
                              ? 'bg-green-100 dark:bg-green-900/30 border border-green-300 dark:border-green-700'
                              : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                          }`}
                        >
                          <div className='flex items-center gap-3'>
                            <div className='w-10 h-10 bg-gray-300 dark:bg-gray-700 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden'>
                              {channel.logo ? (
                                <img
                                  src={`/api/proxy/logo?url=${encodeURIComponent(
                                    channel.logo
                                  )}&source=${
                                    currentSource?.key || ''
                                  }`}
                                  alt={channel.name}
                                  className='w-full h-full rounded object-contain'
                                  loading='lazy'
                                />
                              ) : (
                                <Tv className='w-5 h-5 text-gray-500' />
                              )}
                            </div>
                            <div className='flex-1 min-w-0'>
                              <div
                                className='text-sm font-medium text-gray-900 dark:text-gray-100 truncate'
                                title={channel.name}
                              >
                                {channel.name}
                              </div>
                              <div
                                className='text-xs text-gray-500 dark:text-gray-400 mt-1'
                                title={channel.group}
                              >
                                {channel.group}
                              </div>
                            </div>
                          </div>
                        </button>
                      );
                    })
                  ) : (
                    <div className='flex flex-col items-center justify-center py-12 text-center'>
                      <div className='relative mb-6'>
                        <div className='w-20 h-20 bg-gradient-to-br from-gray-100 to-slate-200 dark:from-gray-700 dark:to-slate-700 rounded-2xl flex items-center justify-center shadow-lg'>
                          <Tv className='w-10 h-10 text-gray-400 dark:text-gray-500' />
                        </div>
                        {/* 装饰小点 */}
                        <div className='absolute -top-1 -right-1 w-3 h-3 bg-blue-400 rounded-full animate-ping'></div>
                        <div className='absolute -bottom-1 -left-1 w-2 h-2 bg-purple-400 rounded-full animate-pulse'></div>
                      </div>
                      <p className='text-base font-semibold text-gray-700 dark:text-gray-300 mb-2'>
                        暂无可用频道
                      </p>
                      <p className='text-sm text-gray-500 dark:text-gray-400'>
                        请选择其他直播源或稍后再试
                      </p>
                    </div>
                  )}
                </div>
              </>
            ) : (
              // 搜索结果显示（仅当前源）
              <div className='flex-1 overflow-y-auto space-y-2 pb-4'>
                {currentSourceSearchResults.length > 0 ? (
                  <div className='space-y-1 mb-2'>
                    <div className='text-xs text-gray-500 dark:text-gray-400 px-2'>
                      在 "{currentSource?.name}" 中找到{' '}
                      {currentSourceSearchResults.length} 个频道
                    </div>
                  </div>
                ) : null}

                {currentSourceSearchResults.length > 0 ? (
                  currentSourceSearchResults.map((channel) => {
                    const isActive = channel.id === currentChannel?.id;
                    return (
                      <button
                        key={channel.id}
                        onClick={() => onChannelChange(channel)}
                        disabled={isSwitchingSource}
                        className={`w-full p-3 rounded-lg text-left transition-all duration-200 ${
                          isSwitchingSource
                            ? 'opacity-50 cursor-not-allowed'
                            : isActive
                            ? 'bg-green-100 dark:bg-green-900/30 border border-green-300 dark:border-green-700'
                            : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                        }`}
                      >
                        <div className='flex items-center gap-3'>
                          <div className='w-10 h-10 bg-gray-300 dark:bg-gray-700 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden'>
                            {channel.logo ? (
                              <img
                                src={`/api/proxy/logo?url=${encodeURIComponent(
                                  channel.logo
                                )}&source=${currentSource?.key || ''}`}
                                alt={channel.name}
                                className='w-full h-full rounded object-contain'
                                loading='lazy'
                              />
                            ) : (
                              <Tv className='w-5 h-5 text-gray-500' />
                            )}
                          </div>
                          <div className='flex-1 min-w-0'>
                            <div
                              className='text-sm font-medium text-gray-900 dark:text-gray-100 truncate'
                              dangerouslySetInnerHTML={{
                                __html: searchQuery
                                  ? channel.name.replace(
                                      new RegExp(
                                        `(${searchQuery.replace(
                                          /[.*+?^${}()|[\]\\]/g,
                                          '\\$&'
                                        )})`,
                                        'gi'
                                      ),
                                      '<mark class="bg-yellow-200 dark:bg-yellow-800 px-0.5 rounded">$1</mark>'
                                    )
                                  : channel.name,
                              }}
                            />
                            <div className='text-xs text-gray-500 dark:text-gray-400 mt-1'>
                              {channel.group}
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })
                ) : (
                  <div className='flex flex-col items-center justify-center py-12 text-center'>
                    <div className='w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-4'>
                      <Search className='w-8 h-8 text-gray-400 dark:text-gray-600' />
                    </div>
                    <p className='text-gray-500 dark:text-gray-400 font-medium'>
                      未找到匹配的频道
                    </p>
                    <p className='text-sm text-gray-400 dark:text-gray-500 mt-1'>
                      在当前直播源 "{currentSource?.name}"
                      中未找到匹配结果
                    </p>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* 直播源 Tab 内容 */}
        {activeTab === 'sources' && (
          <div className='flex flex-col h-full mt-4'>
            {/* 刷新控制区域 */}
            <div className='mb-4 -mx-6 px-6 flex-shrink-0 space-y-3'>
              {/* 手动刷新按钮 */}
              <div className='flex gap-2'>
                <button
                  onClick={onRefresh}
                  disabled={isRefreshingSource}
                  className='flex items-center gap-2 px-3 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white text-sm rounded-lg transition-colors flex-1'
                >
                  <RefreshCw
                    className={`w-4 h-4 ${
                      isRefreshingSource ? 'animate-spin' : ''
                    }`}
                  />
                  {isRefreshingSource ? '刷新中...' : '刷新源'}
                </button>
              </div>

              {/* 自动刷新控制 */}
              <div className='flex items-center gap-3'>
                <div className='flex items-center gap-2'>
                  <input
                    type='checkbox'
                    id='autoRefresh'
                    checked={autoRefreshEnabled}
                    onChange={(e) =>
                      onAutoRefreshEnabledChange(e.target.checked)
                    }
                    className='rounded text-green-500 focus:ring-green-500'
                  />
                  <label
                    htmlFor='autoRefresh'
                    className='text-sm text-gray-700 dark:text-gray-300'
                  >
                    自动刷新
                  </label>
                </div>

                {autoRefreshEnabled && (
                  <div className='flex items-center gap-2'>
                    <select
                      value={autoRefreshInterval}
                      onChange={(e) =>
                        onAutoRefreshIntervalChange(Number(e.target.value))
                      }
                      className='text-xs px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100'
                    >
                      <option value={10}>10分钟</option>
                      <option value={15}>15分钟</option>
                      <option value={30}>30分钟</option>
                      <option value={60}>1小时</option>
                      <option value={120}>2小时</option>
                    </select>
                  </div>
                )}
              </div>
            </div>

            <div className='flex-1 overflow-y-auto space-y-2 pb-20'>
              {liveSources.length > 0 ? (
                liveSources.map((source) => {
                  const isCurrentSource =
                    source.key === currentSource?.key;
                  return (
                    <div
                      key={source.key}
                      onClick={() =>
                        !isCurrentSource && onSourceChange(source)
                      }
                      className={`flex items-start gap-3 px-2 py-3 rounded-lg transition-all select-none duration-200 relative
                        ${
                          isCurrentSource
                            ? 'bg-green-500/10 dark:bg-green-500/20 border-green-500/30 border'
                            : 'hover:bg-gray-200/50 dark:hover:bg-white/10 hover:scale-[1.02] cursor-pointer'
                        }`.trim()}
                    >
                      {/* 图标 */}
                      <div className='w-12 h-12 bg-gray-200 dark:bg-gray-600 rounded-lg flex items-center justify-center flex-shrink-0'>
                        <Radio className='w-6 h-6 text-gray-500' />
                      </div>

                      {/* 信息 */}
                      <div className='flex-1 min-w-0'>
                        <div className='text-sm font-medium text-gray-900 dark:text-gray-100 truncate'>
                          {source.name}
                        </div>
                        <div className='text-xs text-gray-500 dark:text-gray-400 mt-1'>
                          {!source.channelNumber ||
                          source.channelNumber === 0
                            ? '-'
                            : `${source.channelNumber} 个频道`}
                        </div>
                      </div>

                      {/* 当前标识 */}
                      {isCurrentSource && (
                        <div className='absolute top-2 right-2 w-2 h-2 bg-green-500 rounded-full'></div>
                      )}
                    </div>
                  );
                })
              ) : (
                <div className='flex flex-col items-center justify-center py-12 text-center'>
                  <div className='relative mb-6'>
                    <div className='w-20 h-20 bg-gradient-to-br from-orange-100 to-red-200 dark:from-orange-900/40 dark:to-red-900/40 rounded-2xl flex items-center justify-center shadow-lg'>
                      <Radio className='w-10 h-10 text-orange-500 dark:text-orange-400' />
                    </div>
                    {/* 装饰小点 */}
                    <div className='absolute -top-1 -right-1 w-3 h-3 bg-orange-400 rounded-full animate-ping'></div>
                    <div className='absolute -bottom-1 -left-1 w-2 h-2 bg-red-400 rounded-full animate-pulse'></div>
                  </div>
                  <p className='text-base font-semibold text-gray-700 dark:text-gray-300 mb-2'>
                    暂无可用直播源
                  </p>
                  <p className='text-sm text-gray-500 dark:text-gray-400'>
                    请检查网络连接或联系管理员添加直播源
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
