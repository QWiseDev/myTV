/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-non-null-assertion */

'use client';

import { User } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import { getAuthInfoFromBrowserCookie } from '@/lib/auth';
import { debug } from '@/lib/debug';
import { checkForUpdates, UpdateStatus } from '@/lib/version_check';

import { UserMenuChangePasswordPanel } from './user-menu/UserMenuChangePasswordPanel';
import { UserMenuDropdownPanel } from './user-menu/UserMenuDropdownPanel';
import {
  UserMenuContinueWatchingPanel,
  UserMenuFavoritesPanel,
  UserMenuWatchingUpdatesPanel,
} from './user-menu/UserMenuMediaPanels';
import { UserMenuSettingsPanel } from './user-menu/UserMenuSettingsPanel';
import { useUserMenuContinueWatching } from './user-menu/useUserMenuContinueWatching';
import { useUserMenuFavorites } from './user-menu/useUserMenuFavorites';
import { useUserMenuSettingsController } from './user-menu/useUserMenuSettingsController';
import { useUserMenuWatchingUpdates } from './user-menu/useUserMenuWatchingUpdates';
import { VersionPanel } from './VersionPanel';

interface AuthInfo {
  username?: string;
  role?: 'owner' | 'admin' | 'user';
}

function isAdminRole(role?: string) {
  return role === 'owner' || role === 'admin';
}

function useCloseDropdownOnOutsideMouseDown(
  isOpen: boolean,
  dropdownSelector: string,
  setOpen: (open: boolean) => void,
) {
  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      if (!target.closest(dropdownSelector)) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [dropdownSelector, isOpen, setOpen]);
}

export const UserMenu: React.FC = () => {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const [isVersionPanelOpen, setIsVersionPanelOpen] = useState(false);
  const [isWatchingUpdatesOpen, setIsWatchingUpdatesOpen] = useState(false);
  const [isContinueWatchingOpen, setIsContinueWatchingOpen] = useState(false);
  const [isFavoritesOpen, setIsFavoritesOpen] = useState(false);
  const [authInfo, setAuthInfo] = useState<AuthInfo | null>(null);
  const [storageType] = useState<string>(() => {
    // 🔧 优化：直接从 RUNTIME_CONFIG 读取初始值，避免默认值导致的多次渲染
    if (typeof window !== 'undefined') {
      return (window as any).RUNTIME_CONFIG?.STORAGE_TYPE || 'localstorage';
    }
    return 'localstorage';
  });
  const [mounted, setMounted] = useState(false);

  // Body 滚动锁定 - 使用 overflow 方式避免布局问题
  useEffect(() => {
    if (
      isSettingsOpen ||
      isChangePasswordOpen ||
      isWatchingUpdatesOpen ||
      isContinueWatchingOpen ||
      isFavoritesOpen
    ) {
      const body = document.body;
      const html = document.documentElement;

      // 保存原始样式
      const originalBodyOverflow = body.style.overflow;
      const originalHtmlOverflow = html.style.overflow;

      // 只设置 overflow 来阻止滚动
      body.style.overflow = 'hidden';
      html.style.overflow = 'hidden';

      return () => {
        // 恢复所有原始样式
        body.style.overflow = originalBodyOverflow;
        html.style.overflow = originalHtmlOverflow;
      };
    }
  }, [
    isSettingsOpen,
    isChangePasswordOpen,
    isWatchingUpdatesOpen,
    isContinueWatchingOpen,
    isFavoritesOpen,
  ]);

  // 设置面板下拉框状态
  const [isDoubanDropdownOpen, setIsDoubanDropdownOpen] = useState(false);
  const [isDoubanImageProxyDropdownOpen, setIsDoubanImageProxyDropdownOpen] =
    useState(false);

  // 修改密码相关状态
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState('');

  // 版本检查相关状态
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);
  const [isChecking, setIsChecking] = useState(true);

  // 确保组件已挂载
  useEffect(() => {
    setMounted(true);
  }, []);

  // 获取认证信息
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const auth = getAuthInfoFromBrowserCookie();
      setAuthInfo(auth);
    }
  }, []);

  const {
    handleAggregateToggle,
    handleContinueWatchingMaxProgressChange,
    handleContinueWatchingMinProgressChange,
    handleDoubanDataSourceChange,
    handleDoubanImageProxyTypeChange,
    handleDoubanImageProxyUrlChange,
    handleDoubanProxyUrlChange,
    handleEnableAutoNextEpisodeToggle,
    handleEnableAutoSkipToggle,
    handleEnableContinueWatchingFilterToggle,
    handleFluidSearchToggle,
    handleLiveDirectConnectToggle,
    handleOptimizationToggle,
    handleResetSettings,
    settings: settingsSnapshot,
  } = useUserMenuSettingsController();
  const {
    continueWatchingMaxProgress,
    continueWatchingMinProgress,
    enableContinueWatchingFilter,
  } = settingsSnapshot;

  // 版本检查
  useEffect(() => {
    const checkUpdate = async () => {
      try {
        const status = await checkForUpdates();
        setUpdateStatus(status);
      } catch (error) {
        debug.warn('版本检查失败:', error);
      } finally {
        setIsChecking(false);
      }
    };

    checkUpdate();
  }, []);

  const { hasUnreadUpdates, markWatchingUpdatesViewed, watchingUpdatesState } =
    useUserMenuWatchingUpdates({
      authInfo,
      storageType,
    });
  const { playRecords } = useUserMenuContinueWatching({
    authInfo,
    enableProgressFilter: enableContinueWatchingFilter,
    isOpen: isContinueWatchingOpen,
    maxProgress: continueWatchingMaxProgress,
    minProgress: continueWatchingMinProgress,
    storageType,
  });
  const { favorites } = useUserMenuFavorites({
    authInfo,
    isOpen: isFavoritesOpen,
    storageType,
  });

  // 点击外部区域关闭下拉框
  useCloseDropdownOnOutsideMouseDown(
    isDoubanDropdownOpen,
    '[data-dropdown="douban-datasource"]',
    setIsDoubanDropdownOpen,
  );
  useCloseDropdownOnOutsideMouseDown(
    isDoubanImageProxyDropdownOpen,
    '[data-dropdown="douban-image-proxy"]',
    setIsDoubanImageProxyDropdownOpen,
  );

  const handleMenuClick = async () => {
    const willOpen = !isOpen;
    setIsOpen(willOpen);

    // 🚀 优化：打开菜单时不主动检查追番更新
    // 只从缓存获取数据，避免对所有播放记录调用 /api/detail
    // 追番更新检查只在首页进行
    if (willOpen && authInfo?.username && storageType !== 'localstorage') {
      debug.log('打开菜单：不主动检查追番更新，只从缓存获取');
      // 不主动调用 executeUpdateCheck，让追番更新检查只在首页进行
    }
  };

  const handleCloseMenu = () => {
    setIsOpen(false);
  };

  const handleOpenVersionPanel = () => {
    setIsVersionPanelOpen(true);
    handleCloseMenu();
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error) {
      debug.error('注销请求失败:', error);
    }
    window.location.href = '/';
  };

  const handleAdminPanel = () => {
    router.push('/admin');
  };

  const navigateFromMenu = (path: string) => {
    setIsOpen(false);
    router.push(path);
  };

  const handlePlayStats = () => {
    navigateFromMenu('/play-stats');
  };

  const handleTVBoxConfig = () => {
    navigateFromMenu('/tvbox');
  };

  const handleSourceTest = () => {
    navigateFromMenu('/source-test');
  };

  const handleReleaseCalendar = () => {
    navigateFromMenu('/release-calendar');
  };

  const handleWatchingUpdates = () => {
    setIsOpen(false);
    setIsWatchingUpdatesOpen(true);
    markWatchingUpdatesViewed();
  };

  const handleCloseWatchingUpdates = () => {
    setIsWatchingUpdatesOpen(false);
  };

  const handleContinueWatching = () => {
    setIsOpen(false);
    setIsContinueWatchingOpen(true);
  };

  const handleCloseContinueWatching = () => {
    setIsContinueWatchingOpen(false);
  };

  const handleFavorites = () => {
    setIsOpen(false);
    setIsFavoritesOpen(true);
  };

  const handleCloseFavorites = () => {
    setIsFavoritesOpen(false);
  };

  const resetPasswordForm = () => {
    setNewPassword('');
    setConfirmPassword('');
    setPasswordError('');
  };

  const handleChangePassword = () => {
    setIsOpen(false);
    setIsChangePasswordOpen(true);
    resetPasswordForm();
  };

  const handleCloseChangePassword = () => {
    setIsChangePasswordOpen(false);
    resetPasswordForm();
  };

  const handleSubmitChangePassword = async () => {
    setPasswordError('');

    // 验证密码
    if (!newPassword) {
      setPasswordError('新密码不得为空');
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('两次输入的密码不一致');
      return;
    }

    setPasswordLoading(true);

    try {
      const response = await fetch('/api/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          newPassword,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setPasswordError(data.error || '修改密码失败');
        return;
      }

      // 修改成功，关闭弹窗并登出
      setIsChangePasswordOpen(false);
      await handleLogout();
    } catch (error) {
      setPasswordError('网络错误，请稍后重试');
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleSettings = () => {
    setIsOpen(false);
    setIsSettingsOpen(true);
  };

  const handleCloseSettings = () => {
    setIsSettingsOpen(false);
  };

  const currentRole = authInfo?.role || 'user';
  const isAdminUser = isAdminRole(authInfo?.role);

  // 检查是否显示管理面板按钮
  const showAdminPanel = isAdminUser;

  // 检查是否显示源检测按钮（管理员功能）
  const showSourceTest = isAdminUser;

  // 检查是否显示修改密码按钮
  const showChangePassword =
    authInfo?.role !== 'owner' && storageType !== 'localstorage';

  // 检查是否显示播放统计按钮（所有登录用户，且非localstorage存储）
  const showPlayStats = authInfo?.username && storageType !== 'localstorage';

  // 检查是否显示更新提醒按钮（登录用户且非localstorage存储就显示）
  const showWatchingUpdates =
    authInfo?.username && storageType !== 'localstorage';

  // 计算更新数量（只统计新剧集更新）
  const totalUpdates = watchingUpdatesState.totalUpdates;

  return (
    <>
      <div className='relative'>
        <button
          onClick={handleMenuClick}
          className='relative w-10 h-10 p-2 rounded-full flex items-center justify-center text-gray-600 hover:text-blue-500 dark:text-gray-300 dark:hover:text-blue-400 transition-all duration-300 hover:scale-110 hover:shadow-lg hover:shadow-blue-500/30 dark:hover:shadow-blue-400/30 group'
          aria-label='User Menu'
        >
          {/* 微光背景效果 */}
          <div className='absolute inset-0 rounded-full bg-gradient-to-br from-blue-400/0 to-purple-600/0 group-hover:from-blue-400/20 group-hover:to-purple-600/20 dark:group-hover:from-blue-300/20 dark:group-hover:to-purple-500/20 transition-all duration-300'></div>

          <User className='w-full h-full relative z-10 group-hover:scale-110 transition-transform duration-300' />
        </button>
        {/* 统一更新提醒点：版本更新或剧集更新都显示橙色点 */}
        {(updateStatus === UpdateStatus.HAS_UPDATE ||
          (hasUnreadUpdates && totalUpdates > 0)) && (
          <div className='absolute top-[2px] right-[2px] w-2 h-2 bg-yellow-500 rounded-full animate-pulse shadow-lg shadow-yellow-500/50'></div>
        )}
      </div>

      {/* 使用 Portal 将菜单面板渲染到 document.body */}
      {isOpen &&
        mounted &&
        createPortal(
          <UserMenuDropdownPanel
            currentRole={currentRole}
            favoritesCount={favorites.length}
            hasUnreadUpdates={hasUnreadUpdates}
            isAdminUser={isAdminUser}
            isChecking={isChecking}
            onAdminPanel={handleAdminPanel}
            onChangePassword={handleChangePassword}
            onClose={handleCloseMenu}
            onContinueWatching={handleContinueWatching}
            onFavorites={handleFavorites}
            onLogout={handleLogout}
            onOpenVersionPanel={handleOpenVersionPanel}
            onPlayStats={handlePlayStats}
            onReleaseCalendar={handleReleaseCalendar}
            onSettings={handleSettings}
            onSourceTest={handleSourceTest}
            onTVBoxConfig={handleTVBoxConfig}
            onWatchingUpdates={handleWatchingUpdates}
            playRecordsCount={playRecords.length}
            showAdminPanel={showAdminPanel}
            showChangePassword={showChangePassword}
            showPlayStats={Boolean(showPlayStats)}
            showSourceTest={showSourceTest}
            showWatchingUpdates={Boolean(showWatchingUpdates)}
            storageType={storageType}
            totalUpdates={totalUpdates}
            updateStatus={updateStatus}
            username={authInfo?.username}
          />,
          document.body,
        )}

      {/* 使用 Portal 将设置面板渲染到 document.body */}
      {isSettingsOpen &&
        mounted &&
        createPortal(
          <UserMenuSettingsPanel
            isDoubanDataSourceDropdownOpen={isDoubanDropdownOpen}
            isDoubanImageProxyDropdownOpen={isDoubanImageProxyDropdownOpen}
            onAutoNextEpisodeChange={handleEnableAutoNextEpisodeToggle}
            onAutoSkipChange={handleEnableAutoSkipToggle}
            onClose={handleCloseSettings}
            onContinueWatchingFilterChange={
              handleEnableContinueWatchingFilterToggle
            }
            onContinueWatchingMaxProgressChange={
              handleContinueWatchingMaxProgressChange
            }
            onContinueWatchingMinProgressChange={
              handleContinueWatchingMinProgressChange
            }
            onDefaultAggregateSearchChange={handleAggregateToggle}
            onDoubanDataSourceChange={handleDoubanDataSourceChange}
            onDoubanDataSourceDropdownOpenChange={setIsDoubanDropdownOpen}
            onDoubanImageProxyDropdownOpenChange={
              setIsDoubanImageProxyDropdownOpen
            }
            onDoubanImageProxyTypeChange={handleDoubanImageProxyTypeChange}
            onDoubanImageProxyUrlChange={handleDoubanImageProxyUrlChange}
            onDoubanProxyUrlChange={handleDoubanProxyUrlChange}
            onFluidSearchChange={handleFluidSearchToggle}
            onLiveDirectConnectChange={handleLiveDirectConnectToggle}
            onOptimizationChange={handleOptimizationToggle}
            onReset={handleResetSettings}
            settings={settingsSnapshot}
          />,
          document.body,
        )}

      {/* 使用 Portal 将修改密码面板渲染到 document.body */}
      {isChangePasswordOpen &&
        mounted &&
        createPortal(
          <UserMenuChangePasswordPanel
            confirmPassword={confirmPassword}
            error={passwordError}
            isLoading={passwordLoading}
            newPassword={newPassword}
            onClose={handleCloseChangePassword}
            onConfirmPasswordChange={setConfirmPassword}
            onNewPasswordChange={setNewPassword}
            onSubmit={handleSubmitChangePassword}
          />,
          document.body,
        )}

      {/* 使用 Portal 将更新提醒面板渲染到 document.body */}
      {isWatchingUpdatesOpen &&
        mounted &&
        createPortal(
          <UserMenuWatchingUpdatesPanel
            onClose={handleCloseWatchingUpdates}
            state={watchingUpdatesState}
          />,
          document.body,
        )}

      {/* 使用 Portal 将继续观看面板渲染到 document.body */}
      {isContinueWatchingOpen &&
        mounted &&
        createPortal(
          <UserMenuContinueWatchingPanel
            enableProgressFilter={enableContinueWatchingFilter}
            maxProgress={continueWatchingMaxProgress}
            minProgress={continueWatchingMinProgress}
            onClose={handleCloseContinueWatching}
            records={playRecords}
            watchingUpdatesState={watchingUpdatesState}
          />,
          document.body,
        )}

      {/* 使用 Portal 将我的收藏面板渲染到 document.body */}
      {isFavoritesOpen &&
        mounted &&
        createPortal(
          <UserMenuFavoritesPanel
            favorites={favorites}
            onClose={handleCloseFavorites}
          />,
          document.body,
        )}

      {/* 版本面板 */}
      <VersionPanel
        isOpen={isVersionPanelOpen}
        onClose={() => setIsVersionPanelOpen(false)}
      />
    </>
  );
};
