import type Artplayer from 'artplayer';

export type ArtplayerConstructor = (new (
  option: ConstructorParameters<typeof Artplayer>[0],
) => Artplayer) & {
  PLAYBACK_RATE: number[];
  FULLSCREEN_WEB_IN_BODY: boolean;
  USE_RAF: boolean;
  REMOVE_SRC_WHEN_DESTROY: boolean;
};
export type DanmukuPluginFactory = (
  config: ReturnType<
    typeof import('@/app/play/utils/danmakuConfig').getOptimizedDanmakuConfig
  >,
) => unknown;

export type ArtplayerRuntimeModules = {
  Artplayer: ArtplayerConstructor;
  artplayerPluginDanmuku: DanmukuPluginFactory;
};

export type ArtplayerModuleLoaders = {
  loadArtplayer: () => Promise<{ default: ArtplayerConstructor }>;
  loadDanmukuPlugin: () => Promise<{ default: DanmukuPluginFactory }>;
};

declare global {
  interface Window {
    DynamicArtplayer?: ArtplayerConstructor;
    DynamicArtplayerPluginDanmuku?: DanmukuPluginFactory;
  }
}

function normalizeDanmukuPluginFactory(plugin: unknown): DanmukuPluginFactory {
  if (typeof plugin !== 'function') {
    throw new TypeError('Invalid artplayer-plugin-danmuku module');
  }

  return plugin as DanmukuPluginFactory;
}

const defaultLoaders: ArtplayerModuleLoaders = {
  loadArtplayer: () => import('artplayer'),
  loadDanmukuPlugin: () =>
    import('artplayer-plugin-danmuku').then((module) => ({
      default: normalizeDanmukuPluginFactory(module.default),
    })),
};

function canUseWindow() {
  return typeof window !== 'undefined';
}

export function getCachedArtplayerModules(): ArtplayerRuntimeModules | null {
  if (
    !canUseWindow() ||
    !window.DynamicArtplayer ||
    !window.DynamicArtplayerPluginDanmuku
  ) {
    return null;
  }

  return {
    Artplayer: window.DynamicArtplayer,
    artplayerPluginDanmuku: window.DynamicArtplayerPluginDanmuku,
  };
}

export async function loadArtplayerModules(
  loaders: ArtplayerModuleLoaders = defaultLoaders,
): Promise<ArtplayerRuntimeModules> {
  const cached = getCachedArtplayerModules();
  if (cached) {
    return cached;
  }

  const [Artplayer, artplayerPluginDanmuku] = await Promise.all([
    window.DynamicArtplayer
      ? Promise.resolve(window.DynamicArtplayer)
      : loaders.loadArtplayer().then((module) => module.default),
    window.DynamicArtplayerPluginDanmuku
      ? Promise.resolve(window.DynamicArtplayerPluginDanmuku)
      : loaders.loadDanmukuPlugin().then((module) => module.default),
  ]);

  window.DynamicArtplayer = Artplayer;
  window.DynamicArtplayerPluginDanmuku = artplayerPluginDanmuku;

  return { Artplayer, artplayerPluginDanmuku };
}

export function preloadArtplayerModules(
  loaders: ArtplayerModuleLoaders = defaultLoaders,
) {
  if (!canUseWindow() || getCachedArtplayerModules()) {
    return;
  }

  if (!window.DynamicArtplayer) {
    void loaders
      .loadArtplayer()
      .then((module) => {
        window.DynamicArtplayer = module.default;
      })
      .catch(() => undefined);
  }

  if (!window.DynamicArtplayerPluginDanmuku) {
    void loaders
      .loadDanmukuPlugin()
      .then((module) => {
        window.DynamicArtplayerPluginDanmuku = module.default;
      })
      .catch(() => undefined);
  }
}
