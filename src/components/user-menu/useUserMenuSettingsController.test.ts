import { act, renderHook } from '@testing-library/react';

import { useUserMenuSettingsController } from './useUserMenuSettingsController';

interface RuntimeConfigWindow extends Window {
  RUNTIME_CONFIG?: {
    DOUBAN_IMAGE_PROXY?: string;
    DOUBAN_IMAGE_PROXY_TYPE?: string;
    DOUBAN_PROXY?: string;
    DOUBAN_PROXY_TYPE?: string;
    FLUID_SEARCH?: boolean;
  };
}

const runtimeWindow = window as RuntimeConfigWindow;
const originalRuntimeConfig = runtimeWindow.RUNTIME_CONFIG;

function readStoredSettings() {
  return {
    continueWatchingMaxProgress: localStorage.getItem(
      'continueWatchingMaxProgress',
    ),
    continueWatchingMinProgress: localStorage.getItem(
      'continueWatchingMinProgress',
    ),
    defaultAggregateSearch: localStorage.getItem('defaultAggregateSearch'),
    doubanDataSource: localStorage.getItem('doubanDataSource'),
    doubanImageProxyType: localStorage.getItem('doubanImageProxyType'),
    doubanImageProxyUrl: localStorage.getItem('doubanImageProxyUrl'),
    doubanProxyUrl: localStorage.getItem('doubanProxyUrl'),
    enableAutoNextEpisode: localStorage.getItem('enableAutoNextEpisode'),
    enableAutoSkip: localStorage.getItem('enableAutoSkip'),
    enableContinueWatchingFilter: localStorage.getItem(
      'enableContinueWatchingFilter',
    ),
    enableOptimization: localStorage.getItem('enableOptimization'),
    fluidSearch: localStorage.getItem('fluidSearch'),
    liveDirectConnect: localStorage.getItem('liveDirectConnect'),
  };
}

describe('useUserMenuSettingsController', () => {
  beforeEach(() => {
    localStorage.clear();
    runtimeWindow.RUNTIME_CONFIG = {};
  });

  afterEach(() => {
    runtimeWindow.RUNTIME_CONFIG = originalRuntimeConfig;
    jest.restoreAllMocks();
  });

  it('hydrates the 13 settings from storage and runtime defaults', () => {
    runtimeWindow.RUNTIME_CONFIG = {
      DOUBAN_IMAGE_PROXY: 'https://runtime-image.example',
      DOUBAN_IMAGE_PROXY_TYPE: 'server',
      DOUBAN_PROXY: 'https://runtime-proxy.example',
      DOUBAN_PROXY_TYPE: 'custom',
      FLUID_SEARCH: false,
    };
    localStorage.setItem('continueWatchingMinProgress', '15');
    localStorage.setItem('enableAutoSkip', 'true');

    const { result } = renderHook(() => useUserMenuSettingsController());

    expect(result.current.settings).toEqual({
      continueWatchingMaxProgress: 100,
      continueWatchingMinProgress: 15,
      defaultAggregateSearch: true,
      doubanDataSource: 'custom',
      doubanImageProxyType: 'server',
      doubanImageProxyUrl: 'https://runtime-image.example',
      doubanProxyUrl: 'https://runtime-proxy.example',
      enableAutoNextEpisode: true,
      enableAutoSkip: true,
      enableContinueWatchingFilter: false,
      enableOptimization: false,
      fluidSearch: false,
      liveDirectConnect: false,
    });
  });

  it('persists every explicit command with the existing serialization and events', () => {
    const localStorageEventValues: Array<[string | null, string | null]> = [];
    const imageProxyEventValues: Array<[string | null, string | null]> = [];
    const localStorageChanged = jest.fn(() => {
      localStorageEventValues.push([
        localStorage.getItem('enableAutoSkip'),
        localStorage.getItem('enableAutoNextEpisode'),
      ]);
    });
    const doubanImageProxyChanged = jest.fn(() => {
      imageProxyEventValues.push([
        localStorage.getItem('doubanImageProxyType'),
        localStorage.getItem('doubanImageProxyUrl'),
      ]);
    });
    window.addEventListener('localStorageChanged', localStorageChanged);
    window.addEventListener('doubanImageProxyChanged', doubanImageProxyChanged);
    const { result } = renderHook(() => useUserMenuSettingsController());
    const setItem = jest.spyOn(Storage.prototype, 'setItem');

    act(() => {
      result.current.handleAggregateToggle(false);
      result.current.handleDoubanProxyUrlChange('https://proxy.example');
      result.current.handleOptimizationToggle(true);
      result.current.handleFluidSearchToggle(false);
      result.current.handleLiveDirectConnectToggle(true);
      result.current.handleContinueWatchingMinProgressChange(10);
      result.current.handleContinueWatchingMaxProgressChange(90);
      result.current.handleEnableContinueWatchingFilterToggle(true);
      result.current.handleEnableAutoSkipToggle(true);
      result.current.handleEnableAutoNextEpisodeToggle(false);
      result.current.handleDoubanDataSourceChange('custom');
      result.current.handleDoubanImageProxyTypeChange('server');
      result.current.handleDoubanImageProxyUrlChange('https://image.example');
    });

    expect(result.current.settings).toEqual({
      continueWatchingMaxProgress: 90,
      continueWatchingMinProgress: 10,
      defaultAggregateSearch: false,
      doubanDataSource: 'custom',
      doubanImageProxyType: 'server',
      doubanImageProxyUrl: 'https://image.example',
      doubanProxyUrl: 'https://proxy.example',
      enableAutoNextEpisode: false,
      enableAutoSkip: true,
      enableContinueWatchingFilter: true,
      enableOptimization: true,
      fluidSearch: false,
      liveDirectConnect: true,
    });
    expect(readStoredSettings()).toEqual({
      continueWatchingMaxProgress: '90',
      continueWatchingMinProgress: '10',
      defaultAggregateSearch: 'false',
      doubanDataSource: 'custom',
      doubanImageProxyType: 'server',
      doubanImageProxyUrl: 'https://image.example',
      doubanProxyUrl: 'https://proxy.example',
      enableAutoNextEpisode: 'false',
      enableAutoSkip: 'true',
      enableContinueWatchingFilter: 'true',
      enableOptimization: 'true',
      fluidSearch: 'false',
      liveDirectConnect: 'true',
    });
    expect(localStorageChanged).toHaveBeenCalledTimes(2);
    expect(doubanImageProxyChanged).toHaveBeenCalledTimes(2);
    expect(localStorageEventValues).toEqual([
      ['true', null],
      ['true', 'false'],
    ]);
    expect(imageProxyEventValues).toEqual([
      ['server', null],
      ['server', 'https://image.example'],
    ]);
    expect(setItem.mock.calls).toEqual([
      ['defaultAggregateSearch', 'false'],
      ['doubanProxyUrl', 'https://proxy.example'],
      ['enableOptimization', 'true'],
      ['fluidSearch', 'false'],
      ['liveDirectConnect', 'true'],
      ['continueWatchingMinProgress', '10'],
      ['continueWatchingMaxProgress', '90'],
      ['enableContinueWatchingFilter', 'true'],
      ['enableAutoSkip', 'true'],
      ['enableAutoNextEpisode', 'false'],
      ['doubanDataSource', 'custom'],
      ['doubanImageProxyType', 'server'],
      ['doubanImageProxyUrl', 'https://image.example'],
    ]);

    window.removeEventListener('localStorageChanged', localStorageChanged);
    window.removeEventListener(
      'doubanImageProxyChanged',
      doubanImageProxyChanged,
    );
  });

  it('resets all keys to runtime defaults and only emits the image proxy event', () => {
    localStorage.setItem('enableAutoSkip', 'true');
    localStorage.setItem('enableAutoNextEpisode', 'false');
    const localStorageChanged = jest.fn();
    const doubanImageProxyChanged = jest.fn();
    window.addEventListener('localStorageChanged', localStorageChanged);
    window.addEventListener('doubanImageProxyChanged', doubanImageProxyChanged);
    const { result } = renderHook(() => useUserMenuSettingsController());
    runtimeWindow.RUNTIME_CONFIG = {
      DOUBAN_IMAGE_PROXY: 'https://default-image.example',
      DOUBAN_IMAGE_PROXY_TYPE: 'server',
      DOUBAN_PROXY: 'https://default-proxy.example',
      DOUBAN_PROXY_TYPE: 'custom',
      FLUID_SEARCH: false,
    };

    act(() => {
      result.current.handleResetSettings();
    });

    expect(result.current.settings).toEqual({
      continueWatchingMaxProgress: 100,
      continueWatchingMinProgress: 5,
      defaultAggregateSearch: true,
      doubanDataSource: 'custom',
      doubanImageProxyType: 'server',
      doubanImageProxyUrl: 'https://default-image.example',
      doubanProxyUrl: 'https://default-proxy.example',
      enableAutoNextEpisode: true,
      enableAutoSkip: false,
      enableContinueWatchingFilter: false,
      enableOptimization: false,
      fluidSearch: false,
      liveDirectConnect: false,
    });
    expect(readStoredSettings()).toEqual({
      continueWatchingMaxProgress: '100',
      continueWatchingMinProgress: '5',
      defaultAggregateSearch: 'true',
      doubanDataSource: 'custom',
      doubanImageProxyType: 'server',
      doubanImageProxyUrl: 'https://default-image.example',
      doubanProxyUrl: 'https://default-proxy.example',
      enableAutoNextEpisode: 'true',
      enableAutoSkip: 'false',
      enableContinueWatchingFilter: 'false',
      enableOptimization: 'false',
      fluidSearch: 'false',
      liveDirectConnect: 'false',
    });
    expect(localStorageChanged).not.toHaveBeenCalled();
    expect(doubanImageProxyChanged).toHaveBeenCalledTimes(1);

    window.removeEventListener('localStorageChanged', localStorageChanged);
    window.removeEventListener(
      'doubanImageProxyChanged',
      doubanImageProxyChanged,
    );
  });

  it('hydrates only once instead of rereading storage on rerender', () => {
    localStorage.setItem('fluidSearch', 'false');
    const { result, rerender } = renderHook(() =>
      useUserMenuSettingsController(),
    );
    expect(result.current.settings.fluidSearch).toBe(false);

    localStorage.setItem('fluidSearch', 'true');
    rerender();

    expect(result.current.settings.fluidSearch).toBe(false);
  });
});
