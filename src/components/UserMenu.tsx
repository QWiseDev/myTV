/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-non-null-assertion */

'use client';

import { User } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { getAuthInfoFromBrowserCookie } from '@/lib/auth';
import { getAllPlayRecords } from '@/lib/db.client';
import { debug } from '@/lib/debug';
import {
  type UserMenuFavoriteRecord,
  buildUserMenuFavoriteRecords,
} from '@/lib/favorite-items';
import type { Favorite, PlayRecord } from '@/lib/types';
import {
  type UserMenuContinueWatchingRecord,
  buildUserMenuContinueWatchingRecords,
} from '@/lib/user-menu-continue-watching';
import {
  type UserMenuSettingsSnapshot,
  buildDefaultUserMenuSettings,
  readUserMenuSettings,
  writeUserMenuSettings,
} from '@/lib/user-menu-settings';
import { buildUserMenuWatchingUpdatesState } from '@/lib/user-menu-watching-updates';
import { checkForUpdates, UpdateStatus } from '@/lib/version_check';
import {
  type WatchingUpdate,
  getCachedWatchingUpdates,
  getDetailedWatchingUpdates,
  subscribeToWatchingUpdatesEvent,
} from '@/lib/watching-updates';

import { UserMenuChangePasswordPanel } from './user-menu/UserMenuChangePasswordPanel';
import { UserMenuDropdownPanel } from './user-menu/UserMenuDropdownPanel';
import {
  UserMenuContinueWatchingPanel,
  UserMenuFavoritesPanel,
  UserMenuWatchingUpdatesPanel,
} from './user-menu/UserMenuMediaPanels';
import { UserMenuSettingsPanel } from './user-menu/UserMenuSettingsPanel';
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

function persistUserMenuSetting(
  key: string,
  value: string,
  eventName?: string,
) {
  if (typeof window === 'undefined') {
    return;
  }

  localStorage.setItem(key, value);
  if (eventName) {
    window.dispatchEvent(new Event(eventName));
  }
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
  const [watchingUpdates, setWatchingUpdates] = useState<WatchingUpdate | null>(
    null,
  );
  const [playRecords, setPlayRecords] = useState<
    UserMenuContinueWatchingRecord[]
  >([]);
  const [favorites, setFavorites] = useState<UserMenuFavoriteRecord[]>([]);
  const [hasUnreadUpdates, setHasUnreadUpdates] = useState(false);

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

  // 设置相关状态
  const [defaultAggregateSearch, setDefaultAggregateSearch] = useState(true);
  const [doubanProxyUrl, setDoubanProxyUrl] = useState('');
  const [enableOptimization, setEnableOptimization] = useState(false);
  const [fluidSearch, setFluidSearch] = useState(true);
  const [liveDirectConnect, setLiveDirectConnect] = useState(false);
  const [doubanDataSource, setDoubanDataSource] = useState('direct');
  const [doubanImageProxyType, setDoubanImageProxyType] = useState('direct');
  const [doubanImageProxyUrl, setDoubanImageProxyUrl] = useState('');
  const [continueWatchingMinProgress, setContinueWatchingMinProgress] =
    useState(5);
  const [continueWatchingMaxProgress, setContinueWatchingMaxProgress] =
    useState(100);
  const [enableContinueWatchingFilter, setEnableContinueWatchingFilter] =
    useState(false);
  const [isDoubanDropdownOpen, setIsDoubanDropdownOpen] = useState(false);
  const [isDoubanImageProxyDropdownOpen, setIsDoubanImageProxyDropdownOpen] =
    useState(false);
  // 跳过片头片尾相关设置
  const [enableAutoSkip, setEnableAutoSkip] = useState(false);
  const [enableAutoNextEpisode, setEnableAutoNextEpisode] = useState(true);

  // 修改密码相关状态
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState('');

  // 版本检查相关状态
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);
  const [isChecking, setIsChecking] = useState(true);

  const applySettingsSnapshot = (settings: UserMenuSettingsSnapshot) => {
    setDefaultAggregateSearch(settings.defaultAggregateSearch);
    setDoubanDataSource(settings.doubanDataSource);
    setDoubanProxyUrl(settings.doubanProxyUrl);
    setDoubanImageProxyType(settings.doubanImageProxyType);
    setDoubanImageProxyUrl(settings.doubanImageProxyUrl);
    setEnableOptimization(settings.enableOptimization);
    setFluidSearch(settings.fluidSearch);
    setLiveDirectConnect(settings.liveDirectConnect);
    setContinueWatchingMinProgress(settings.continueWatchingMinProgress);
    setContinueWatchingMaxProgress(settings.continueWatchingMaxProgress);
    setEnableContinueWatchingFilter(settings.enableContinueWatchingFilter);
    setEnableAutoSkip(settings.enableAutoSkip);
    setEnableAutoNextEpisode(settings.enableAutoNextEpisode);
  };

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

  // 从 localStorage 读取设置
  useEffect(() => {
    if (typeof window !== 'undefined') {
      applySettingsSnapshot(
        readUserMenuSettings(
          localStorage,
          (window as any).RUNTIME_CONFIG || {},
        ),
      );
    }
  }, []);

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

  // 获取观看更新信息 - 初始化日志
  useEffect(() => {
    // 🔧 优化：只在条件不满足时输出日志
    if (
      typeof window === 'undefined' ||
      !authInfo?.username ||
      storageType === 'localstorage'
    ) {
      debug.log('watching-updates 条件不满足，跳过加载');
    }
  }, [authInfo?.username, storageType]); // 只在关键依赖变化时检查

  // 获取观看更新信息 - 主逻辑
  useEffect(() => {
    if (
      typeof window === 'undefined' ||
      !authInfo?.username ||
      storageType === 'localstorage'
    ) {
      return;
    }

    debug.log('开始加载 watching-updates 数据...');

    const updateWatchingUpdates = () => {
      const updates = getDetailedWatchingUpdates();
      debug.log('getDetailedWatchingUpdates 返回:', updates);
      setWatchingUpdates(updates);

      // 检测是否有新更新（只检查新剧集更新，不包括继续观看）
      if (updates && (updates.updatedCount || 0) > 0) {
        const lastViewed = parseInt(
          localStorage.getItem('watchingUpdatesLastViewed') || '0',
        );
        const currentTime = Date.now();

        // 如果从未查看过，或者距离上次查看超过1分钟，认为有新更新
        const hasNewUpdates =
          lastViewed === 0 || currentTime - lastViewed > 60000;
        setHasUnreadUpdates(hasNewUpdates);
      } else {
        setHasUnreadUpdates(false);
      }
    };

    // 先尝试从缓存加载
    const cachedUpdates = getCachedWatchingUpdates();
    if (cachedUpdates) {
      debug.log('发现缓存数据，先加载缓存');
      updateWatchingUpdates();
    }

    // 订阅更新事件
    const unsubscribe = subscribeToWatchingUpdatesEvent(
      (_hasUpdates, _updatedCount, invalidated) => {
        if (invalidated) return;

        debug.log('收到 watching-updates 事件，更新数据...');
        // 收到事件时也从缓存获取，不主动触发检查
        const updates = getDetailedWatchingUpdates();
        setWatchingUpdates(updates);
      },
    );

    // 清理函数
    return () => {
      unsubscribe();
    };
  }, [authInfo, storageType]);

  // 加载播放记录（仅在继续观看面板展开时触发）
  useEffect(() => {
    if (
      typeof window === 'undefined' ||
      !authInfo?.username ||
      storageType === 'localstorage' ||
      !isContinueWatchingOpen
    ) {
      return undefined;
    }

    let isActive = true;
    let refreshTimer: NodeJS.Timeout | null = null;

    const updateContinueWatchingRecords = (
      records: Record<string, PlayRecord>,
    ) => {
      setPlayRecords(
        buildUserMenuContinueWatchingRecords(records, {
          enableProgressFilter: enableContinueWatchingFilter,
          maxProgress: continueWatchingMaxProgress,
          minProgress: continueWatchingMinProgress,
        }),
      );
    };

    const loadPlayRecords = async () => {
      try {
        const records = await getAllPlayRecords();
        if (!isActive) return;

        updateContinueWatchingRecords(records);
      } catch (error) {
        debug.error('加载播放记录失败:', error);
      }
    };

    loadPlayRecords();

    // 监听播放记录更新事件（修复删除记录后页面不立即更新的问题）
    const handlePlayRecordsUpdate = () => {
      debug.log('UserMenu: 播放记录更新，重新加载继续观看列表');
      loadPlayRecords();
    };

    // 监听播放记录更新事件
    window.addEventListener('playRecordsUpdated', handlePlayRecordsUpdate);

    // 与 ContinueWatching 组件保持一致，监听 watching-updates 事件
    const unsubscribeWatchingUpdates = subscribeToWatchingUpdatesEvent(
      (_hasUpdates, _updatedCount, invalidated) => {
        if (invalidated) return;

        debug.log('UserMenu: 收到watching-updates事件');

        // 🚀 优化：移除强制刷新播放记录缓存，避免频繁调用 /api/detail
        // 缓存系统已经有30分钟间隔，足够保证数据及时性
        const updates = getDetailedWatchingUpdates();
        if (updates && updates.hasUpdates && updates.updatedCount > 0) {
          debug.log('UserMenu: 检测到新集数更新，使用现有缓存（30分钟间隔）');

          // 短暂延迟后重新获取播放记录，确保缓存已刷新
          if (refreshTimer) {
            clearTimeout(refreshTimer);
          }
          refreshTimer = setTimeout(async () => {
            const freshRecords = await getAllPlayRecords();
            if (!isActive) return;

            updateContinueWatchingRecords(freshRecords);
          }, 100);
        }
      },
    );

    return () => {
      isActive = false;
      if (refreshTimer) {
        clearTimeout(refreshTimer);
      }
      window.removeEventListener('playRecordsUpdated', handlePlayRecordsUpdate);
      unsubscribeWatchingUpdates(); // 🔥 清理watching-updates订阅
    };
  }, [
    authInfo,
    storageType,
    enableContinueWatchingFilter,
    continueWatchingMinProgress,
    continueWatchingMaxProgress,
    isContinueWatchingOpen,
  ]);

  // 加载收藏数据（仅在收藏面板展开时触发）
  useEffect(() => {
    if (
      typeof window === 'undefined' ||
      !authInfo?.username ||
      storageType === 'localstorage' ||
      !isFavoritesOpen
    ) {
      return undefined;
    }

    let isActive = true;

    const loadFavorites = async () => {
      try {
        const response = await fetch('/api/favorites');
        if (!response.ok || !isActive) return;

        const favoritesData = (await response.json()) as Record<
          string,
          Favorite
        >;
        if (!isActive) return;

        setFavorites(buildUserMenuFavoriteRecords(favoritesData));
      } catch (error) {
        debug.error('加载收藏失败:', error);
      }
    };

    loadFavorites();

    // 监听收藏更新事件（修复删除收藏后页面不立即更新的问题）
    const handleFavoritesUpdate = () => {
      debug.log('UserMenu: 收藏更新，重新加载收藏列表');
      loadFavorites();
    };

    // 监听收藏更新事件
    window.addEventListener('favoritesUpdated', handleFavoritesUpdate);

    return () => {
      isActive = false;
      window.removeEventListener('favoritesUpdated', handleFavoritesUpdate);
    };
  }, [authInfo, storageType, isFavoritesOpen]);

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
    // 标记为已读
    setHasUnreadUpdates(false);
    const currentTime = Date.now();
    localStorage.setItem('watchingUpdatesLastViewed', currentTime.toString());
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

  // 设置相关的处理函数
  const handleAggregateToggle = (value: boolean) => {
    setDefaultAggregateSearch(value);
    persistUserMenuSetting('defaultAggregateSearch', JSON.stringify(value));
  };

  const handleDoubanProxyUrlChange = (value: string) => {
    setDoubanProxyUrl(value);
    persistUserMenuSetting('doubanProxyUrl', value);
  };

  const handleOptimizationToggle = (value: boolean) => {
    setEnableOptimization(value);
    persistUserMenuSetting('enableOptimization', JSON.stringify(value));
  };

  const handleFluidSearchToggle = (value: boolean) => {
    setFluidSearch(value);
    persistUserMenuSetting('fluidSearch', JSON.stringify(value));
  };

  const handleLiveDirectConnectToggle = (value: boolean) => {
    setLiveDirectConnect(value);
    persistUserMenuSetting('liveDirectConnect', JSON.stringify(value));
  };

  const handleContinueWatchingMinProgressChange = (value: number) => {
    setContinueWatchingMinProgress(value);
    persistUserMenuSetting('continueWatchingMinProgress', value.toString());
  };

  const handleContinueWatchingMaxProgressChange = (value: number) => {
    setContinueWatchingMaxProgress(value);
    persistUserMenuSetting('continueWatchingMaxProgress', value.toString());
  };

  const handleEnableContinueWatchingFilterToggle = (value: boolean) => {
    setEnableContinueWatchingFilter(value);
    persistUserMenuSetting(
      'enableContinueWatchingFilter',
      JSON.stringify(value),
    );
  };

  const handleEnableAutoSkipToggle = (value: boolean) => {
    setEnableAutoSkip(value);
    persistUserMenuSetting(
      'enableAutoSkip',
      JSON.stringify(value),
      'localStorageChanged',
    );
  };

  const handleEnableAutoNextEpisodeToggle = (value: boolean) => {
    setEnableAutoNextEpisode(value);
    persistUserMenuSetting(
      'enableAutoNextEpisode',
      JSON.stringify(value),
      'localStorageChanged',
    );
  };

  const handleDoubanDataSourceChange = (value: string) => {
    setDoubanDataSource(value);
    persistUserMenuSetting('doubanDataSource', value);
  };

  const handleDoubanImageProxyTypeChange = (value: string) => {
    setDoubanImageProxyType(value);
    persistUserMenuSetting(
      'doubanImageProxyType',
      value,
      'doubanImageProxyChanged',
    );
  };

  const handleDoubanImageProxyUrlChange = (value: string) => {
    setDoubanImageProxyUrl(value);
    persistUserMenuSetting(
      'doubanImageProxyUrl',
      value,
      'doubanImageProxyChanged',
    );
  };

  const handleResetSettings = () => {
    const settings = buildDefaultUserMenuSettings(
      typeof window !== 'undefined' ? (window as any).RUNTIME_CONFIG || {} : {},
    );

    applySettingsSnapshot(settings);

    if (typeof window !== 'undefined') {
      writeUserMenuSettings(localStorage, settings);
      window.dispatchEvent(new Event('doubanImageProxyChanged'));
    }
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

  const watchingUpdatesState = useMemo(
    () => buildUserMenuWatchingUpdatesState(watchingUpdates),
    [watchingUpdates],
  );

  // 检查是否有实际更新（用于显示红点）- 只检查新剧集更新
  const hasActualUpdates = watchingUpdatesState.hasActualUpdates;

  // 计算更新数量（只统计新剧集更新）
  const totalUpdates = watchingUpdatesState.totalUpdates;

  const settingsSnapshot: UserMenuSettingsSnapshot = {
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
  };

  // 🔧 优化：减少调试日志输出频率，只在关键状态变化时输出
  const debugLoggedRef = useRef<string>('');
  useEffect(() => {
    const currentState = JSON.stringify({
      username: authInfo?.username,
      storageType,
      showWatchingUpdates,
      hasActualUpdates,
      totalUpdates,
      watchingUpdatesVersion: watchingUpdates?.updatedSeries
        ? Object.keys(watchingUpdates.updatedSeries).length
        : 0,
    });

    // 只在状态真正变化时输出日志
    if (currentState !== debugLoggedRef.current) {
      debugLoggedRef.current = currentState;
      debug.log('UserMenu 更新提醒调试:', {
        username: authInfo?.username,
        storageType,
        showWatchingUpdates,
        hasActualUpdates,
        totalUpdates,
        watchingUpdatesVersion: watchingUpdates?.updatedSeries
          ? Object.keys(watchingUpdates.updatedSeries).length
          : 0,
      });
    }
  }, [
    authInfo?.username,
    storageType,
    showWatchingUpdates,
    hasActualUpdates,
    totalUpdates,
    watchingUpdates?.updatedSeries,
  ]);

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
