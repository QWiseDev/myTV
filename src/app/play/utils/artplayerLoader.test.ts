import type {
  ArtplayerConstructor,
  DanmukuPluginFactory,
} from './artplayerLoader';
import {
  getCachedArtplayerModules,
  loadArtplayerModules,
  preloadArtplayerModules,
} from './artplayerLoader';

const Artplayer: ArtplayerConstructor = Object.assign(jest.fn(), {
  PLAYBACK_RATE: [],
  FULLSCREEN_WEB_IN_BODY: false,
  USE_RAF: false,
  REMOVE_SRC_WHEN_DESTROY: true,
});
const artplayerPluginDanmuku = jest.fn() as DanmukuPluginFactory;

function clearCachedModules() {
  delete window.DynamicArtplayer;
  delete window.DynamicArtplayerPluginDanmuku;
}

describe('artplayerLoader', () => {
  beforeEach(() => {
    clearCachedModules();
  });

  afterEach(() => {
    clearCachedModules();
  });

  test('returns cached modules from window', () => {
    window.DynamicArtplayer = Artplayer;
    window.DynamicArtplayerPluginDanmuku = artplayerPluginDanmuku;

    expect(getCachedArtplayerModules()).toEqual({
      Artplayer,
      artplayerPluginDanmuku,
    });
  });

  test('loads and caches missing modules', async () => {
    const loaders = {
      loadArtplayer: jest.fn().mockResolvedValue({ default: Artplayer }),
      loadDanmukuPlugin: jest
        .fn()
        .mockResolvedValue({ default: artplayerPluginDanmuku }),
    };

    const modules = await loadArtplayerModules(loaders);

    expect(modules).toEqual({ Artplayer, artplayerPluginDanmuku });
    expect(window.DynamicArtplayer).toBe(Artplayer);
    expect(window.DynamicArtplayerPluginDanmuku).toBe(artplayerPluginDanmuku);
  });

  test('reuses cached Artplayer and only loads the missing plugin', async () => {
    window.DynamicArtplayer = Artplayer;
    const loaders = {
      loadArtplayer: jest.fn(),
      loadDanmukuPlugin: jest
        .fn()
        .mockResolvedValue({ default: artplayerPluginDanmuku }),
    };

    await loadArtplayerModules(loaders);

    expect(loaders.loadArtplayer).not.toHaveBeenCalled();
    expect(loaders.loadDanmukuPlugin).toHaveBeenCalledTimes(1);
  });

  test('preloads modules without waiting for callers', async () => {
    const loaders = {
      loadArtplayer: jest.fn().mockResolvedValue({ default: Artplayer }),
      loadDanmukuPlugin: jest
        .fn()
        .mockResolvedValue({ default: artplayerPluginDanmuku }),
    };

    preloadArtplayerModules(loaders);
    await Promise.resolve();

    expect(window.DynamicArtplayer).toBe(Artplayer);
    expect(window.DynamicArtplayerPluginDanmuku).toBe(artplayerPluginDanmuku);
  });
});
