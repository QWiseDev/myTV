export interface UserMenuRuntimeConfig {
  DOUBAN_PROXY_TYPE?: string;
  DOUBAN_PROXY?: string;
  DOUBAN_IMAGE_PROXY_TYPE?: string;
  DOUBAN_IMAGE_PROXY?: string;
  FLUID_SEARCH?: boolean;
}

export interface UserMenuSettingsSnapshot {
  defaultAggregateSearch: boolean;
  doubanDataSource: string;
  doubanProxyUrl: string;
  doubanImageProxyType: string;
  doubanImageProxyUrl: string;
  enableOptimization: boolean;
  fluidSearch: boolean;
  liveDirectConnect: boolean;
  continueWatchingMinProgress: number;
  continueWatchingMaxProgress: number;
  enableContinueWatchingFilter: boolean;
  enableAutoSkip: boolean;
  enableAutoNextEpisode: boolean;
}

interface SettingsStorageReader {
  getItem(key: string): string | null;
}

interface SettingsStorageWriter {
  setItem(key: string, value: string): void;
}

export function buildDefaultUserMenuSettings(
  runtimeConfig: UserMenuRuntimeConfig = {},
): UserMenuSettingsSnapshot {
  return {
    continueWatchingMaxProgress: 100,
    continueWatchingMinProgress: 5,
    defaultAggregateSearch: true,
    doubanDataSource: runtimeConfig.DOUBAN_PROXY_TYPE || 'direct',
    doubanImageProxyType: runtimeConfig.DOUBAN_IMAGE_PROXY_TYPE || 'direct',
    doubanImageProxyUrl: runtimeConfig.DOUBAN_IMAGE_PROXY || '',
    doubanProxyUrl: runtimeConfig.DOUBAN_PROXY || '',
    enableAutoNextEpisode: true,
    enableAutoSkip: false,
    enableContinueWatchingFilter: false,
    enableOptimization: false,
    fluidSearch: runtimeConfig.FLUID_SEARCH !== false,
    liveDirectConnect: false,
  };
}

function readBooleanSetting(
  storage: SettingsStorageReader,
  key: string,
  fallback: boolean,
): boolean {
  const raw = storage.getItem(key);

  return raw === null ? fallback : JSON.parse(raw);
}

function readNumberSetting(
  storage: SettingsStorageReader,
  key: string,
  fallback: number,
): number {
  const raw = storage.getItem(key);

  return raw === null ? fallback : parseInt(raw);
}

function readStringSetting(
  storage: SettingsStorageReader,
  key: string,
  fallback: string,
): string {
  const raw = storage.getItem(key);

  return raw === null ? fallback : raw;
}

export function readUserMenuSettings(
  storage: SettingsStorageReader,
  runtimeConfig: UserMenuRuntimeConfig = {},
): UserMenuSettingsSnapshot {
  const defaults = buildDefaultUserMenuSettings(runtimeConfig);

  return {
    continueWatchingMaxProgress: readNumberSetting(
      storage,
      'continueWatchingMaxProgress',
      defaults.continueWatchingMaxProgress,
    ),
    continueWatchingMinProgress: readNumberSetting(
      storage,
      'continueWatchingMinProgress',
      defaults.continueWatchingMinProgress,
    ),
    defaultAggregateSearch: readBooleanSetting(
      storage,
      'defaultAggregateSearch',
      defaults.defaultAggregateSearch,
    ),
    doubanDataSource: readStringSetting(
      storage,
      'doubanDataSource',
      defaults.doubanDataSource,
    ),
    doubanImageProxyType: readStringSetting(
      storage,
      'doubanImageProxyType',
      defaults.doubanImageProxyType,
    ),
    doubanImageProxyUrl: readStringSetting(
      storage,
      'doubanImageProxyUrl',
      defaults.doubanImageProxyUrl,
    ),
    doubanProxyUrl: readStringSetting(
      storage,
      'doubanProxyUrl',
      defaults.doubanProxyUrl,
    ),
    enableAutoNextEpisode: readBooleanSetting(
      storage,
      'enableAutoNextEpisode',
      defaults.enableAutoNextEpisode,
    ),
    enableAutoSkip: readBooleanSetting(
      storage,
      'enableAutoSkip',
      defaults.enableAutoSkip,
    ),
    enableContinueWatchingFilter: readBooleanSetting(
      storage,
      'enableContinueWatchingFilter',
      defaults.enableContinueWatchingFilter,
    ),
    enableOptimization: readBooleanSetting(
      storage,
      'enableOptimization',
      defaults.enableOptimization,
    ),
    fluidSearch: readBooleanSetting(
      storage,
      'fluidSearch',
      defaults.fluidSearch,
    ),
    liveDirectConnect: readBooleanSetting(
      storage,
      'liveDirectConnect',
      defaults.liveDirectConnect,
    ),
  };
}

export function writeUserMenuSettings(
  storage: SettingsStorageWriter,
  settings: UserMenuSettingsSnapshot,
): void {
  storage.setItem(
    'defaultAggregateSearch',
    JSON.stringify(settings.defaultAggregateSearch),
  );
  storage.setItem(
    'enableOptimization',
    JSON.stringify(settings.enableOptimization),
  );
  storage.setItem('fluidSearch', JSON.stringify(settings.fluidSearch));
  storage.setItem(
    'liveDirectConnect',
    JSON.stringify(settings.liveDirectConnect),
  );
  storage.setItem('doubanProxyUrl', settings.doubanProxyUrl);
  storage.setItem('doubanDataSource', settings.doubanDataSource);
  storage.setItem('doubanImageProxyType', settings.doubanImageProxyType);
  storage.setItem('doubanImageProxyUrl', settings.doubanImageProxyUrl);
  storage.setItem(
    'continueWatchingMinProgress',
    settings.continueWatchingMinProgress.toString(),
  );
  storage.setItem(
    'continueWatchingMaxProgress',
    settings.continueWatchingMaxProgress.toString(),
  );
  storage.setItem(
    'enableContinueWatchingFilter',
    JSON.stringify(settings.enableContinueWatchingFilter),
  );
  storage.setItem('enableAutoSkip', JSON.stringify(settings.enableAutoSkip));
  storage.setItem(
    'enableAutoNextEpisode',
    JSON.stringify(settings.enableAutoNextEpisode),
  );
}
