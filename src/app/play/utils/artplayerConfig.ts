/**
 * Artplayer 配置工具
 * 管理视频播放器的各种配置项
 */

import type Artplayer from 'artplayer';
import type { MutableRefObject } from 'react';

import type { ArtPlayerLike } from './danmakuRuntime';

type ArtplayerControlConfig = {
  position: 'top' | 'left' | 'right';
  index: number;
  html: string;
  tooltip: string;
  click: () => void;
};
type ArtplayerOptions = ConstructorParameters<typeof Artplayer>[0];
type ArtplayerPluginConfig = NonNullable<ArtplayerOptions['plugins']>[number];
type ArtplayerCustomTypeConfig = NonNullable<ArtplayerOptions['customType']>;
type ArtplayerConstructorLike = {
  PLAYBACK_RATE: number[];
  FULLSCREEN_WEB_IN_BODY: boolean;
  USE_RAF: boolean;
  REMOVE_SRC_WHEN_DESTROY: boolean;
};

interface ArtplayerConfigOptions {
  // 视频信息
  container: HTMLElement;
  url: string;
  poster: string;

  // 设备信息
  isIOS: boolean;
  isSafari: boolean;
  isChrome: boolean;
  isMobile: boolean;

  // 状态和回调
  blockAdEnabled: boolean;
  blockAdEnabledRef: MutableRefObject<boolean>;
  externalDanmuEnabledRef: MutableRefObject<boolean>;
  onBlockAdToggle: (enabled: boolean) => void;
  onDanmuToggle: (enabled: boolean) => void;
  onNextEpisode: () => void;
  // 🎯 新增：弹幕集数调整
  danmuEpisodeNum: number; // 当前弹幕对应的集数
  onDanmuEpisodeChange: (offset: number) => void; // 调整偏移量

  // Refs (用于在配置中访问播放器实例)
  artPlayerRef: MutableRefObject<ArtPlayerLike | null>;
  resumeTimeRef: MutableRefObject<number | null>;

  // HLS 配置
  customType: ArtplayerCustomTypeConfig;

  // 插件配置
  danmakuConfig: unknown;
  chromecastConfig?: unknown;
}

function isArtplayerPlugin(plugin: unknown): plugin is ArtplayerPluginConfig {
  return typeof plugin === 'function';
}

/**
 * 获取基础 Artplayer 配置
 */
export function getBaseArtplayerConfig(options: ArtplayerConfigOptions) {
  const { container, url, poster, isIOS, isSafari } = options;

  return {
    container,
    url,
    poster,
    volume: 0.7,
    isLive: false,
    // iOS设备需要静音才能自动播放
    muted: isIOS || isSafari,
    autoplay: true,
    pip: true,
    autoSize: false,
    autoMini: false,
    screenshot: false,
    setting: true,
    loop: false,
    flip: false,
    playbackRate: true,
    aspectRatio: false,
    fullscreen: true,
    fullscreenWeb: true,
    subtitleOffset: false,
    miniProgressBar: false,
    mutex: true,
    playsInline: true,
    autoPlayback: false,
    theme: '#22c55e',
    lang: 'zh-cn',
    hotkey: false,
    fastForward: true,
    autoOrientation: true,
    lock: true,
    // AirPlay 仅在支持 WebKit API 的浏览器中启用
    airplay: isIOS || isSafari,
    moreVideoAttr: {
      crossOrigin: 'anonymous',
    },
  };
}

/**
 * 获取 Loading 图标配置
 */
export function getLoadingIcon() {
  return {
    loading:
      '<img src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI1MCIgaGVpZ2h0PSI1MCIgdmlld0JveD0iMCAwIDUwIDUwIj48cGF0aCBkPSJNMjUuMjUxIDYuNDYxYy0xMC4zMTggMC0xOC42ODMgOC4zNjUtMTguNjgzIDE4LjY4M2g0LjA2OGMwLTguMDcgNi41NDUtMTQuNjE1IDE0LjYxNS0xNC42MTVWNi40NjF6IiBmaWxsPSIjMDA5Njg4Ij48YW5pbWF0ZVRyYW5zZm9ybSBhdHRyaWJ1dGVOYW1lPSJ0cmFuc2Zvcm0iIGF0dHJpYnV0ZVR5cGU9IlhNTCIgZHVyPSIxcyIgZnJvbT0iMCAyNSAyNSIgcmVwZWF0Q291bnQ9ImluZGVmaW5pdGUiIHRvPSIzNjAgMjUgMjUiIHR5cGU9InJvdGF0ZSIvPjwvcGF0aD48L3N2Zz4=">',
  };
}

/**
 * 获取设置项配置（去广告）
 */
export function getSettingsConfig(options: ArtplayerConfigOptions) {
  const {
    blockAdEnabled,
    blockAdEnabledRef,
    externalDanmuEnabledRef,
    onBlockAdToggle,
    onDanmuToggle,
  } = options;

  return [
    // 去广告开关
    {
      html: '去广告',
      icon: '<text x="50%" y="50%" font-size="20" font-weight="bold" text-anchor="middle" dominant-baseline="middle" fill="#ffffff">AD</text>',
      tooltip: blockAdEnabled ? '已开启' : '已关闭',
      onClick() {
        const newVal = !blockAdEnabledRef.current;
        try {
          localStorage.setItem('enable_blockad', String(newVal));
          blockAdEnabledRef.current = newVal;
          onBlockAdToggle(newVal);
        } catch (_) {
          // ignore
        }
        return newVal ? '当前开启' : '当前关闭';
      },
    },
    {
      html: '弹幕',
      icon: '<text x="50%" y="50%" font-size="18" font-weight="bold" text-anchor="middle" dominant-baseline="middle" fill="#ffffff">DM</text>',
      tooltip: externalDanmuEnabledRef.current ? '已开启' : '已关闭',
      onClick() {
        const newVal = !externalDanmuEnabledRef.current;
        externalDanmuEnabledRef.current = newVal;
        onDanmuToggle(newVal);
        return newVal ? '当前开启' : '当前关闭';
      },
    },
  ];
}

/**
 * 获取控制栏配置（下一集按钮）
 * 注意：弹幕开关按钮和弹幕集数调整按钮已移除
 */
export function getControlsConfig(options: ArtplayerConfigOptions) {
  const { onNextEpisode } = options;

  const controls: ArtplayerControlConfig[] = [
    // 下一集按钮
    {
      position: 'left',
      index: 13,
      html: '<i class="art-icon flex"><svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" fill="currentColor"/></svg></i>',
      tooltip: '播放下一集',
      click: function () {
        onNextEpisode();
      },
    },
  ];

  return controls;
}

/**
 * 获取插件配置（弹幕、Chromecast）
 */
export function getPluginsConfig(options: ArtplayerConfigOptions) {
  const { isChrome, isIOS, danmakuConfig, chromecastConfig } = options;

  const plugins: ArtplayerPluginConfig[] = [];
  if (isArtplayerPlugin(danmakuConfig)) {
    plugins.push(danmakuConfig);
  }

  // 只在 Chrome 浏览器中显示 Chromecast（排除 iOS Chrome）
  if (isChrome && !isIOS && isArtplayerPlugin(chromecastConfig)) {
    plugins.push(chromecastConfig);
  }

  return plugins;
}

/**
 * 创建完整的 Artplayer 配置对象
 */
export function createArtplayerConfig(options: ArtplayerConfigOptions) {
  return {
    ...getBaseArtplayerConfig(options),
    customType: options.customType,
    icons: getLoadingIcon(),
    settings: getSettingsConfig(options),
    controls: getControlsConfig(options),
    plugins: getPluginsConfig(options),
  };
}

/**
 * 设置 Artplayer 全局配置
 */
export function setupArtplayerGlobals(Artplayer: ArtplayerConstructorLike) {
  Artplayer.PLAYBACK_RATE = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];
  Artplayer.FULLSCREEN_WEB_IN_BODY = true;
  Artplayer.USE_RAF = true;
  Artplayer.REMOVE_SRC_WHEN_DESTROY = true;
}
