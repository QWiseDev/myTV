import {
  BarChart3,
  Bell,
  Calendar,
  Heart,
  KeyRound,
  LogOut,
  PlayCircle,
  Search,
  Settings,
  Shield,
  Tv,
} from 'lucide-react';

import { CURRENT_VERSION } from '@/lib/version';
import { UpdateStatus } from '@/lib/version_check';

type UserRole = 'owner' | 'admin' | 'user';

interface UserMenuDropdownPanelProps {
  currentRole: UserRole;
  favoritesCount: number;
  hasUnreadUpdates: boolean;
  isAdminUser: boolean;
  isChecking: boolean;
  onAdminPanel: () => void;
  onChangePassword: () => void;
  onClose: () => void;
  onContinueWatching: () => void;
  onFavorites: () => void;
  onLogout: () => void;
  onOpenVersionPanel: () => void;
  onPlayStats: () => void;
  onReleaseCalendar: () => void;
  onSettings: () => void;
  onSourceTest: () => void;
  onTVBoxConfig: () => void;
  onWatchingUpdates: () => void;
  playRecordsCount: number;
  showAdminPanel: boolean;
  showChangePassword: boolean;
  showPlayStats: boolean;
  showSourceTest: boolean;
  showWatchingUpdates: boolean;
  storageType: string;
  totalUpdates: number;
  updateStatus: UpdateStatus | null;
  username?: string;
}

function getRoleText(role: UserRole) {
  switch (role) {
    case 'owner':
      return '站长';
    case 'admin':
      return '管理员';
    case 'user':
      return '用户';
  }
}

function getRoleBadgeClassName(role: UserRole) {
  switch (role) {
    case 'owner':
      return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300';
    case 'admin':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
    default:
      return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
  }
}

export function UserMenuDropdownPanel({
  currentRole,
  favoritesCount,
  hasUnreadUpdates,
  isAdminUser,
  isChecking,
  onAdminPanel,
  onChangePassword,
  onClose,
  onContinueWatching,
  onFavorites,
  onLogout,
  onOpenVersionPanel,
  onPlayStats,
  onReleaseCalendar,
  onSettings,
  onSourceTest,
  onTVBoxConfig,
  onWatchingUpdates,
  playRecordsCount,
  showAdminPanel,
  showChangePassword,
  showPlayStats,
  showSourceTest,
  showWatchingUpdates,
  storageType,
  totalUpdates,
  updateStatus,
  username,
}: UserMenuDropdownPanelProps) {
  return (
    <>
      <div
        className='fixed inset-0 bg-transparent z-[1000]'
        onClick={onClose}
      />

      <div className='fixed top-14 right-4 w-56 bg-white dark:bg-gray-900 rounded-lg shadow-xl z-[1001] border border-gray-200/50 dark:border-gray-700/50 overflow-hidden select-none'>
        <div className='px-3 py-2.5 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-gray-50 to-gray-100/50 dark:from-gray-800 dark:to-gray-800/50'>
          <div className='space-y-1'>
            <div className='flex items-center justify-between'>
              <span className='text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider'>
                当前用户
              </span>
              <span
                className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium ${getRoleBadgeClassName(
                  currentRole,
                )}`}
              >
                {getRoleText(currentRole)}
              </span>
            </div>
            <div className='flex items-center justify-between'>
              <div className='font-semibold text-gray-900 dark:text-gray-100 text-sm truncate'>
                {username || 'default'}
              </div>
              <div className='text-[10px] text-gray-400 dark:text-gray-500'>
                数据存储：
                {storageType === 'localstorage' ? '本地' : storageType}
              </div>
            </div>
          </div>
        </div>

        <div className='py-1'>
          <button
            onClick={onSettings}
            className='w-full px-3 py-2 text-left flex items-center gap-2.5 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-sm'
          >
            <Settings className='w-4 h-4 text-gray-500 dark:text-gray-400' />
            <span className='font-medium'>设置</span>
          </button>

          {showWatchingUpdates && (
            <button
              onClick={onWatchingUpdates}
              className='w-full px-3 py-2 text-left flex items-center gap-2.5 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-sm relative'
            >
              <Bell className='w-4 h-4 text-gray-500 dark:text-gray-400' />
              <span className='font-medium'>更新提醒</span>
              {hasUnreadUpdates && totalUpdates > 0 && (
                <div className='ml-auto flex items-center gap-1'>
                  <span className='inline-flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-red-500 rounded-full'>
                    {totalUpdates > 99 ? '99+' : totalUpdates}
                  </span>
                </div>
              )}
            </button>
          )}

          {showWatchingUpdates && (
            <button
              onClick={onContinueWatching}
              className='w-full px-3 py-2 text-left flex items-center gap-2.5 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-sm relative'
            >
              <PlayCircle className='w-4 h-4 text-gray-500 dark:text-gray-400' />
              <span className='font-medium'>继续观看</span>
              {playRecordsCount > 0 && (
                <span className='ml-auto text-xs text-gray-400'>
                  {playRecordsCount}
                </span>
              )}
            </button>
          )}

          {showWatchingUpdates && (
            <button
              onClick={onFavorites}
              className='w-full px-3 py-2 text-left flex items-center gap-2.5 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-sm relative'
            >
              <Heart className='w-4 h-4 text-gray-500 dark:text-gray-400' />
              <span className='font-medium'>我的收藏</span>
              {favoritesCount > 0 && (
                <span className='ml-auto text-xs text-gray-400'>
                  {favoritesCount}
                </span>
              )}
            </button>
          )}

          {showAdminPanel && (
            <button
              onClick={onAdminPanel}
              className='w-full px-3 py-2 text-left flex items-center gap-2.5 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-sm'
            >
              <Shield className='w-4 h-4 text-gray-500 dark:text-gray-400' />
              <span className='font-medium'>管理面板</span>
            </button>
          )}

          {showSourceTest && (
            <button
              onClick={onSourceTest}
              className='w-full px-3 py-2 text-left flex items-center gap-2.5 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-sm'
            >
              <Search className='w-4 h-4 text-gray-500 dark:text-gray-400' />
              <span className='font-medium'>源检测</span>
            </button>
          )}

          {showPlayStats && (
            <button
              onClick={onPlayStats}
              className='w-full px-3 py-2 text-left flex items-center gap-2.5 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-sm'
            >
              <BarChart3 className='w-4 h-4 text-gray-500 dark:text-gray-400' />
              <span className='font-medium'>
                {isAdminUser ? '播放统计' : '个人统计'}
              </span>
            </button>
          )}

          <button
            onClick={onReleaseCalendar}
            className='w-full px-3 py-2 text-left flex items-center gap-2.5 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-sm'
          >
            <Calendar className='w-4 h-4 text-gray-500 dark:text-gray-400' />
            <span className='font-medium'>上映日程</span>
          </button>

          <button
            onClick={onTVBoxConfig}
            className='w-full px-3 py-2 text-left flex items-center gap-2.5 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-sm'
          >
            <Tv className='w-4 h-4 text-gray-500 dark:text-gray-400' />
            <span className='font-medium'>TVBox 配置</span>
          </button>

          {showChangePassword && (
            <button
              onClick={onChangePassword}
              className='w-full px-3 py-2 text-left flex items-center gap-2.5 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-sm'
            >
              <KeyRound className='w-4 h-4 text-gray-500 dark:text-gray-400' />
              <span className='font-medium'>修改密码</span>
            </button>
          )}

          <div className='my-1 border-t border-gray-200 dark:border-gray-700'></div>

          <button
            onClick={onLogout}
            className='w-full px-3 py-2 text-left flex items-center gap-2.5 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-sm'
          >
            <LogOut className='w-4 h-4' />
            <span className='font-medium'>登出</span>
          </button>

          <div className='my-1 border-t border-gray-200 dark:border-gray-700'></div>

          <button
            onClick={onOpenVersionPanel}
            className='w-full px-3 py-2 text-center flex items-center justify-center text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors text-xs'
          >
            <div className='flex items-center gap-1'>
              <span className='font-mono'>v{CURRENT_VERSION}</span>
              {!isChecking &&
                updateStatus &&
                updateStatus !== UpdateStatus.FETCH_FAILED && (
                  <div
                    className={`w-2 h-2 rounded-full -translate-y-2 ${
                      updateStatus === UpdateStatus.HAS_UPDATE
                        ? 'bg-yellow-500'
                        : updateStatus === UpdateStatus.NO_UPDATE
                          ? 'bg-green-400'
                          : ''
                    }`}
                  ></div>
                )}
            </div>
          </button>
        </div>
      </div>
    </>
  );
}
