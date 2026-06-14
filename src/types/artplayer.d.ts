/**
 * Artplayer 类型定义
 * 为 Artplayer 和相关插件提供完整的类型支持
 */

declare module 'artplayer' {
  export interface ArtplayerOptions {
    container: HTMLElement | string;
    url: string;
    poster?: string;
    title?: string;
    volume?: number;
    autoplay?: boolean;
    autoSize?: boolean;
    autoMini?: boolean;
    loop?: boolean;
    flip?: boolean;
    playbackRate?: boolean;
    aspectRatio?: boolean;
    screenshot?: boolean;
    setting?: boolean;
    hotkey?: boolean;
    pip?: boolean;
    mutex?: boolean;
    fullscreen?: boolean;
    fullscreenWeb?: boolean;
    subtitleOffset?: boolean;
    miniProgressBar?: boolean;
    playsInline?: boolean;
    layers?: Layer[];
    controls?: Control[];
    settings?: Setting[];
    contextmenu?: ContextMenuItem[];
    plugins?: Plugin[];
    customType?: Record<string, (video: HTMLVideoElement, url: string) => void>;
    moreVideoAttr?: Record<string, any>;
    quality?: Quality[];
    thumbnails?: Thumbnails;
    subtitle?: Subtitle;
    muted?: boolean;
    lang?: string;
    theme?: string;
    whitelist?: string[];
  }

  export interface Layer {
    html?: string | HTMLElement;
    style?: Partial<CSSStyleDeclaration>;
    click?: (this: Artplayer) => void;
    mounted?: (this: Artplayer, $el: HTMLElement) => void;
  }

  export interface Control {
    html?: string | HTMLElement;
    position?: 'top' | 'left' | 'right';
    index?: number;
    style?: Partial<CSSStyleDeclaration>;
    click?: (this: Artplayer, event: Event) => void;
    mounted?: (this: Artplayer, $el: HTMLElement) => void;
    tooltip?: string;
    selector?: any[];
  }

  export interface Setting {
    html?: string;
    icon?: string;
    width?: number;
    tooltip?: string;
    selector?: {
      html: string;
      value?: any;
      default?: boolean;
    }[];
    onSelect?: (this: Artplayer, item: any, $el: HTMLElement) => void;
    mounted?: (this: Artplayer, $el: HTMLElement) => void;
  }

  export interface ContextMenuItem {
    html?: string | HTMLElement;
    click?: (this: Artplayer, event: Event) => void;
    mounted?: (this: Artplayer, $el: HTMLElement) => void;
  }

  export interface Plugin {
    (art: Artplayer): any;
  }

  export interface Quality {
    default?: boolean;
    html: string;
    url: string;
  }

  export interface Thumbnails {
    url: string;
    number?: number;
    column?: number;
    width?: number;
    height?: number;
  }

  export interface Subtitle {
    url: string;
    type?: 'srt' | 'ass' | 'vtt';
    style?: Partial<CSSStyleDeclaration>;
    encoding?: string;
    bilingual?: boolean;
  }

  export default class Artplayer {
    constructor(options: ArtplayerOptions);

    // 静态属性
    static PLAYBACK_RATE: number[];
    static FULLSCREEN_WEB_IN_BODY: boolean;
    static LOG_VERSION: boolean;
    static USE_RAF: boolean;
    static REMOVE_SRC_WHEN_DESTROY: boolean;
    static instances: Artplayer[];

    // 基础属性
    video: HTMLVideoElement;
    template: any;
    $container: HTMLElement;
    $player: HTMLElement;

    // 播放状态
    playing: boolean;
    paused: boolean;
    loaded: boolean;
    duration: number;
    currentTime: number;
    volume: number;
    muted: boolean;
    playbackRate: number;
    url: string;
    poster: string;
    title: string;

    // 尺寸相关
    width: number;
    height: number;
    fullscreen: boolean;
    fullscreenWeb: boolean;
    pip: boolean;

    // 插件
    plugins: Record<string, any>;

    // 方法 - 播放控制
    play(): Promise<void>;
    pause(): void;
    toggle(): void;
    seek(time: number): void;
    forward(time: number): void;
    backward(time: number): void;

    // 方法 - 源切换
    switchUrl(url: string): Promise<void>;
    switchQuality(url: string): Promise<void>;

    // 方法 - 截图
    screenshot(fileName?: string): Promise<string>;
    getDataURL(): Promise<string>;
    getBlobUrl(): Promise<string>;
    download(fileName?: string): Promise<void>;

    // 方法 - 全屏
    requestFullscreen(): void;
    exitFullscreen(): void;
    toggleFullscreen(): void;
    requestFullscreenWeb(): void;
    exitFullscreenWeb(): void;
    toggleFullscreenWeb(): void;
    requestPip(): Promise<void>;
    exitPip(): Promise<void>;
    togglePip(): Promise<void>;

    // 方法 - 字幕
    loadSubtitle(options: Subtitle): void;

    // 方法 - 事件
    on(event: string, callback: (...args: any[]) => void): void;
    once(event: string, callback: (...args: any[]) => void): void;
    off(event: string, callback?: (...args: any[]) => void): void;
    emit(event: string, ...args: any[]): void;

    // 方法 - 销毁
    destroy(removeHtml?: boolean): void;
    reset(): void;
  }
}

declare module 'artplayer-plugin-danmuku' {
  import Artplayer from 'artplayer';

  export interface DanmakuItem {
    text: string;
    time: number;
    color?: string;
    border?: boolean;
    mode?: 0 | 1 | 2; // 0: 滚动, 1: 顶部, 2: 底部
  }

  export interface DanmakuOptions {
    danmuku?: DanmakuItem[];
    speed?: number;
    opacity?: number;
    fontSize?: number;
    color?: string;
    mode?: 0 | 1 | 2;
    margin?: [number, number];
    antiOverlap?: boolean;
    useWorker?: boolean;
    synchronousPlayback?: boolean;
    filter?: (danmu: DanmakuItem) => boolean;
    lockTime?: number;
    maxLength?: number;
    minWidth?: number;
    maxWidth?: number;
    theme?: 'dark' | 'light';
    beforeVisible?: (danmu: DanmakuItem) => void;
    beforeEmit?: (danmu: DanmakuItem) => void;
    hls?: any;
    unlimited?: boolean;
  }

  export interface DanmakuPlugin {
    name: 'artplayerPluginDanmuku';
    load: (danmaku: DanmakuItem[]) => void;
    emit: (danmu: DanmakuItem) => void;
    config: (options: Partial<DanmakuOptions>) => void;
    hide: () => void;
    show: () => void;
    isHide: boolean;
    isStop: boolean;
    option: DanmakuOptions;
  }

  export default function artplayerPluginDanmuku(
    options: DanmakuOptions
  ): (art: Artplayer) => DanmakuPlugin;
}

declare module 'hls.js' {
  export interface HlsConfig {
    debug?: boolean;
    enableWorker?: boolean;
    lowLatencyMode?: boolean;
    backBufferLength?: number;
    maxBufferLength?: number;
    maxMaxBufferLength?: number;
    maxBufferSize?: number;
    maxBufferHole?: number;
    highBufferWatchdogPeriod?: number;
    nudgeOffset?: number;
    nudgeMaxRetry?: number;
    maxFragLookUpTolerance?: number;
    liveSyncDurationCount?: number;
    liveMaxLatencyDurationCount?: number;
    liveDurationInfinity?: boolean;
    liveBackBufferLength?: number;
    maxMaxBufferLength?: number;
    enableWebVTT?: boolean;
    enableIMSC1?: boolean;
    enableCEA708Captions?: boolean;
    stretchShortVideoTrack?: boolean;
    maxAudioFramesDrift?: number;
    forceKeyFrameOnDiscontinuity?: boolean;
    abrEwmaFastLive?: number;
    abrEwmaSlowLive?: number;
    abrEwmaFastVoD?: number;
    abrEwmaSlowVoD?: number;
    abrEwmaDefaultEstimate?: number;
    abrBandWidthFactor?: number;
    abrBandWidthUpFactor?: number;
    abrMaxWithRealBitrate?: boolean;
    maxStarvationDelay?: number;
    maxLoadingDelay?: number;
    minAutoBitrate?: number;
    emeEnabled?: boolean;
    widevineLicenseUrl?: string;
    drmSystemOptions?: Record<string, any>;
    requestMediaKeySystemAccessFunc?: any;
    testBandwidth?: boolean;
    progressive?: boolean;
    lowLatencyMode?: boolean;
    fpsDroppedMonitoringPeriod?: number;
    fpsDroppedMonitoringThreshold?: number;
    appendErrorMaxRetry?: number;
    loader?: any;
    fLoader?: any;
    pLoader?: any;
    xhrSetup?: (xhr: XMLHttpRequest, url: string) => void;
    fetchSetup?: (context: any, initParams: any) => void;
    abrController?: any;
    timelineController?: any;
    enableSoftwareAES?: boolean;
    manifestLoadingTimeOut?: number;
    manifestLoadingMaxRetry?: number;
    manifestLoadingRetryDelay?: number;
    manifestLoadingMaxRetryTimeout?: number;
    levelLoadingTimeOut?: number;
    levelLoadingMaxRetry?: number;
    levelLoadingRetryDelay?: number;
    levelLoadingMaxRetryTimeout?: number;
    fragLoadingTimeOut?: number;
    fragLoadingMaxRetry?: number;
    fragLoadingRetryDelay?: number;
    fragLoadingMaxRetryTimeout?: number;
    startFragPrefetch?: boolean;
    testBandwidth?: boolean;
    fragLoadPolicy?: any;
  }

  export default class Hls {
    constructor(config?: Partial<HlsConfig>);
    static isSupported(): boolean;
    static Events: any;
    static ErrorTypes: any;
    static ErrorDetails: any;
    static DefaultConfig: {
      loader: any;
      fLoader: any;
      pLoader: any;
      [key: string]: any;
    };
    loadSource(url: string): void;
    attachMedia(video: HTMLVideoElement): void;
    destroy(): void;
    recoverMediaError(): void;
    startLoad(startPosition?: number): void;
    stopLoad(): void;
    swapAudioCodec(): void;
    trigger(event: string, data: any): void;
    on(event: string, callback: (...args: any[]) => void): void;
    off(event: string, callback?: (...args: any[]) => void): void;
  }
}
