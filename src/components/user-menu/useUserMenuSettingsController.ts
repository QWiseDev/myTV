import { useEffect, useState } from 'react';

import {
  type UserMenuRuntimeConfig,
  type UserMenuSettingsSnapshot,
  buildDefaultUserMenuSettings,
  readUserMenuSettings,
  writeUserMenuSettings,
} from '@/lib/user-menu-settings';

interface RuntimeConfigWindow extends Window {
  RUNTIME_CONFIG?: UserMenuRuntimeConfig;
}

function getRuntimeConfig(): UserMenuRuntimeConfig {
  if (typeof window === 'undefined') {
    return {};
  }

  return (window as RuntimeConfigWindow).RUNTIME_CONFIG || {};
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

export function useUserMenuSettingsController() {
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
  const [enableAutoSkip, setEnableAutoSkip] = useState(false);
  const [enableAutoNextEpisode, setEnableAutoNextEpisode] = useState(true);

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

  useEffect(() => {
    if (typeof window !== 'undefined') {
      applySettingsSnapshot(
        readUserMenuSettings(localStorage, getRuntimeConfig()),
      );
    }
  }, []);

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
    const settings = buildDefaultUserMenuSettings(getRuntimeConfig());

    applySettingsSnapshot(settings);

    if (typeof window !== 'undefined') {
      writeUserMenuSettings(localStorage, settings);
      window.dispatchEvent(new Event('doubanImageProxyChanged'));
    }
  };

  const settings: UserMenuSettingsSnapshot = {
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

  return {
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
    settings,
  };
}
