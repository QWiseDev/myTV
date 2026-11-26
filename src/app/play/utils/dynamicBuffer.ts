/**
 * 动态自适应缓冲控制器
 *
 * 根据实时分片下载速率、TTFB、卡顿状态、播放倍速、暂停状态与设备内存压力，
 * 动态调节 HLS.js 前向缓冲目标与超时策略：
 * - 源速度慢或波动时提前扩大预缓存窗口，降低弱源卡顿；
 * - 源快且稳定时保持适度缓冲，减少无效流量与内存占用；
 * - 内存受限或遭遇 MSE QuotaExceededError 时自动收紧上限。
 */

export type BufferStrategy = 'auto' | 'aggressive' | 'balanced';

export type SourceSpeedTier = 'fast' | 'normal' | 'slow' | 'very_slow';

export type BufferMemoryPressure = 'low' | 'medium' | 'high' | 'critical';

export interface BufferDeviceInfo {
  isMobile: boolean;
  isIOS: boolean;
  isIOS13?: boolean;
  /** 设备内存估算（GB，来自 navigator.deviceMemory；未提供时视为现代桌面 ≥8GB） */
  deviceMemoryGB?: number;
}

export interface NetworkHint {
  effectiveType?: string;
  downlinkMbps?: number;
  saveData?: boolean;
}

export interface SpeedClassificationInput {
  ewmaSpeedRatio: number | null;
  inFlightSlowRatio: number | null;
  ewmaTtfbMs: number | null;
  recentStallsCount: number;
  playbackRate: number;
  sampleCount: number;
  networkHint?: NetworkHint;
}

export interface DynamicBufferInput {
  strategy: BufferStrategy;
  deviceInfo: BufferDeviceInfo;
  speedTier: SourceSpeedTier;
  playbackRate: number;
  isPaused: boolean;
  hasRenderedPlayback?: boolean;
  sampleCount?: number;
  isLive: boolean;
  stallBoostSeconds: number;
  estimatedBitrateBps: number | null;
  memoryPressure: BufferMemoryPressure;
  saveData?: boolean;
  quotaCapSeconds?: number | null;
}

export interface DynamicBufferPlan {
  speedTier: SourceSpeedTier;
  maxBufferLength: number;
  maxMaxBufferLength: number;
  maxBufferSize: number;
  backBufferLength: number;
  maxTimeToFirstByteMs: number;
  maxLoadTimeMs: number;
  tooltip: string;
}

export interface DynamicBufferTelemetrySnapshot {
  strategy: BufferStrategy;
  speedTier: SourceSpeedTier;
  sampleCount: number;
  ewmaSpeedRatio: number | null;
  ewmaTtfbMs: number | null;
  ewmaBitrateBps: number | null;
  ewmaThroughputBps: number | null;
  recentStallsCount: number;
  stallBoostSeconds: number;
  isPaused: boolean;
  isLive: boolean;
  memoryPressure: BufferMemoryPressure;
  quotaCapSeconds: number | null;
  plan: DynamicBufferPlan;
}

export interface DynamicBufferHlsConfigLike {
  maxBufferLength?: number;
  maxMaxBufferLength?: number;
  maxBufferSize?: number;
  backBufferLength?: number;
  fragLoadPolicy?: {
    default?: {
      maxTimeToFirstByteMs?: number;
      maxLoadTimeMs?: number;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface DynamicBufferHlsLike {
  config?: DynamicBufferHlsConfigLike;
  levels?: Array<{ height?: number; maxBitrate?: number; bitrate?: number }>;
  currentLevel?: number;
  loadLevel?: number;
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  off?: (event: string, listener: (...args: unknown[]) => void) => void;
}

export interface DynamicBufferSettingItem {
  name?: string;
  html?: string;
  tooltip?: string;
  width?: number;
  selector?: Array<{
    html: string;
    value: string;
    default?: boolean;
  }>;
  onSelect?: (item: { value?: unknown }) => string | void;
}

export interface DynamicBufferArtLike {
  video?: HTMLVideoElement | null;
  $video?: HTMLVideoElement | null;
  notice?: { show: string };
  setting?: {
    add?: (option: DynamicBufferSettingItem) => unknown;
    update?: (option: DynamicBufferSettingItem) => unknown;
    find?: (name: string) => { tooltip?: string } | null | undefined;
  };
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  off?: (event: string, listener: (...args: unknown[]) => void) => void;
}

export interface InstallDynamicBufferOptions {
  deviceInfo: BufferDeviceInfo;
  getMemoryPressure?: () => BufferMemoryPressure;
  now?: () => number;
}

export interface DynamicBufferController {
  attachHls: (hls: DynamicBufferHlsLike | null | undefined) => void;
  setMemoryPressure: (pressure: BufferMemoryPressure) => void;
  setStrategy: (strategy: BufferStrategy) => void;
  getSnapshot: () => DynamicBufferTelemetrySnapshot;
  dispose: () => void;
}

const BUFFER_STRATEGY_STORAGE_KEY = 'player_buffer_strategy_v1';
const BUFFER_SETTING_NAME = 'dynamic-buffer';
const STALL_WINDOW_MS = 120_000;
const STALL_DEBOUNCE_MS = 1_500;
const STALL_DECAY_GRACE_MS = 45_000;
const STALL_DECAY_INTERVAL_MS = 15_000;
const STALL_DECAY_STEP_SECONDS = 5;
const MAX_STALL_BOOST_SECONDS = 90;
const MIN_REAL_LOAD_SAMPLE_MS = 5;
const IN_FLIGHT_WATCHDOG_INTERVAL_MS = 1_000;

const HLS_EVENTS = {
  FRAG_LOADING: 'hlsFragLoading',
  FRAG_LOADED: 'hlsFragLoaded',
  FRAG_LOAD_EMERGENCY_ABORTED: 'hlsFragLoadEmergencyAborted',
  LEVEL_LOADED: 'hlsLevelLoaded',
  ERROR: 'hlsError',
  DESTROYING: 'hlsDestroying',
} as const;

const HLS_ERROR_DETAILS = {
  BUFFER_FULL_ERROR: 'bufferFullError',
  BUFFER_STALLED_ERROR: 'bufferStalledError',
  FRAG_LOAD_ERROR: 'fragLoadError',
  FRAG_LOAD_TIMEOUT: 'fragLoadTimeOut',
} as const;

type TierConfig = {
  maxBufferLength: number;
  maxBufferSize: number;
  maxMaxBufferLength: number;
  backBufferLength: number;
};

type DeviceBufferProfile = {
  tiers: Record<SourceSpeedTier, TierConfig>;
  pauseBonusSeconds: number;
  hardMaxSeconds: number;
  hardMaxBytes: number;
  aggressiveTargetSeconds: number;
  balancedTargetSeconds: number;
  balancedMaxBytes: number;
};

// 现代桌面（16GB+ 等常规 PC）：浏览器主要受单标签 MSE SourceBuffer 配额限制，
// 放宽至 120MB~500MB / 60s~480s，并由 BUFFER_FULL_ERROR 自动降档兜底。
const DESKTOP_PROFILE: DeviceBufferProfile = {
  tiers: {
    fast: {
      maxBufferLength: 60,
      maxBufferSize: 120 * 1000 * 1000,
      maxMaxBufferLength: 120,
      backBufferLength: 45,
    },
    normal: {
      maxBufferLength: 90,
      maxBufferSize: 180 * 1000 * 1000,
      maxMaxBufferLength: 240,
      backBufferLength: 60,
    },
    slow: {
      maxBufferLength: 180,
      maxBufferSize: 300 * 1000 * 1000,
      maxMaxBufferLength: 360,
      backBufferLength: 60,
    },
    very_slow: {
      maxBufferLength: 300,
      maxBufferSize: 450 * 1000 * 1000,
      maxMaxBufferLength: 480,
      backBufferLength: 90,
    },
  },
  pauseBonusSeconds: 90,
  hardMaxSeconds: 480,
  hardMaxBytes: 500 * 1000 * 1000,
  aggressiveTargetSeconds: 300,
  balancedTargetSeconds: 60,
  balancedMaxBytes: 120 * 1000 * 1000,
};

// 低内存桌面设备（navigator.deviceMemory <= 4GB）
const LOW_MEM_DESKTOP_PROFILE: DeviceBufferProfile = {
  tiers: {
    fast: {
      maxBufferLength: 45,
      maxBufferSize: 80 * 1000 * 1000,
      maxMaxBufferLength: 90,
      backBufferLength: 30,
    },
    normal: {
      maxBufferLength: 60,
      maxBufferSize: 120 * 1000 * 1000,
      maxMaxBufferLength: 180,
      backBufferLength: 30,
    },
    slow: {
      maxBufferLength: 120,
      maxBufferSize: 180 * 1000 * 1000,
      maxMaxBufferLength: 240,
      backBufferLength: 45,
    },
    very_slow: {
      maxBufferLength: 180,
      maxBufferSize: 240 * 1000 * 1000,
      maxMaxBufferLength: 300,
      backBufferLength: 45,
    },
  },
  pauseBonusSeconds: 45,
  hardMaxSeconds: 300,
  hardMaxBytes: 250 * 1000 * 1000,
  aggressiveTargetSeconds: 180,
  balancedTargetSeconds: 45,
  balancedMaxBytes: 80 * 1000 * 1000,
};

const ANDROID_PROFILE: DeviceBufferProfile = {
  tiers: {
    fast: {
      maxBufferLength: 35,
      maxBufferSize: 55 * 1000 * 1000,
      maxMaxBufferLength: 75,
      backBufferLength: 20,
    },
    normal: {
      maxBufferLength: 45,
      maxBufferSize: 70 * 1000 * 1000,
      maxMaxBufferLength: 180,
      backBufferLength: 20,
    },
    slow: {
      maxBufferLength: 90,
      maxBufferSize: 100 * 1000 * 1000,
      maxMaxBufferLength: 180,
      backBufferLength: 25,
    },
    very_slow: {
      maxBufferLength: 120,
      maxBufferSize: 130 * 1000 * 1000,
      maxMaxBufferLength: 180,
      backBufferLength: 25,
    },
  },
  pauseBonusSeconds: 30,
  hardMaxSeconds: 180,
  hardMaxBytes: 140 * 1000 * 1000,
  aggressiveTargetSeconds: 120,
  balancedTargetSeconds: 35,
  balancedMaxBytes: 55 * 1000 * 1000,
};

const IOS_PROFILE: DeviceBufferProfile = {
  tiers: {
    fast: {
      maxBufferLength: 25,
      maxBufferSize: 45 * 1000 * 1000,
      maxMaxBufferLength: 60,
      backBufferLength: 15,
    },
    normal: {
      maxBufferLength: 30,
      maxBufferSize: 60 * 1000 * 1000,
      maxMaxBufferLength: 120,
      backBufferLength: 15,
    },
    slow: {
      maxBufferLength: 60,
      maxBufferSize: 80 * 1000 * 1000,
      maxMaxBufferLength: 120,
      backBufferLength: 15,
    },
    very_slow: {
      maxBufferLength: 90,
      maxBufferSize: 100 * 1000 * 1000,
      maxMaxBufferLength: 120,
      backBufferLength: 15,
    },
  },
  pauseBonusSeconds: 25,
  hardMaxSeconds: 120,
  hardMaxBytes: 110 * 1000 * 1000,
  aggressiveTargetSeconds: 90,
  balancedTargetSeconds: 25,
  balancedMaxBytes: 45 * 1000 * 1000,
};

const MEMORY_PRESSURE_CAPS: Record<
  Exclude<BufferMemoryPressure, 'low'>,
  {
    maxBufferLength: number;
    backBufferLength: number;
    maxBufferSize: number;
    maxMaxBufferLength: number;
    maxTimeToFirstByteMs: number;
    maxLoadTimeMs: number;
  }
> = {
  medium: {
    maxBufferLength: 5,
    backBufferLength: 2,
    maxBufferSize: 20 * 1000 * 1000,
    maxMaxBufferLength: 60,
    maxTimeToFirstByteMs: 8000,
    maxLoadTimeMs: 30000,
  },
  high: {
    maxBufferLength: 3,
    backBufferLength: 1,
    maxBufferSize: 12 * 1000 * 1000,
    maxMaxBufferLength: 30,
    maxTimeToFirstByteMs: 8000,
    maxLoadTimeMs: 30000,
  },
  critical: {
    maxBufferLength: 2,
    backBufferLength: 0.5,
    maxBufferSize: 8 * 1000 * 1000,
    maxMaxBufferLength: 10,
    maxTimeToFirstByteMs: 3000,
    maxLoadTimeMs: 30000,
  },
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function readDeviceMemoryGB(): number | undefined {
  if (typeof navigator === 'undefined') return undefined;
  const nav = navigator as Navigator & { deviceMemory?: number };
  return typeof nav.deviceMemory === 'number' &&
    Number.isFinite(nav.deviceMemory) &&
    nav.deviceMemory > 0
    ? nav.deviceMemory
    : undefined;
}

function getDeviceProfile(deviceInfo: BufferDeviceInfo): DeviceBufferProfile {
  if (!deviceInfo.isMobile) {
    const memoryGB = deviceInfo.deviceMemoryGB ?? readDeviceMemoryGB();
    if (typeof memoryGB === 'number' && memoryGB <= 4) {
      return LOW_MEM_DESKTOP_PROFILE;
    }
    return DESKTOP_PROFILE;
  }
  if (deviceInfo.isIOS) return IOS_PROFILE;
  return ANDROID_PROFILE;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : null;
}

interface NetworkInformationLike {
  effectiveType?: string;
  downlink?: number;
  saveData?: boolean;
  addEventListener?: (type: string, listener: () => void) => void;
  removeEventListener?: (type: string, listener: () => void) => void;
}

function getNavigatorConnection(): NetworkInformationLike | null {
  if (typeof navigator === 'undefined') return null;
  const nav = navigator as Navigator & {
    connection?: NetworkInformationLike;
  };
  return nav.connection ?? null;
}

export function readNetworkHint(): NetworkHint {
  const connection = getNavigatorConnection();
  if (!connection) return {};
  return {
    effectiveType:
      typeof connection.effectiveType === 'string'
        ? connection.effectiveType
        : undefined,
    downlinkMbps:
      typeof connection.downlink === 'number' &&
      Number.isFinite(connection.downlink)
        ? connection.downlink
        : undefined,
    saveData: connection.saveData === true,
  };
}

export function readBufferStrategyPreference(): BufferStrategy {
  if (typeof localStorage === 'undefined') return 'auto';
  try {
    const raw = localStorage.getItem(BUFFER_STRATEGY_STORAGE_KEY);
    if (raw === 'auto' || raw === 'aggressive' || raw === 'balanced') {
      return raw;
    }
    return 'auto';
  } catch {
    return 'auto';
  }
}

export function saveBufferStrategyPreference(strategy: BufferStrategy): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(BUFFER_STRATEGY_STORAGE_KEY, strategy);
  } catch {
    /* 存储不可用时忽略，不影响播放缓冲 */
  }
}

export function getForwardBufferedSeconds(
  video: Pick<HTMLMediaElement, 'buffered' | 'currentTime'> | null | undefined,
): number {
  if (!video || !video.buffered) return 0;
  const { buffered, currentTime } = video;
  const pos = Number.isFinite(currentTime) ? currentTime : 0;

  try {
    for (let i = 0; i < buffered.length; i += 1) {
      const start = buffered.start(i);
      const end = buffered.end(i);
      if (pos >= start - 0.1 && pos <= end) {
        return Math.max(0, end - pos);
      }
    }
  } catch {
    return 0;
  }

  return 0;
}

export function classifySourceSpeedTier(
  input: SpeedClassificationInput,
): SourceSpeedTier {
  const rate = Math.max(
    1,
    Number.isFinite(input.playbackRate) ? input.playbackRate : 1,
  );
  const candidates = [input.ewmaSpeedRatio, input.inFlightSlowRatio].filter(
    (v): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0,
  );
  const rawRatio = candidates.length > 0 ? Math.min(...candidates) : null;
  const effectiveMargin = rawRatio !== null ? rawRatio / rate : null;
  const ttfb =
    typeof input.ewmaTtfbMs === 'number' && Number.isFinite(input.ewmaTtfbMs)
      ? input.ewmaTtfbMs
      : null;

  if (
    input.recentStallsCount >= 2 ||
    (effectiveMargin !== null && effectiveMargin < 1.4) ||
    (ttfb !== null && ttfb >= 2500)
  ) {
    return 'very_slow';
  }

  if (
    input.recentStallsCount >= 1 ||
    (effectiveMargin !== null && effectiveMargin < 2.5) ||
    (ttfb !== null && ttfb >= 1200)
  ) {
    return 'slow';
  }

  if (effectiveMargin === null) {
    const hint = input.networkHint;
    if (
      hint?.effectiveType === '2g' ||
      hint?.effectiveType === 'slow-2g' ||
      (typeof hint?.downlinkMbps === 'number' &&
        hint.downlinkMbps > 0 &&
        hint.downlinkMbps < 1.5)
    ) {
      return 'very_slow';
    }
    if (
      hint?.effectiveType === '3g' ||
      (typeof hint?.downlinkMbps === 'number' &&
        hint.downlinkMbps > 0 &&
        hint.downlinkMbps < 3.5)
    ) {
      return 'slow';
    }
    return 'normal';
  }

  if (
    effectiveMargin >= 5.0 &&
    (ttfb === null || ttfb < 600) &&
    input.sampleCount >= 2
  ) {
    return 'fast';
  }

  return 'normal';
}

function formatTooltip(
  strategy: BufferStrategy,
  speedTier: SourceSpeedTier,
  maxBufferLength: number,
  options: {
    memoryPressure: BufferMemoryPressure;
    pauseBonusApplied: boolean;
    isLive: boolean;
    stallBoostSeconds: number;
  },
): string {
  if (options.memoryPressure !== 'low') {
    return `内存保护 · ${maxBufferLength}s`;
  }
  if (strategy === 'aggressive') {
    return options.pauseBonusApplied
      ? `强力 · 暂停预缓 ${maxBufferLength}s`
      : `强力 · ${maxBufferLength}s`;
  }
  if (strategy === 'balanced') {
    return `省流 · ${maxBufferLength}s`;
  }
  if (options.isLive) {
    return `智能 · 直播 ${maxBufferLength}s`;
  }
  if (options.pauseBonusApplied) {
    return `智能 · 暂停预缓 ${maxBufferLength}s`;
  }
  if (options.stallBoostSeconds > 0 && speedTier !== 'fast') {
    return `智能 · 抗卡顿 ${maxBufferLength}s`;
  }

  switch (speedTier) {
    case 'fast':
      return `智能 · 流畅 ${maxBufferLength}s`;
    case 'slow':
      return `智能 · 慢源增缓 ${maxBufferLength}s`;
    case 'very_slow':
      return `智能 · 极慢强缓 ${maxBufferLength}s`;
    default:
      return `智能 · 标准 ${maxBufferLength}s`;
  }
}

export function computeDynamicBufferTarget(
  input: DynamicBufferInput,
): DynamicBufferPlan {
  const profile = getDeviceProfile(input.deviceInfo);
  const { isMobile } = input.deviceInfo;

  if (input.memoryPressure !== 'low') {
    const cap = MEMORY_PRESSURE_CAPS[input.memoryPressure];
    const maxBufferLength =
      typeof input.quotaCapSeconds === 'number' && input.quotaCapSeconds > 0
        ? Math.min(cap.maxBufferLength, input.quotaCapSeconds)
        : cap.maxBufferLength;
    const maxMaxBufferLength =
      typeof input.quotaCapSeconds === 'number' && input.quotaCapSeconds > 0
        ? Math.min(cap.maxMaxBufferLength, input.quotaCapSeconds)
        : cap.maxMaxBufferLength;

    return {
      speedTier: input.speedTier,
      maxBufferLength,
      maxMaxBufferLength,
      maxBufferSize: cap.maxBufferSize,
      backBufferLength: cap.backBufferLength,
      maxTimeToFirstByteMs: cap.maxTimeToFirstByteMs,
      maxLoadTimeMs: cap.maxLoadTimeMs,
      tooltip: formatTooltip(input.strategy, input.speedTier, maxBufferLength, {
        memoryPressure: input.memoryPressure,
        pauseBonusApplied: false,
        isLive: input.isLive,
        stallBoostSeconds: input.stallBoostSeconds,
      }),
    };
  }

  const rate = clamp(
    Number.isFinite(input.playbackRate) ? input.playbackRate : 1,
    1,
    2,
  );
  const effectiveTier: SourceSpeedTier =
    input.strategy === 'aggressive'
      ? 'very_slow'
      : input.strategy === 'balanced'
        ? input.stallBoostSeconds > 0
          ? 'normal'
          : 'fast'
        : input.saveData && input.stallBoostSeconds <= 0
          ? 'fast'
          : input.speedTier;

  const baseTierConfig = profile.tiers[effectiveTier];
  let maxBufferLength = baseTierConfig.maxBufferLength;
  let maxMaxBufferLength = baseTierConfig.maxMaxBufferLength;
  let maxBufferSize = baseTierConfig.maxBufferSize;
  let backBufferLength = baseTierConfig.backBufferLength;

  let pauseBonusApplied = false;

  if (input.strategy === 'balanced') {
    maxBufferLength = Math.round(
      profile.balancedTargetSeconds * (rate > 1.25 ? 1.2 : 1),
    );
    maxMaxBufferLength = Math.max(maxBufferLength, isMobile ? 60 : 75);
    maxBufferSize = profile.balancedMaxBytes;
  } else {
    if (input.strategy === 'aggressive') {
      maxBufferLength = profile.aggressiveTargetSeconds;
      maxMaxBufferLength = profile.hardMaxSeconds;
      maxBufferSize = profile.hardMaxBytes;
    }

    // 高倍速播放消耗缓冲更快，按倍速等比扩展媒体秒数窗口
    if (rate > 1.05) {
      maxBufferLength = Math.round(maxBufferLength * rate);
    }

    if (input.stallBoostSeconds > 0 && effectiveTier !== 'fast') {
      maxBufferLength += Math.round(input.stallBoostSeconds);
    }

    // 暂停时如果已经起播且源并不快，继续提前囤一段缓冲，恢复播放后不容易再次卡顿
    const hasSpeedEvidence =
      (input.sampleCount ?? 1) > 0 || input.stallBoostSeconds > 0;
    const allowPauseBonus =
      input.isPaused &&
      (input.hasRenderedPlayback ?? true) &&
      !input.isLive &&
      !input.saveData &&
      (input.strategy === 'aggressive' ||
        (effectiveTier !== 'fast' && hasSpeedEvidence));
    if (allowPauseBonus) {
      maxBufferLength += profile.pauseBonusSeconds;
      pauseBonusApplied = true;
    }

    maxBufferLength = clamp(
      maxBufferLength,
      profile.tiers.fast.maxBufferLength,
      profile.hardMaxSeconds,
    );
    maxMaxBufferLength = clamp(
      Math.max(maxMaxBufferLength, maxBufferLength),
      maxBufferLength,
      profile.hardMaxSeconds,
    );

    if (
      typeof input.estimatedBitrateBps === 'number' &&
      Number.isFinite(input.estimatedBitrateBps) &&
      input.estimatedBitrateBps > 0
    ) {
      const neededBytes = Math.ceil(
        (input.estimatedBitrateBps * maxBufferLength) / 8,
      );
      maxBufferSize = clamp(
        Math.max(maxBufferSize, neededBytes),
        baseTierConfig.maxBufferSize,
        profile.hardMaxBytes,
      );
    }
  }

  if (input.isLive) {
    maxBufferLength = Math.min(maxBufferLength, 45);
    maxMaxBufferLength = Math.min(maxMaxBufferLength, 60);
    backBufferLength = Math.min(backBufferLength, 15);
  }

  if (
    typeof input.quotaCapSeconds === 'number' &&
    Number.isFinite(input.quotaCapSeconds) &&
    input.quotaCapSeconds > 0
  ) {
    maxBufferLength = Math.min(maxBufferLength, input.quotaCapSeconds);
    maxMaxBufferLength = Math.min(maxMaxBufferLength, input.quotaCapSeconds);
    maxBufferSize = Math.min(maxBufferSize, 150 * 1000 * 1000);
  }

  const isSlowNetwork =
    effectiveTier === 'slow' || effectiveTier === 'very_slow';
  const maxTimeToFirstByteMs = isSlowNetwork
    ? isMobile
      ? 10000
      : 15000
    : isMobile
      ? 6000
      : 10000;
  const maxLoadTimeMs = isSlowNetwork
    ? isMobile
      ? 90000
      : 120000
    : isMobile
      ? 60000
      : 90000;

  return {
    speedTier: effectiveTier,
    maxBufferLength,
    maxMaxBufferLength,
    maxBufferSize,
    backBufferLength,
    maxTimeToFirstByteMs,
    maxLoadTimeMs,
    tooltip: formatTooltip(input.strategy, effectiveTier, maxBufferLength, {
      memoryPressure: input.memoryPressure,
      pauseBonusApplied,
      isLive: input.isLive,
      stallBoostSeconds: input.stallBoostSeconds,
    }),
  };
}

function getStrategyLabel(strategy: BufferStrategy): string {
  switch (strategy) {
    case 'aggressive':
      return '强力预缓';
    case 'balanced':
      return '省流标准';
    default:
      return '智能动态';
  }
}

function resolveArtVideo(
  art: DynamicBufferArtLike,
): HTMLVideoElement | null | undefined {
  return art.video || art.$video;
}

function getActiveHlsBitrate(
  hls: DynamicBufferHlsLike | null | undefined,
): number | null {
  if (!hls?.levels || hls.levels.length === 0) return null;
  const idx =
    typeof hls.loadLevel === 'number' && hls.loadLevel >= 0
      ? hls.loadLevel
      : typeof hls.currentLevel === 'number' && hls.currentLevel >= 0
        ? hls.currentLevel
        : -1;
  if (idx < 0 || !hls.levels[idx]) return null;
  const level = hls.levels[idx];
  const bitrate = level.maxBitrate || level.bitrate || 0;
  return bitrate > 0 ? bitrate : null;
}

function applyPlanToHlsConfig(
  hls: DynamicBufferHlsLike | null | undefined,
  plan: DynamicBufferPlan,
): void {
  const config = hls?.config;
  if (!config || typeof config !== 'object') return;

  if (config.maxBufferLength !== plan.maxBufferLength) {
    config.maxBufferLength = plan.maxBufferLength;
  }
  if (config.maxMaxBufferLength !== plan.maxMaxBufferLength) {
    config.maxMaxBufferLength = plan.maxMaxBufferLength;
  }
  if (config.maxBufferSize !== plan.maxBufferSize) {
    config.maxBufferSize = plan.maxBufferSize;
  }
  if (config.backBufferLength !== plan.backBufferLength) {
    config.backBufferLength = plan.backBufferLength;
  }

  const currentPolicy = config.fragLoadPolicy;
  const currentDefault = currentPolicy?.default;
  if (
    currentDefault &&
    typeof currentDefault === 'object' &&
    (currentDefault.maxTimeToFirstByteMs !== plan.maxTimeToFirstByteMs ||
      currentDefault.maxLoadTimeMs !== plan.maxLoadTimeMs)
  ) {
    config.fragLoadPolicy = {
      ...currentPolicy,
      default: {
        ...currentDefault,
        maxTimeToFirstByteMs: plan.maxTimeToFirstByteMs,
        maxLoadTimeMs: plan.maxLoadTimeMs,
      },
    };
  }
}

export function installDynamicBuffer(
  art: DynamicBufferArtLike,
  options: InstallDynamicBufferOptions,
): DynamicBufferController {
  const now = options.now ?? (() => Date.now());
  const deviceInfo = options.deviceInfo;
  let memoryPressure: BufferMemoryPressure =
    options.getMemoryPressure?.() ?? 'low';
  let strategy: BufferStrategy = readBufferStrategyPreference();
  let disposed = false;

  let activeHls: DynamicBufferHlsLike | null = null;
  let unbindHlsEvents: (() => void) | null = null;
  let watchdogTimer: ReturnType<typeof setInterval> | null = null;

  // 每个 HLS 会话的实时网络与卡顿遥测
  let sampleCount = 0;
  let ewmaSpeedRatio: number | null = null;
  let ewmaTtfbMs: number | null = null;
  let ewmaBitrateBps: number | null = null;
  let ewmaThroughputBps: number | null = null;
  let recentStallTimestamps: number[] = [];
  let stallBoostSeconds = 0;
  let lastStallAt = 0;
  let lastDecayAt = 0;
  let inFlightFrag: {
    sn: string | number;
    startedAt: number;
    durationSec: number;
  } | null = null;
  let inFlightSlowRatio: number | null = null;
  let quotaCapSeconds: number | null = null;
  let isLive = false;
  let hasRenderedPlayback = (resolveArtVideo(art)?.readyState ?? 0) >= 2;
  let slowNoticeShown = false;
  let lastTooltipText = '';

  const resetSessionTelemetry = () => {
    sampleCount = 0;
    ewmaSpeedRatio = null;
    ewmaTtfbMs = null;
    ewmaBitrateBps = null;
    ewmaThroughputBps = null;
    recentStallTimestamps = [];
    stallBoostSeconds = 0;
    lastStallAt = 0;
    lastDecayAt = 0;
    inFlightFrag = null;
    inFlightSlowRatio = null;
    quotaCapSeconds = null;
    isLive = false;
    hasRenderedPlayback = (resolveArtVideo(art)?.readyState ?? 0) >= 2;
    slowNoticeShown = false;
  };

  const pruneStalls = (currentNow: number) => {
    recentStallTimestamps = recentStallTimestamps.filter(
      (ts) => currentNow - ts <= STALL_WINDOW_MS,
    );
  };

  const syncWatchdog = () => {
    if (disposed) {
      if (watchdogTimer) {
        clearInterval(watchdogTimer);
        watchdogTimer = null;
      }
      return;
    }
    const needsWatchdog =
      Boolean(activeHls && typeof activeHls.on === 'function') &&
      (inFlightFrag !== null || stallBoostSeconds > 0);
    if (needsWatchdog && !watchdogTimer) {
      watchdogTimer = setInterval(
        runWatchdogTick,
        IN_FLIGHT_WATCHDOG_INTERVAL_MS,
      );
    } else if (!needsWatchdog && watchdogTimer) {
      clearInterval(watchdogTimer);
      watchdogTimer = null;
    }
  };

  const updateSettingTooltip = (tooltip: string) => {
    if (disposed || tooltip === lastTooltipText) return;
    lastTooltipText = tooltip;
    const setting = art.setting;
    if (!setting) return;
    try {
      const existing = setting.find?.(BUFFER_SETTING_NAME);
      if (existing) {
        existing.tooltip = tooltip;
        return;
      }
      setting.update?.({
        name: BUFFER_SETTING_NAME,
        tooltip,
      });
    } catch {
      /* 播放器正在销毁或模拟桩无此方法时忽略 */
    }
  };

  const buildPlan = (currentNow: number): DynamicBufferPlan => {
    pruneStalls(currentNow);
    const video = resolveArtVideo(art);
    const playbackRate = video?.playbackRate ?? 1;
    const isPaused = video?.paused ?? false;
    const networkHint = readNetworkHint();
    const speedTier = classifySourceSpeedTier({
      ewmaSpeedRatio,
      inFlightSlowRatio,
      ewmaTtfbMs,
      recentStallsCount: recentStallTimestamps.length,
      playbackRate,
      sampleCount,
      networkHint,
    });
    const estimatedBitrateBps =
      ewmaBitrateBps ?? getActiveHlsBitrate(activeHls);

    return computeDynamicBufferTarget({
      strategy,
      deviceInfo,
      speedTier,
      playbackRate,
      isPaused,
      hasRenderedPlayback,
      sampleCount,
      isLive,
      stallBoostSeconds,
      estimatedBitrateBps,
      memoryPressure,
      saveData: networkHint.saveData,
      quotaCapSeconds,
    });
  };

  const recomputeAndApply = (options?: { allowNotice?: boolean }) => {
    if (disposed) return buildPlan(now());
    const currentNow = now();
    const plan = buildPlan(currentNow);

    applyPlanToHlsConfig(activeHls, plan);
    updateSettingTooltip(plan.tooltip);

    const video = resolveArtVideo(art);
    if (video) {
      const hint = readNetworkHint();
      const targetPreload =
        memoryPressure !== 'low' || strategy === 'balanced' || hint.saveData
          ? 'metadata'
          : 'auto';
      if (video.preload !== targetPreload) {
        try {
          video.preload = targetPreload;
        } catch {
          /* ignore */
        }
      }
    }

    if (
      options?.allowNotice &&
      strategy === 'auto' &&
      !slowNoticeShown &&
      hasRenderedPlayback &&
      memoryPressure === 'low' &&
      !isLive &&
      (plan.speedTier === 'slow' || plan.speedTier === 'very_slow') &&
      art.notice &&
      !art.notice.show
    ) {
      slowNoticeShown = true;
      art.notice.show = `检测到当前源较慢，已自动加大预缓冲至 ${plan.maxBufferLength}s`;
    }

    syncWatchdog();
    return plan;
  };

  const recordStall = (boostSeconds: number, allowNotice: boolean) => {
    const currentNow = now();
    if (currentNow - lastStallAt >= STALL_DEBOUNCE_MS) {
      recentStallTimestamps.push(currentNow);
      stallBoostSeconds = Math.min(
        MAX_STALL_BOOST_SECONDS,
        stallBoostSeconds + boostSeconds,
      );
      lastStallAt = currentNow;
      lastDecayAt = currentNow;
    }
    recomputeAndApply({ allowNotice });
  };

  function runWatchdogTick() {
    if (disposed) return;
    const currentNow = now();
    let changed = false;

    if (inFlightFrag) {
      const elapsedMs = currentNow - inFlightFrag.startedAt;
      const thresholdMs = Math.max(
        2500,
        inFlightFrag.durationSec * 1000 * 0.65,
      );
      if (elapsedMs > thresholdMs) {
        const nextInFlightRatio = clamp(
          (inFlightFrag.durationSec * 1000) / elapsedMs,
          0.1,
          2.5,
        );
        if (
          inFlightSlowRatio === null ||
          nextInFlightRatio < inFlightSlowRatio - 0.1
        ) {
          inFlightSlowRatio = nextInFlightRatio;
          changed = true;
        }
      }
    }

    if (
      stallBoostSeconds > 0 &&
      lastStallAt > 0 &&
      currentNow - lastStallAt > STALL_DECAY_GRACE_MS &&
      currentNow - lastDecayAt >= STALL_DECAY_INTERVAL_MS
    ) {
      stallBoostSeconds = Math.max(
        0,
        stallBoostSeconds - STALL_DECAY_STEP_SECONDS,
      );
      lastDecayAt = currentNow;
      changed = true;
    }

    if (changed) {
      recomputeAndApply({ allowNotice: true });
    } else {
      syncWatchdog();
    }
  }

  const detachHls = () => {
    unbindHlsEvents?.();
    unbindHlsEvents = null;
    activeHls = null;
    inFlightFrag = null;
    inFlightSlowRatio = null;
    syncWatchdog();
  };

  const attachHls = (hls: DynamicBufferHlsLike | null | undefined) => {
    if (disposed) return;
    if (!hls) {
      detachHls();
      return;
    }
    if (activeHls === hls) {
      recomputeAndApply();
      return;
    }

    detachHls();
    resetSessionTelemetry();
    activeHls = hls;

    if (typeof hls.on === 'function') {
      const onFragLoading = (_event: unknown, data: unknown) => {
        if (disposed) return;
        const record = asRecord(data);
        const frag = asRecord(record?.frag);
        if (!frag) return;
        const sn = frag.sn;
        if (sn === 'initSegment') return;
        const fragType = frag.type;
        if (typeof fragType === 'string' && fragType !== 'main') return;
        const duration =
          typeof frag.duration === 'number' && frag.duration > 0
            ? frag.duration
            : 4;
        inFlightFrag = {
          sn: typeof sn === 'number' || typeof sn === 'string' ? sn : 'unknown',
          startedAt: now(),
          durationSec: duration,
        };
        inFlightSlowRatio = null;
        syncWatchdog();
      };

      const onFragLoaded = (_event: unknown, data: unknown) => {
        if (disposed) return;
        const record = asRecord(data);
        const frag = asRecord(record?.frag);
        const part = asRecord(record?.part);
        const stats =
          asRecord(part?.stats) ??
          asRecord(frag?.stats) ??
          asRecord(record?.stats);
        const sn = frag?.sn;
        const fragType = frag?.type;
        if (
          !frag ||
          sn === 'initSegment' ||
          (typeof fragType === 'string' && fragType !== 'main')
        ) {
          return;
        }

        const fallbackStart = inFlightFrag?.startedAt;
        inFlightFrag = null;
        inFlightSlowRatio = null;

        if (stats?.aborted === true) {
          syncWatchdog();
          return;
        }

        const durationSec =
          typeof part?.duration === 'number' && part.duration > 0
            ? part.duration
            : typeof frag.duration === 'number' && frag.duration > 0
              ? frag.duration
              : 0;
        if (durationSec <= 0) {
          syncWatchdog();
          return;
        }

        const loading = asRecord(stats?.loading);
        const start =
          typeof loading?.start === 'number' ? loading.start : fallbackStart;
        const first = typeof loading?.first === 'number' ? loading.first : 0;
        const end = typeof loading?.end === 'number' ? loading.end : undefined;
        const totalLoadMs =
          typeof start === 'number' && typeof end === 'number' && end > start
            ? end - start
            : 0;

        // 小于 5ms 多为浏览器内存/磁盘缓存命中或同步桩，避免污染真实 CDN 测速
        if (totalLoadMs < MIN_REAL_LOAD_SAMPLE_MS) {
          syncWatchdog();
          return;
        }

        sampleCount += 1;
        const rawRatio = clamp((durationSec * 1000) / totalLoadMs, 0.1, 20);
        const alphaRatio =
          ewmaSpeedRatio === null ? 1 : rawRatio < ewmaSpeedRatio ? 0.45 : 0.18;
        ewmaSpeedRatio =
          ewmaSpeedRatio === null
            ? rawRatio
            : ewmaSpeedRatio + alphaRatio * (rawRatio - ewmaSpeedRatio);

        if (typeof start === 'number' && first >= start) {
          const ttfbSample = clamp(first - start, 0, totalLoadMs);
          const alphaTtfb =
            ewmaTtfbMs === null ? 1 : ttfbSample > ewmaTtfbMs ? 0.4 : 0.2;
          ewmaTtfbMs =
            ewmaTtfbMs === null
              ? ttfbSample
              : ewmaTtfbMs + alphaTtfb * (ttfbSample - ewmaTtfbMs);
        }

        const loadedBytes =
          typeof stats?.loaded === 'number' && stats.loaded > 0
            ? stats.loaded
            : 0;
        if (loadedBytes > 0) {
          const sampleBitrate = (loadedBytes * 8) / durationSec;
          ewmaBitrateBps =
            ewmaBitrateBps === null
              ? sampleBitrate
              : ewmaBitrateBps * 0.7 + sampleBitrate * 0.3;

          const sampleThroughput = (loadedBytes * 8 * 1000) / totalLoadMs;
          const alphaTp =
            ewmaThroughputBps === null
              ? 1
              : sampleThroughput < ewmaThroughputBps
                ? 0.45
                : 0.2;
          ewmaThroughputBps =
            ewmaThroughputBps === null
              ? sampleThroughput
              : ewmaThroughputBps +
                alphaTp * (sampleThroughput - ewmaThroughputBps);
        }

        recomputeAndApply({ allowNotice: true });
      };

      const onLevelLoaded = (_event: unknown, data: unknown) => {
        if (disposed) return;
        const record = asRecord(data);
        const details = asRecord(record?.details);
        if (typeof details?.live === 'boolean' && details.live !== isLive) {
          isLive = details.live;
          recomputeAndApply();
        }
      };

      const onEmergencyAbort = () => {
        if (disposed) return;
        inFlightFrag = null;
        inFlightSlowRatio = null;
        recordStall(20, true);
      };

      const onHlsError = (_event: unknown, data: unknown) => {
        if (disposed) return;
        const record = asRecord(data);
        const details = record?.details;
        if (details === HLS_ERROR_DETAILS.BUFFER_FULL_ERROR) {
          const forwardSec = getForwardBufferedSeconds(resolveArtVideo(art));
          const configMaxMax =
            typeof hls.config?.maxMaxBufferLength === 'number'
              ? hls.config.maxMaxBufferLength
              : 60;
          const nextCap = Math.max(
            15,
            Math.floor(Math.min(configMaxMax, Math.max(20, forwardSec * 0.85))),
          );
          quotaCapSeconds =
            quotaCapSeconds === null
              ? nextCap
              : Math.min(quotaCapSeconds, nextCap);
          stallBoostSeconds = 0;
          recomputeAndApply();
          return;
        }

        if (details === HLS_ERROR_DETAILS.BUFFER_STALLED_ERROR) {
          const video = resolveArtVideo(art);
          if (!video?.seeking && !video?.paused) {
            recordStall(30, true);
          }
          return;
        }

        if (
          details === HLS_ERROR_DETAILS.FRAG_LOAD_TIMEOUT ||
          details === HLS_ERROR_DETAILS.FRAG_LOAD_ERROR
        ) {
          inFlightFrag = null;
          inFlightSlowRatio = null;
          recordStall(20, true);
        }
      };

      const onDestroying = () => {
        if (activeHls === hls) {
          detachHls();
        }
      };

      hls.on(HLS_EVENTS.FRAG_LOADING, onFragLoading);
      hls.on(HLS_EVENTS.FRAG_LOADED, onFragLoaded);
      hls.on(HLS_EVENTS.LEVEL_LOADED, onLevelLoaded);
      hls.on(HLS_EVENTS.FRAG_LOAD_EMERGENCY_ABORTED, onEmergencyAbort);
      hls.on(HLS_EVENTS.ERROR, onHlsError);
      hls.on(HLS_EVENTS.DESTROYING, onDestroying);

      unbindHlsEvents = () => {
        hls.off?.(HLS_EVENTS.FRAG_LOADING, onFragLoading);
        hls.off?.(HLS_EVENTS.FRAG_LOADED, onFragLoaded);
        hls.off?.(HLS_EVENTS.LEVEL_LOADED, onLevelLoaded);
        hls.off?.(HLS_EVENTS.FRAG_LOAD_EMERGENCY_ABORTED, onEmergencyAbort);
        hls.off?.(HLS_EVENTS.ERROR, onHlsError);
        hls.off?.(HLS_EVENTS.DESTROYING, onDestroying);
      };
    }

    recomputeAndApply();
  };

  // 注册 Artplayer 设置项（默认智能动态）
  const initialPlan = buildPlan(now());
  lastTooltipText = initialPlan.tooltip;
  art.setting?.add?.({
    name: BUFFER_SETTING_NAME,
    html: '动态缓冲',
    tooltip: initialPlan.tooltip,
    width: 240,
    selector: (['auto', 'aggressive', 'balanced'] as const).map((value) => ({
      html:
        value === 'auto'
          ? '智能动态（推荐）'
          : value === 'aggressive'
            ? '强力预缓'
            : '标准省流',
      value,
      default: strategy === value,
    })),
    onSelect(item) {
      const next = item?.value;
      if (next !== 'auto' && next !== 'aggressive' && next !== 'balanced') {
        return lastTooltipText;
      }
      strategy = next;
      saveBufferStrategyPreference(next);
      const updated = recomputeAndApply();
      if (art.notice) {
        art.notice.show = `缓冲模式已切换为${getStrategyLabel(next)}（上限 ${updated.maxBufferLength}s）`;
      }
      return updated.tooltip;
    },
  });
  recomputeAndApply();

  // 监听播放器视频状态变化
  const video = resolveArtVideo(art);
  const onPlaying = () => {
    hasRenderedPlayback = true;
    recomputeAndApply();
  };
  const onCanPlay = () => {
    hasRenderedPlayback = true;
    recomputeAndApply();
  };
  const onPause = () => {
    recomputeAndApply();
  };
  const onRateChange = () => {
    recomputeAndApply();
  };
  const onSeeking = () => {
    inFlightFrag = null;
    inFlightSlowRatio = null;
    syncWatchdog();
  };
  const onWaiting = () => {
    const targetVideo = resolveArtVideo(art);
    if (
      !targetVideo ||
      targetVideo.paused ||
      targetVideo.seeking ||
      targetVideo.ended ||
      !hasRenderedPlayback
    ) {
      return;
    }
    recordStall(30, true);
  };

  video?.addEventListener('playing', onPlaying);
  video?.addEventListener('canplay', onCanPlay);
  video?.addEventListener('pause', onPause);
  video?.addEventListener('ratechange', onRateChange);
  video?.addEventListener('seeking', onSeeking);
  video?.addEventListener('waiting', onWaiting);

  const connection = getNavigatorConnection();
  const onConnectionChange = () => {
    recomputeAndApply();
  };
  connection?.addEventListener?.('change', onConnectionChange);

  const onArtRestart = () => {
    const currentVideo = resolveArtVideo(art) as
      | (HTMLVideoElement & { hls?: DynamicBufferHlsLike | null })
      | null
      | undefined;
    if (currentVideo?.hls && currentVideo.hls !== activeHls) {
      attachHls(currentVideo.hls);
    } else {
      recomputeAndApply();
    }
  };

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    if (watchdogTimer) {
      clearInterval(watchdogTimer);
      watchdogTimer = null;
    }
    detachHls();
    video?.removeEventListener('playing', onPlaying);
    video?.removeEventListener('canplay', onCanPlay);
    video?.removeEventListener('pause', onPause);
    video?.removeEventListener('ratechange', onRateChange);
    video?.removeEventListener('seeking', onSeeking);
    video?.removeEventListener('waiting', onWaiting);
    connection?.removeEventListener?.('change', onConnectionChange);
    art.off?.('restart', onArtRestart);
    art.off?.('destroy', dispose);
  };

  art.on?.('restart', onArtRestart);
  art.on?.('destroy', dispose);

  // 若创建播放器时 video.hls 已经挂载，立即接管
  const existingHls = (
    video as (HTMLVideoElement & { hls?: DynamicBufferHlsLike | null }) | null
  )?.hls;
  if (existingHls) {
    attachHls(existingHls);
  }

  return {
    attachHls,
    setMemoryPressure(nextPressure: BufferMemoryPressure) {
      if (memoryPressure === nextPressure) return;
      memoryPressure = nextPressure;
      recomputeAndApply();
    },
    setStrategy(nextStrategy: BufferStrategy) {
      if (strategy === nextStrategy) return;
      strategy = nextStrategy;
      saveBufferStrategyPreference(nextStrategy);
      recomputeAndApply();
    },
    getSnapshot(): DynamicBufferTelemetrySnapshot {
      const currentNow = now();
      const plan = buildPlan(currentNow);
      return {
        strategy,
        speedTier: plan.speedTier,
        sampleCount,
        ewmaSpeedRatio,
        ewmaTtfbMs,
        ewmaBitrateBps,
        ewmaThroughputBps,
        recentStallsCount: recentStallTimestamps.length,
        stallBoostSeconds,
        isPaused: resolveArtVideo(art)?.paused ?? false,
        isLive,
        memoryPressure,
        quotaCapSeconds,
        plan,
      };
    },
    dispose,
  };
}
