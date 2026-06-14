'use client';

import { ChevronUp } from 'lucide-react';
import Image from 'next/image';

import { PlayRecord, ReleaseCalendarItem } from '@/lib/types';
import { WatchingUpdate } from '@/lib/watching-updates';

import VideoCard from '@/components/VideoCard';

import { PlayStatsResult } from '@/app/api/admin/play-stats/route';

import {
  formatDate,
  formatDateTime,
  formatLoginDisplay,
  formatTime,
  getProgressPercentage,
} from './playStatsShared';

interface AdminStatsPanelProps {
  activeTab: 'admin' | 'personal';
  onTabChange: (tab: 'admin' | 'personal') => void;
  onRefresh: () => void;
  loading: boolean;
  error: string | null;
  statsData: PlayStatsResult;
  userStats: any;
  watchingUpdates: WatchingUpdate | null;
  expandedUsers: Set<string>;
  toggleUserExpanded: (username: string) => void;
  handlePlayRecord: (record: PlayRecord) => void;
  upcomingReleases: ReleaseCalendarItem[];
  upcomingLoading: boolean;
  upcomingInitialized: boolean;
  onNavigateReleaseCalendar: () => void;
  showBackToTop: boolean;
  scrollToTop: () => void;
}

const AdminStatsPanel = ({
  activeTab,
  onTabChange,
  onRefresh,
  loading,
  error,
  statsData,
  userStats,
  watchingUpdates,
  expandedUsers,
  toggleUserExpanded,
  handlePlayRecord,
  upcomingReleases,
  upcomingLoading,
  upcomingInitialized,
  onNavigateReleaseCalendar,
  showBackToTop,
  scrollToTop,
}: AdminStatsPanelProps) => {
  return (
    <>
      <div className='max-w-7xl mx-auto px-4 py-8'>
        {/* 页面标题和描述 */}
        <div className='mb-6'>
          <h1 className='text-3xl font-bold text-gray-900 dark:text-white'>
            播放统计
          </h1>
          <p className='text-gray-600 dark:text-gray-400 mt-2'>
            {activeTab === 'admin'
              ? '查看全站播放数据和趋势分析'
              : '查看您的个人播放记录和统计'}
          </p>
        </div>

        {/* Tab切换和刷新按钮 */}
        <div className='flex justify-between items-end mb-8'>
          {/* Tab 切换 */}
          <div className='border-b border-gray-200 dark:border-gray-700'>
            <nav className='-mb-px flex space-x-8'>
              <button
                onClick={() => onTabChange('admin')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'admin'
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                }`}
              >
                全站统计
              </button>
              <button
                onClick={() => onTabChange('personal')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'personal'
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                }`}
              >
                我的统计
              </button>
            </nav>
          </div>

          {/* 刷新按钮 */}
          <button
            onClick={onRefresh}
            disabled={loading}
            className='px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm rounded-lg transition-colors flex items-center space-x-2 mb-0.5'
          >
            <svg
              className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`}
              fill='none'
              stroke='currentColor'
              viewBox='0 0 24 24'
            >
              <path
                strokeLinecap='round'
                strokeLinejoin='round'
                strokeWidth='2'
                d='M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15'
              />
            </svg>
            <span>{loading ? '刷新中...' : '刷新数据'}</span>
          </button>
        </div>

        {/* 错误提示 */}
        {error && (
          <div className='mb-8 p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800'>
            <div className='flex items-center space-x-3'>
              <div className='text-red-600 dark:text-red-400'>
                <svg
                  className='w-5 h-5'
                  fill='none'
                  stroke='currentColor'
                  viewBox='0 0 24 24'
                >
                  <path
                    strokeLinecap='round'
                    strokeLinejoin='round'
                    strokeWidth='2'
                    d='M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z'
                  />
                </svg>
              </div>
              <div>
                <h4 className='text-sm font-medium text-red-800 dark:text-red-300'>
                  获取统计数据失败
                </h4>
                <p className='text-red-700 dark:text-red-400 text-sm mt-1'>
                  {error}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Tab 内容 */}
        {activeTab === 'admin' ? (
          /* 全站统计内容 */
          <>
            {/* 全站统计概览 */}
            <div className='grid grid-cols-1 md:grid-cols-2 xl:grid-cols-7 gap-4 mb-8'>
              <div className='p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800'>
                <div className='text-2xl font-bold text-blue-800 dark:text-blue-300'>
                  {statsData.totalUsers}
                </div>
                <div className='text-sm text-blue-600 dark:text-blue-400'>
                  总用户数
                </div>
              </div>
              <div className='p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800'>
                <div className='text-2xl font-bold text-green-800 dark:text-green-300'>
                  {formatTime(statsData.totalWatchTime)}
                </div>
                <div className='text-sm text-green-600 dark:text-green-400'>
                  总观看时长
                </div>
              </div>
              <div className='p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800'>
                <div className='text-2xl font-bold text-purple-800 dark:text-purple-300'>
                  {statsData.totalPlays}
                </div>
                <div className='text-sm text-purple-600 dark:text-purple-400'>
                  总播放次数
                </div>
              </div>
              <div className='p-4 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-800'>
                <div className='text-2xl font-bold text-orange-800 dark:text-orange-300'>
                  {formatTime(statsData.avgWatchTimePerUser)}
                </div>
                <div className='text-sm text-orange-600 dark:text-orange-400'>
                  人均观看时长
                </div>
              </div>
              <div className='p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg border border-indigo-200 dark:border-indigo-800'>
                <div className='text-2xl font-bold text-indigo-800 dark:text-indigo-300'>
                  {Math.round(statsData.avgPlaysPerUser)}
                </div>
                <div className='text-sm text-indigo-600 dark:text-indigo-400'>
                  人均播放次数
                </div>
              </div>
              <div className='p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800'>
                <div className='text-2xl font-bold text-red-800 dark:text-red-300'>
                  {statsData.registrationStats.todayNewUsers}
                </div>
                <div className='text-sm text-red-600 dark:text-red-400'>
                  今日新增用户
                </div>
              </div>
              <div className='p-4 bg-cyan-50 dark:bg-cyan-900/20 rounded-lg border border-cyan-200 dark:border-cyan-800'>
                <div className='text-2xl font-bold text-cyan-800 dark:text-cyan-300'>
                  {statsData.activeUsers.daily}
                </div>
                <div className='text-sm text-cyan-600 dark:text-cyan-400'>
                  日活跃用户
                </div>
              </div>
            </div>

            {/* 图表区域 */}
            <div className='grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6 mb-8'>
              {/* 近7天播放趋势 */}
              <div className='p-6 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700'>
                <h3 className='text-lg font-semibold text-gray-900 dark:text-white mb-4'>
                  近7天播放趋势
                </h3>
                <div className='space-y-3'>
                  {statsData.dailyStats.map((stat) => (
                    <div
                      key={stat.date}
                      className='flex items-center justify-between'
                    >
                      <span className='text-sm text-gray-600 dark:text-gray-400'>
                        {formatDate(stat.date)}
                      </span>
                      <div className='flex items-center space-x-4 text-sm'>
                        <span className='text-green-600 dark:text-green-400'>
                          {formatTime(stat.watchTime)}
                        </span>
                        <span className='text-purple-600 dark:text-purple-400'>
                          {stat.plays}次
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 近7天注册趋势 */}
              <div className='p-6 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700'>
                <h3 className='text-lg font-semibold text-gray-900 dark:text-white mb-4'>
                  近7天注册趋势
                </h3>
                <div className='space-y-3'>
                  {statsData.registrationStats.registrationTrend.map((stat) => (
                    <div
                      key={stat.date}
                      className='flex items-center justify-between'
                    >
                      <span className='text-sm text-gray-600 dark:text-gray-400'>
                        {formatDate(stat.date)}
                      </span>
                      <div className='flex items-center space-x-2'>
                        <span className='text-sm text-blue-600 dark:text-blue-400'>
                          {stat.newUsers} 人
                        </span>
                        {stat.newUsers > 0 && (
                          <div className='w-2 h-2 bg-blue-500 rounded-full'></div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 用户活跃度统计 */}
              <div className='p-6 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700'>
                <h3 className='text-lg font-semibold text-gray-900 dark:text-white mb-4'>
                  用户活跃度统计
                </h3>
                <div className='space-y-4'>
                  <div className='flex items-center justify-between'>
                    <span className='text-sm text-gray-600 dark:text-gray-400'>
                      日活跃用户
                    </span>
                    <span className='text-lg font-semibold text-green-600 dark:text-green-400'>
                      {statsData.activeUsers.daily}
                    </span>
                  </div>
                  <div className='flex items-center justify-between'>
                    <span className='text-sm text-gray-600 dark:text-gray-400'>
                      周活跃用户
                    </span>
                    <span className='text-lg font-semibold text-blue-600 dark:text-blue-400'>
                      {statsData.activeUsers.weekly}
                    </span>
                  </div>
                  <div className='flex items-center justify-between'>
                    <span className='text-sm text-gray-600 dark:text-gray-400'>
                      月活跃用户
                    </span>
                    <span className='text-lg font-semibold text-purple-600 dark:text-purple-400'>
                      {statsData.activeUsers.monthly}
                    </span>
                  </div>
                  <div className='mt-4 pt-4 border-t border-gray-200 dark:border-gray-600'>
                    <div className='text-xs text-gray-500 dark:text-gray-400'>
                      活跃度 = 最近有播放记录的用户
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 热门来源统计 */}
            <div className='grid grid-cols-1 lg:grid-cols-1 gap-6 mb-8'>
              <div className='p-6 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700'>
                <h3 className='text-lg font-semibold text-gray-900 dark:text-white mb-4'>
                  热门视频来源
                </h3>
                <div className='space-y-3'>
                  {statsData.topSources.map((source, index) => (
                    <div
                      key={source.source}
                      className='flex items-center justify-between'
                    >
                      <div className='flex items-center space-x-3'>
                        <span className='w-6 h-6 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-300 rounded-full flex items-center justify-center text-xs font-bold'>
                          {index + 1}
                        </span>
                        <span className='text-sm text-gray-900 dark:text-white'>
                          {source.source}
                        </span>
                      </div>
                      <span className='text-sm text-gray-600 dark:text-gray-400'>
                        {source.count} 次
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* 用户播放统计 */}
            <div>
              <h3 className='text-xl font-semibold text-gray-900 dark:text-white mb-6'>
                用户播放统计
              </h3>
              <div className='space-y-4'>
                {statsData.userStats.map((userStat) => (
                  <div
                    key={userStat.username}
                    className='border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-gray-800'
                  >
                    {/* 用户概览行 */}
                    <div
                      className='p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors'
                      onClick={() => toggleUserExpanded(userStat.username)}
                    >
                      <div className='flex items-center justify-between'>
                        <div className='flex items-center space-x-4'>
                          <div className='flex-shrink-0'>
                            <div className='w-10 h-10 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center'>
                              <span className='text-sm font-medium text-blue-600 dark:text-blue-400'>
                                {userStat.username.charAt(0).toUpperCase()}
                              </span>
                            </div>
                          </div>
                          <div>
                            <h5 className='text-sm font-medium text-gray-900 dark:text-gray-100'>
                              {userStat.username}
                            </h5>
                            <p className='text-xs text-gray-500 dark:text-gray-400'>
                              最后播放:{' '}
                              {userStat.lastPlayTime
                                ? formatDateTime(userStat.lastPlayTime)
                                : '从未播放'}
                            </p>
                            <p className='text-xs text-gray-500 dark:text-gray-400'>
                              注册天数: {userStat.registrationDays} 天
                            </p>
                            <p className='text-xs text-gray-500 dark:text-gray-400'>
                              最后登入:{' '}
                              {userStat.lastLoginTime !== userStat.createdAt
                                ? formatDateTime(userStat.lastLoginTime)
                                : '注册时'}
                            </p>
                            <div className='text-xs text-gray-500 dark:text-gray-400'>
                              {(() => {
                                const loginCount = userStat.loginCount || 0;
                                const loginDisplay =
                                  formatLoginDisplay(loginCount);

                                return (
                                  <div className='space-y-1'>
                                    <div className='flex items-center gap-1.5'>
                                      <span className='text-base flex-shrink-0'>
                                        {loginDisplay.level.icon}
                                      </span>
                                      <span className='font-medium text-gray-700 dark:text-gray-300 text-xs leading-tight'>
                                        {loginDisplay.level.name}
                                      </span>
                                    </div>
                                    <div className='text-xs opacity-60'>
                                      {loginCount === 0
                                        ? '尚未登录'
                                        : `${loginDisplay.displayCount}次登录`}
                                    </div>
                                  </div>
                                );
                              })()}
                            </div>
                            {userStat.mostWatchedSource && (
                              <p className='text-xs text-gray-500 dark:text-gray-400'>
                                常用来源: {userStat.mostWatchedSource}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className='flex items-center space-x-6'>
                          <div className='text-right'>
                            <div className='text-sm font-medium text-gray-900 dark:text-gray-100'>
                              {formatTime(userStat.totalWatchTime)}
                            </div>
                            <div className='text-xs text-gray-500 dark:text-gray-400'>
                              总观看时长
                            </div>
                          </div>
                          <div className='text-right'>
                            <div className='text-sm font-medium text-gray-900 dark:text-gray-100'>
                              {userStat.totalPlays}
                            </div>
                            <div className='text-xs text-gray-500 dark:text-gray-400'>
                              播放次数
                            </div>
                          </div>
                          <div className='text-right'>
                            <div className='text-sm font-medium text-gray-900 dark:text-gray-100'>
                              {formatTime(userStat.avgWatchTime)}
                            </div>
                            <div className='text-xs text-gray-500 dark:text-gray-400'>
                              平均时长
                            </div>
                          </div>
                          <div className='flex-shrink-0'>
                            <svg
                              className={`w-5 h-5 text-gray-400 transition-transform ${
                                expandedUsers.has(userStat.username)
                                  ? 'rotate-180'
                                  : ''
                              }`}
                              fill='none'
                              stroke='currentColor'
                              viewBox='0 0 24 24'
                            >
                              <path
                                strokeLinecap='round'
                                strokeLinejoin='round'
                                strokeWidth='2'
                                d='M19 9l-7 7-7-7'
                              />
                            </svg>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* 展开的播放记录详情 */}
                    {expandedUsers.has(userStat.username) && (
                      <div className='p-4 bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700'>
                        {userStat.recentRecords.length > 0 ? (
                          <>
                            <h6 className='text-sm font-medium text-gray-700 dark:text-gray-300 mb-4'>
                              最近播放记录 (最多显示10条)
                            </h6>
                            <div className='grid grid-cols-1 lg:grid-cols-2 gap-4'>
                              {userStat.recentRecords.map((record: any) => (
                                <div
                                  key={record.title + record.save_time}
                                  className='flex items-center space-x-4 p-3 bg-white dark:bg-gray-800 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors'
                                  onClick={() => handlePlayRecord(record)}
                                >
                                  <div className='flex-shrink-0 w-12 h-16 bg-gray-200 dark:bg-gray-700 rounded overflow-hidden'>
                                    {record.cover ? (
                                      <Image
                                        src={record.cover}
                                        alt={record.title}
                                        width={48}
                                        height={64}
                                        className='w-full h-full object-cover'
                                        onError={(e) => {
                                          (
                                            e.target as HTMLImageElement
                                          ).style.display = 'none';
                                        }}
                                      />
                                    ) : (
                                      <div className='w-full h-full flex items-center justify-center text-gray-400 dark:text-gray-500'>
                                        <svg
                                          className='w-6 h-6'
                                          fill='none'
                                          stroke='currentColor'
                                          viewBox='0 0 24 24'
                                        >
                                          <path
                                            strokeLinecap='round'
                                            strokeLinejoin='round'
                                            strokeWidth='2'
                                            d='M7 4V2a1 1 0 011-1h8a1 1 0 011 1v2m0 0V1a1 1 0 011-1h2a1 1 0 011 1v18a1 1 0 01-1 1H4a1 1 0 01-1-1V1a1 1 0 011-1h2a1 1 0 011 1v3'
                                          />
                                        </svg>
                                      </div>
                                    )}
                                  </div>
                                  <div className='flex-1 min-w-0'>
                                    <h6 className='text-sm font-medium text-gray-900 dark:text-gray-100 truncate'>
                                      {record.title}
                                    </h6>
                                    <p className='text-xs text-gray-500 dark:text-gray-400 mt-1'>
                                      来源: {record.source_name} | 年份:{' '}
                                      {record.year}
                                    </p>
                                    <p className='text-xs text-gray-500 dark:text-gray-400'>
                                      第 {record.index} 集 / 共{' '}
                                      {record.total_episodes} 集
                                    </p>
                                    <div className='mt-2'>
                                      <div className='flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-1'>
                                        <span>播放进度</span>
                                        <span>
                                          {formatTime(record.play_time)} /{' '}
                                          {formatTime(record.total_time)} (
                                          {getProgressPercentage(
                                            record.play_time,
                                            record.total_time,
                                          )}
                                          %)
                                        </span>
                                      </div>
                                      <div className='w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5'>
                                        <div
                                          className='bg-blue-500 h-1.5 rounded-full transition-all duration-300'
                                          style={{
                                            width: `${getProgressPercentage(
                                              record.play_time,
                                              record.total_time,
                                            )}%`,
                                          }}
                                        ></div>
                                      </div>
                                    </div>
                                  </div>
                                  <div className='flex-shrink-0 text-right'>
                                    <div className='text-xs text-gray-500 dark:text-gray-400'>
                                      {formatDateTime(record.save_time)}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </>
                        ) : (
                          <div className='text-center py-8 text-gray-500 dark:text-gray-400'>
                            <svg
                              className='w-12 h-12 mx-auto mb-4 text-gray-300 dark:text-gray-600'
                              fill='none'
                              stroke='currentColor'
                              viewBox='0 0 24 24'
                            >
                              <path
                                strokeLinecap='round'
                                strokeLinejoin='round'
                                strokeWidth='2'
                                d='M9.172 16.172a4 4 0 015.656 0M9 12h6m-6-4h6m2 5.291A7.962 7.962 0 0012 15c-2.239 0-4.236.18-6.101.532C4.294 15.661 4 16.28 4 16.917V19a2 2 0 002 2h12a2 2 0 002-2v-2.083c0-.636-.293-1.256-.899-1.385A7.962 7.962 0 0012 15z'
                              />
                            </svg>
                            <p>该用户暂无播放记录</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : (
          /* 个人统计内容 */
          <>
            {/* 个人统计概览 */}
            <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4 mb-8'>
              <div className='p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800'>
                <div className='text-2xl font-bold text-blue-800 dark:text-blue-300'>
                  {formatTime(userStats.totalWatchTime)}
                </div>
                <div className='text-sm text-blue-600 dark:text-blue-400'>
                  总观看时长
                </div>
              </div>
              <div className='p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800'>
                <div className='text-2xl font-bold text-green-800 dark:text-green-300'>
                  {userStats.registrationDays || 0}
                </div>
                <div className='text-sm text-green-600 dark:text-green-400'>
                  注册天数
                </div>
              </div>
              <div className='p-4 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-800'>
                <div className='text-2xl font-bold text-orange-800 dark:text-orange-300'>
                  {userStats.loginDays || 0}
                </div>
                <div className='text-sm text-orange-600 dark:text-orange-400'>
                  登录天数
                </div>
              </div>
              <div className='p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800'>
                <div className='text-2xl font-bold text-purple-800 dark:text-purple-300'>
                  {userStats.totalMovies || userStats.totalPlays || 0}
                </div>
                <div className='text-sm text-purple-600 dark:text-purple-400'>
                  观看影片
                </div>
              </div>
              <div className='p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg border border-indigo-200 dark:border-indigo-800'>
                <div className='text-2xl font-bold text-indigo-800 dark:text-indigo-300'>
                  {userStats.totalPlays}
                </div>
                <div className='text-sm text-indigo-600 dark:text-indigo-400'>
                  总播放次数
                </div>
              </div>
              <div className='p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800'>
                <div className='text-2xl font-bold text-yellow-800 dark:text-yellow-300'>
                  {formatTime(userStats.avgWatchTime)}
                </div>
                <div className='text-sm text-yellow-600 dark:text-yellow-400'>
                  平均观看时长
                </div>
              </div>
              <div className='p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800'>
                {(() => {
                  const loginCount = userStats.loginCount || 0;
                  const loginDisplay = formatLoginDisplay(loginCount);

                  return (
                    <div className='space-y-2'>
                      <div className='flex items-center gap-2'>
                        <span className='text-2xl flex-shrink-0'>
                          {loginDisplay.level.icon}
                        </span>
                        <div className='flex-1 min-w-0'>
                          <div className='text-base font-bold text-red-800 dark:text-red-300 leading-tight'>
                            {loginDisplay.level.name}
                          </div>
                        </div>
                      </div>
                      <div className='text-sm text-red-600 dark:text-red-400 leading-relaxed'>
                        {loginDisplay.level.description}
                      </div>
                      <div className='text-xs text-red-500/70 dark:text-red-400/70'>
                        {loginCount === 0
                          ? '尚未登录'
                          : `已登录 ${loginDisplay.displayCount} 次`}
                      </div>
                    </div>
                  );
                })()}
              </div>
              <div className='p-4 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-800'>
                <div className='text-2xl font-bold text-orange-800 dark:text-orange-300'>
                  {userStats.mostWatchedSource || '暂无'}
                </div>
                <div className='text-sm text-orange-600 dark:text-orange-400'>
                  常用来源
                </div>
              </div>
              {/* 新集数更新 */}
              <div
                className={`p-4 rounded-lg border transition-all ${
                  (watchingUpdates?.updatedCount || 0) > 0
                    ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                    : 'bg-gray-50 dark:bg-gray-900/20 border-gray-200 dark:border-gray-800'
                }`}
              >
                <div
                  className={`text-2xl font-bold ${
                    (watchingUpdates?.updatedCount || 0) > 0
                      ? 'text-red-800 dark:text-red-300'
                      : 'text-gray-800 dark:text-gray-300'
                  }`}
                >
                  {watchingUpdates?.updatedCount || 0}
                </div>
                <div
                  className={`text-sm ${
                    (watchingUpdates?.updatedCount || 0) > 0
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-gray-600 dark:text-gray-400'
                  }`}
                >
                  新集数更新
                </div>
                {(watchingUpdates?.updatedCount || 0) > 0 && (
                  <div className='text-xs text-red-500 dark:text-red-400 mt-1'>
                    有新集数发布！
                  </div>
                )}
              </div>

              {/* 继续观看提醒 */}
              <div
                className={`p-4 rounded-lg border transition-all ${
                  (watchingUpdates?.continueWatchingCount || 0) > 0
                    ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
                    : 'bg-gray-50 dark:bg-gray-900/20 border-gray-200 dark:border-gray-800'
                }`}
              >
                <div
                  className={`text-2xl font-bold ${
                    (watchingUpdates?.continueWatchingCount || 0) > 0
                      ? 'text-blue-800 dark:text-blue-300'
                      : 'text-gray-800 dark:text-gray-300'
                  }`}
                >
                  {watchingUpdates?.continueWatchingCount || 0}
                </div>
                <div
                  className={`text-sm ${
                    (watchingUpdates?.continueWatchingCount || 0) > 0
                      ? 'text-blue-600 dark:text-blue-400'
                      : 'text-gray-600 dark:text-gray-400'
                  }`}
                >
                  继续观看
                </div>
                {(watchingUpdates?.continueWatchingCount || 0) > 0 && (
                  <div className='text-xs text-blue-500 dark:text-blue-400 mt-1'>
                    有剧集待续看！
                  </div>
                )}
              </div>
            </div>

            {/* 即将上映卡片 */}
            {(upcomingInitialized || upcomingLoading) && (
              <div className='mb-8'>
                <div className='bg-gradient-to-r from-purple-500 to-pink-500 rounded-lg p-6 text-white shadow-lg'>
                  <div className='flex items-center justify-between mb-4'>
                    <div>
                      <h3 className='text-lg font-bold flex items-center gap-2'>
                        📅 即将上映
                      </h3>
                      <p className='text-purple-100 text-sm mt-1'>
                        {upcomingLoading
                          ? '正在获取最新内容...'
                          : `未来两周将有 ${upcomingReleases.length} 部新内容上线`}
                      </p>
                    </div>
                    <button
                      onClick={() => onNavigateReleaseCalendar()}
                      className='bg-white/20 hover:bg-white/30 px-4 py-2 rounded-lg text-sm transition-colors flex items-center gap-2'
                    >
                      <span>查看全部</span>
                      <svg
                        className='w-4 h-4'
                        fill='none'
                        stroke='currentColor'
                        viewBox='0 0 24 24'
                      >
                        <path
                          strokeLinecap='round'
                          strokeLinejoin='round'
                          strokeWidth='2'
                          d='M9 5l7 7-7 7'
                        />
                      </svg>
                    </button>
                  </div>

                  {/* 横向滚动的发布项目 */}
                  <div className='flex space-x-4 overflow-x-auto pb-2 scrollbar-hide'>
                    {upcomingLoading ? (
                      // Loading skeleton
                      Array.from({ length: 3 }).map((_, index) => (
                        <div
                          key={`loading-${index}`}
                          className='min-w-[140px] bg-white/10 backdrop-blur-sm rounded-lg p-3 border border-white/20 animate-pulse'
                        >
                          <div className='h-4 bg-white/20 rounded mb-2'></div>
                          <div className='h-3 bg-white/20 rounded mb-2 w-3/4'></div>
                          <div className='h-3 bg-white/20 rounded mb-2 w-1/2'></div>
                          <div className='h-3 bg-white/20 rounded w-2/3'></div>
                        </div>
                      ))
                    ) : (
                      <div className='flex flex-col gap-6'>
                        {/* 电影部分 */}
                        {upcomingReleases.filter(
                          (item) => item.type === 'movie',
                        ).length > 0 && (
                          <div className='w-full'>
                            <div className='text-sm font-medium text-purple-100 mb-3 flex items-center gap-2 border-b border-white/20 pb-2'>
                              🎬 电影
                            </div>
                            <div className='flex space-x-3 overflow-x-auto pb-1 w-full'>
                              {upcomingReleases
                                .filter((item) => item.type === 'movie')
                                .slice(0, 7)
                                .map((item) => (
                                  <div
                                    key={item.id}
                                    className='min-w-[140px] bg-white/10 backdrop-blur-sm rounded-lg p-3 border border-white/20 flex-shrink-0'
                                  >
                                    <div
                                      className='text-sm font-medium mb-1 line-clamp-2'
                                      title={item.title}
                                    >
                                      {item.title}
                                    </div>
                                    <div className='text-xs text-purple-200 mb-1'>
                                      {new Date(
                                        item.releaseDate,
                                      ).toLocaleDateString('zh-CN', {
                                        month: 'short',
                                        day: 'numeric',
                                      })}
                                    </div>
                                    <div className='text-xs text-purple-200 truncate'>
                                      {item.region}
                                    </div>
                                  </div>
                                ))}
                            </div>
                          </div>
                        )}

                        {/* 电视剧部分 */}
                        {upcomingReleases.filter((item) => item.type === 'tv')
                          .length > 0 && (
                          <div className='w-full'>
                            <div className='text-sm font-medium text-purple-100 mb-3 flex items-center gap-2 border-b border-white/20 pb-2'>
                              📺 电视剧
                            </div>
                            <div className='flex space-x-3 overflow-x-auto pb-1 w-full'>
                              {upcomingReleases
                                .filter((item) => item.type === 'tv')
                                .slice(0, 7)
                                .map((item) => (
                                  <div
                                    key={item.id}
                                    className='min-w-[140px] bg-white/10 backdrop-blur-sm rounded-lg p-3 border border-white/20 flex-shrink-0'
                                  >
                                    <div
                                      className='text-sm font-medium mb-1 line-clamp-2'
                                      title={item.title}
                                    >
                                      {item.title}
                                    </div>
                                    <div className='text-xs text-purple-200 mb-1'>
                                      {new Date(
                                        item.releaseDate,
                                      ).toLocaleDateString('zh-CN', {
                                        month: 'short',
                                        day: 'numeric',
                                      })}
                                    </div>
                                    <div className='text-xs text-purple-200 truncate'>
                                      {item.region}
                                    </div>
                                  </div>
                                ))}
                            </div>
                          </div>
                        )}

                        {/* 空状态提示 */}
                        {upcomingReleases.length === 0 &&
                          !upcomingLoading &&
                          upcomingInitialized && (
                            <div className='text-center py-6'>
                              <div className='text-purple-100 text-sm mb-2'>
                                📅
                              </div>
                              <div className='text-purple-100 text-sm'>
                                暂无即将上映的内容
                              </div>
                              <div className='text-purple-200 text-xs mt-1'>
                                数据获取可能失败，请尝试刷新
                              </div>
                            </div>
                          )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* 有新集数的剧集 */}
            {watchingUpdates &&
              watchingUpdates.updatedSeries.filter(
                (series) => series.hasNewEpisode,
              ).length > 0 && (
                <div className='mb-8'>
                  <div className='flex items-center gap-2 mb-4'>
                    <h2 className='text-xl font-semibold text-gray-900 dark:text-white'>
                      有新集数
                    </h2>
                    <div className='flex items-center gap-1'>
                      <div className='w-2 h-2 bg-red-500 rounded-full animate-pulse'></div>
                      <span className='text-sm text-red-500 font-medium'>
                        {
                          watchingUpdates.updatedSeries.filter(
                            (series) => series.hasNewEpisode,
                          ).length
                        }
                        部剧集有更新
                      </span>
                    </div>
                  </div>

                  {/* 移动端网格布局 */}
                  <div className='sm:hidden'>
                    <div className='grid grid-cols-2 gap-x-4 gap-y-8 pt-4 pb-6'>
                      {watchingUpdates.updatedSeries
                        .filter((series) => series.hasNewEpisode)
                        .map((series, index) => (
                          <div
                            key={`new-${series.title}_${series.year}_${index}`}
                            className='relative w-full group/card'
                          >
                            <div className='relative group-hover/card:z-[500] transition-all duration-300 ease-in-out'>
                              <VideoCard
                                title={series.title}
                                poster={series.cover || ''}
                                year={series.year}
                                douban_id={series.douban_id}
                                from='playrecord'
                                progress={0}
                                currentEpisode={series.currentEpisode}
                                episodes={series.totalEpisodes}
                                source={series.sourceKey}
                                id={series.videoId}
                                onDelete={undefined}
                                remarks={series.remarks}
                              />
                              {/* 新集数提示光环效果 */}
                              <div className='absolute inset-0 rounded-lg ring-2 ring-red-400 ring-opacity-50 animate-pulse pointer-events-none z-[501] transition-transform duration-300 ease-in-out group-hover/card:scale-[1.05]'></div>
                            </div>
                            {/* 新集数徽章 */}
                            <div className='absolute -top-2 -right-2 bg-gradient-to-r from-red-500 to-pink-500 text-white text-xs px-2 py-1 rounded-full shadow-lg animate-bounce z-[502]'>
                              +{series.newEpisodes}集
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>

                  {/* 桌面端网格布局 */}
                  <div className='hidden sm:block'>
                    <div className='grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-x-6 gap-y-10 pt-6 pb-8'>
                      {watchingUpdates.updatedSeries
                        .filter((series) => series.hasNewEpisode)
                        .map((series, index) => (
                          <div
                            key={`new-${series.title}_${series.year}_${index}`}
                            className='relative w-full group/card'
                          >
                            <div className='relative group-hover/card:z-[500] transition-all duration-300 ease-in-out'>
                              <VideoCard
                                title={series.title}
                                poster={series.cover || ''}
                                year={series.year}
                                douban_id={series.douban_id}
                                from='playrecord'
                                progress={0}
                                currentEpisode={series.currentEpisode}
                                episodes={series.totalEpisodes}
                                source={series.sourceKey}
                                id={series.videoId}
                                onDelete={undefined}
                                remarks={series.remarks}
                              />
                              {/* 新集数提示光环效果 */}
                              <div className='absolute inset-0 rounded-lg ring-2 ring-red-400 ring-opacity-50 animate-pulse pointer-events-none z-[501] transition-transform duration-300 ease-in-out group-hover/card:scale-[1.05]'></div>
                            </div>
                            {/* 新集数徽章 */}
                            <div className='absolute -top-2 -right-2 bg-gradient-to-r from-red-500 to-pink-500 text-white text-xs px-2 py-1 rounded-full shadow-lg animate-bounce z-[502]'>
                              +{series.newEpisodes}集
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                </div>
              )}

            {/* 继续观看的剧集 */}
            {watchingUpdates &&
              watchingUpdates.updatedSeries.filter(
                (series) => series.hasContinueWatching && !series.hasNewEpisode,
              ).length > 0 && (
                <div className='mb-8'>
                  <div className='flex items-center gap-2 mb-4'>
                    <h2 className='text-xl font-semibold text-gray-900 dark:text-white'>
                      继续观看
                    </h2>
                    <div className='flex items-center gap-1'>
                      <div className='w-2 h-2 bg-blue-500 rounded-full animate-pulse'></div>
                      <span className='text-sm text-blue-500 font-medium'>
                        {
                          watchingUpdates.updatedSeries.filter(
                            (series) =>
                              series.hasContinueWatching &&
                              !series.hasNewEpisode,
                          ).length
                        }
                        部剧集待续看
                      </span>
                    </div>
                  </div>

                  {/* 移动端网格布局 */}
                  <div className='sm:hidden'>
                    <div className='grid grid-cols-2 gap-x-4 gap-y-8 pt-4 pb-6'>
                      {watchingUpdates.updatedSeries
                        .filter(
                          (series) =>
                            series.hasContinueWatching && !series.hasNewEpisode,
                        )
                        .map((series, index) => (
                          <div
                            key={`continue-${series.title}_${series.year}_${index}`}
                            className='relative w-full group/card'
                          >
                            <div className='relative group-hover/card:z-[500] transition-all duration-300 ease-in-out'>
                              <VideoCard
                                title={series.title}
                                poster={series.cover || ''}
                                year={series.year}
                                douban_id={series.douban_id}
                                from='playrecord'
                                progress={0}
                                currentEpisode={series.currentEpisode}
                                episodes={series.totalEpisodes}
                                source={series.sourceKey}
                                id={series.videoId}
                                onDelete={undefined}
                                remarks={series.remarks}
                              />
                              {/* 继续观看提示光环效果 */}
                              <div className='absolute inset-0 rounded-lg ring-2 ring-blue-400 ring-opacity-50 animate-pulse pointer-events-none z-[501] transition-transform duration-300 ease-in-out group-hover/card:scale-[1.05]'></div>
                            </div>
                            {/* 继续观看徽章 */}
                            <div className='absolute -top-2 -right-2 bg-gradient-to-r from-blue-500 to-cyan-500 text-white text-xs px-2 py-1 rounded-full shadow-lg animate-pulse z-[502]'>
                              继续看
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>

                  {/* 桌面端网格布局 */}
                  <div className='hidden sm:block'>
                    <div className='grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-x-6 gap-y-10 pt-6 pb-8'>
                      {watchingUpdates.updatedSeries
                        .filter(
                          (series) =>
                            series.hasContinueWatching && !series.hasNewEpisode,
                        )
                        .map((series, index) => (
                          <div
                            key={`continue-${series.title}_${series.year}_${index}`}
                            className='relative w-full group/card'
                          >
                            <div className='relative group-hover/card:z-[500] transition-all duration-300 ease-in-out'>
                              <VideoCard
                                title={series.title}
                                poster={series.cover || ''}
                                year={series.year}
                                douban_id={series.douban_id}
                                from='playrecord'
                                progress={0}
                                currentEpisode={series.currentEpisode}
                                episodes={series.totalEpisodes}
                                source={series.sourceKey}
                                id={series.videoId}
                                onDelete={undefined}
                                remarks={series.remarks}
                              />
                              {/* 继续观看提示光环效果 */}
                              <div className='absolute inset-0 rounded-lg ring-2 ring-blue-400 ring-opacity-50 animate-pulse pointer-events-none z-[501] transition-transform duration-300 ease-in-out group-hover/card:scale-[1.05]'></div>
                            </div>
                            {/* 继续观看徽章 */}
                            <div className='absolute -top-2 -right-2 bg-gradient-to-r from-blue-500 to-cyan-500 text-white text-xs px-2 py-1 rounded-full shadow-lg animate-pulse z-[502]'>
                              继续看
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                </div>
              )}

            {/* 最近播放记录 */}
            <div>
              <h3 className='text-xl font-semibold text-gray-900 dark:text-white mb-6'>
                最近播放记录
              </h3>
              {userStats.recentRecords && userStats.recentRecords.length > 0 ? (
                <div className='grid grid-cols-1 lg:grid-cols-2 gap-4'>
                  {userStats.recentRecords.map((record: PlayRecord) => (
                    <div
                      key={record.title + record.save_time}
                      className='flex items-center space-x-4 p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors'
                      onClick={() => handlePlayRecord(record)}
                    >
                      <div className='flex-shrink-0 w-16 h-20 bg-gray-200 dark:bg-gray-700 rounded overflow-hidden'>
                        {record.cover ? (
                          <Image
                            src={record.cover}
                            alt={record.title}
                            width={64}
                            height={80}
                            className='w-full h-full object-cover'
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display =
                                'none';
                            }}
                          />
                        ) : (
                          <div className='w-full h-full flex items-center justify-center text-gray-400 dark:text-gray-500'>
                            <svg
                              className='w-8 h-8'
                              fill='none'
                              stroke='currentColor'
                              viewBox='0 0 24 24'
                            >
                              <path
                                strokeLinecap='round'
                                strokeLinejoin='round'
                                strokeWidth='2'
                                d='M7 4V2a1 1 0 011-1h8a1 1 0 011 1v2m0 0V1a1 1 0 011-1h2a1 1 0 011 1v18a1 1 0 01-1 1H4a1 1 0 01-1-1V1a1 1 0 011-1h2a1 1 0 011 1v3'
                              />
                            </svg>
                          </div>
                        )}
                      </div>
                      <div className='flex-1 min-w-0'>
                        <h6 className='text-sm font-medium text-gray-900 dark:text-gray-100 truncate mb-1'>
                          {record.title}
                        </h6>
                        <p className='text-xs text-gray-500 dark:text-gray-400 mb-2'>
                          来源: {record.source_name} | 年份: {record.year}
                        </p>
                        <p className='text-xs text-gray-500 dark:text-gray-400 mb-2'>
                          第 {record.index} 集 / 共 {record.total_episodes} 集
                        </p>
                        <div className='mt-2'>
                          <div className='flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-1'>
                            <span>播放进度</span>
                            <span>
                              {formatTime(record.play_time)} /{' '}
                              {formatTime(record.total_time)} (
                              {getProgressPercentage(
                                record.play_time,
                                record.total_time,
                              )}
                              %)
                            </span>
                          </div>
                          <div className='w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5'>
                            <div
                              className='bg-blue-500 h-1.5 rounded-full transition-all duration-300'
                              style={{
                                width: `${getProgressPercentage(
                                  record.play_time,
                                  record.total_time,
                                )}%`,
                              }}
                            ></div>
                          </div>
                        </div>
                        <div className='text-xs text-gray-500 dark:text-gray-400 mt-2'>
                          {formatDateTime(record.save_time)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className='text-center py-12 text-gray-500 dark:text-gray-400'>
                  <svg
                    className='w-16 h-16 mx-auto mb-4 text-gray-300 dark:text-gray-600'
                    fill='none'
                    stroke='currentColor'
                    viewBox='0 0 24 24'
                  >
                    <path
                      strokeLinecap='round'
                      strokeLinejoin='round'
                      strokeWidth='2'
                      d='M9.172 16.172a4 4 0 015.656 0M9 12h6m-6-4h6m2 5.291A7.962 7.962 0 0012 15c-2.239 0-4.236.18-6.101.532C4.294 15.661 4 16.28 4 16.917V19a2 2 0 002 2h12a2 2 0 002-2v-2.083c0-.636-.293-1.256-.899-1.385A7.962 7.962 0 0012 15z'
                    />
                  </svg>
                  <p>暂无播放记录</p>
                </div>
              )}
            </div>
          </>
        )}
      </div>
      <button
        onClick={scrollToTop}
        className={`fixed bottom-20 md:bottom-6 right-6 z-[500] w-12 h-12 bg-green-500/90 hover:bg-green-500 text-white rounded-full shadow-lg backdrop-blur-sm transition-all duration-300 ease-in-out flex items-center justify-center group ${
          showBackToTop
            ? 'opacity-100 translate-y-0 pointer-events-auto'
            : 'opacity-0 translate-y-4 pointer-events-none'
        }`}
        aria-label='返回顶部'
      >
        <ChevronUp className='w-6 h-6 transition-transform group-hover:scale-110' />
      </button>
    </>
  );
};

export default AdminStatsPanel;
