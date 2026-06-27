import {
  buildDefaultUserMenuSettings,
  readUserMenuSettings,
  writeUserMenuSettings,
  type UserMenuSettingsSnapshot,
} from './user-menu-settings';

function createStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));

  return {
    data,
    getItem: jest.fn((key: string) => data.get(key) ?? null),
    setItem: jest.fn((key: string, value: string) => {
      data.set(key, value);
    }),
  };
}

describe('buildDefaultUserMenuSettings', () => {
  it('builds defaults from runtime config', () => {
    expect(
      buildDefaultUserMenuSettings({
        DOUBAN_IMAGE_PROXY: 'https://image.example',
        DOUBAN_IMAGE_PROXY_TYPE: 'server',
        DOUBAN_PROXY: 'https://proxy.example',
        DOUBAN_PROXY_TYPE: 'custom',
        FLUID_SEARCH: false,
      }),
    ).toEqual(
      expect.objectContaining({
        doubanDataSource: 'custom',
        doubanImageProxyType: 'server',
        doubanImageProxyUrl: 'https://image.example',
        doubanProxyUrl: 'https://proxy.example',
        fluidSearch: false,
      }),
    );
  });
});

describe('readUserMenuSettings', () => {
  it('uses runtime defaults when local storage has no override', () => {
    const storage = createStorage();

    expect(
      readUserMenuSettings(storage, {
        DOUBAN_PROXY_TYPE: 'cors-proxy-zwei',
        FLUID_SEARCH: false,
      }),
    ).toEqual(
      expect.objectContaining({
        continueWatchingMaxProgress: 100,
        continueWatchingMinProgress: 5,
        defaultAggregateSearch: true,
        doubanDataSource: 'cors-proxy-zwei',
        enableAutoNextEpisode: true,
        enableAutoSkip: false,
        fluidSearch: false,
      }),
    );
  });

  it('prefers stored settings over runtime defaults', () => {
    const storage = createStorage({
      continueWatchingMaxProgress: '80',
      continueWatchingMinProgress: '10',
      defaultAggregateSearch: 'false',
      doubanDataSource: 'direct',
      doubanImageProxyType: 'custom',
      doubanImageProxyUrl: 'https://stored-image.example',
      doubanProxyUrl: 'https://stored-proxy.example',
      enableAutoNextEpisode: 'false',
      enableAutoSkip: 'true',
      enableContinueWatchingFilter: 'true',
      enableOptimization: 'true',
      fluidSearch: 'true',
      liveDirectConnect: 'true',
    });

    expect(
      readUserMenuSettings(storage, {
        DOUBAN_PROXY_TYPE: 'custom',
        FLUID_SEARCH: false,
      }),
    ).toEqual({
      continueWatchingMaxProgress: 80,
      continueWatchingMinProgress: 10,
      defaultAggregateSearch: false,
      doubanDataSource: 'direct',
      doubanImageProxyType: 'custom',
      doubanImageProxyUrl: 'https://stored-image.example',
      doubanProxyUrl: 'https://stored-proxy.example',
      enableAutoNextEpisode: false,
      enableAutoSkip: true,
      enableContinueWatchingFilter: true,
      enableOptimization: true,
      fluidSearch: true,
      liveDirectConnect: true,
    });
  });
});

describe('writeUserMenuSettings', () => {
  it('writes every setting with the same storage format UserMenu expects', () => {
    const storage = createStorage();
    const settings: UserMenuSettingsSnapshot = {
      continueWatchingMaxProgress: 90,
      continueWatchingMinProgress: 15,
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
    };

    writeUserMenuSettings(storage, settings);

    expect(Object.fromEntries(storage.data.entries())).toEqual({
      continueWatchingMaxProgress: '90',
      continueWatchingMinProgress: '15',
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
  });
});
