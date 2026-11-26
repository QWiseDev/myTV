/**
 * 弹幕配置工具
 * 管理 Artplayer 弹幕插件的配置逻辑
 */

import type { DanmakuItemLike } from './danmakuRuntime';

interface DevicePerformance {
  score: number;
  level: 'high' | 'medium' | 'low';
}

interface DanmakuPluginConfig {
  danmaku: DanmakuItemLike[];
  speed: number;
  opacity: number;
  fontSize: number;
  color: string;
  mode: 0 | 1 | 2;
  modes: Array<0 | 1 | 2>;
  margin: [number | `${number}%`, number | `${number}%`];
  visible: boolean;
  emitter: boolean;
  maxLength: number;
  lockTime: number;
  theme: 'dark' | 'light';
  width: number;
  antiOverlap: boolean;
  synchronousPlayback: boolean;
  heatmap: boolean;
  filter?: (danmaku: DanmakuItemLike) => boolean;
  beforeEmit?: (danmaku: DanmakuItemLike) => boolean;
}

interface PerformanceWithMemory extends Performance {
  memory?: {
    jsHeapSizeLimit?: number;
  };
}

const MAX_DISPLAY_DANMAKU_LENGTH = 200;
const MAX_DANMAKU_EMOJI_COUNT = 5;

/**
 * 检测设备性能等级
 */
export function getDevicePerformance(isMobile: boolean): DevicePerformance {
  const hardwareConcurrency = navigator.hardwareConcurrency || 2;
  const memory =
    (performance as PerformanceWithMemory).memory?.jsHeapSizeLimit || 0;

  // 非 Chromium 浏览器无 performance.memory，给予中性内存分，避免误判为低端设备
  const memoryScore =
    memory > 0 ? Math.min(memory / (1024 * 1024 * 1024), 1) * 0.3 : 0.15;

  let score = 0;
  score += Math.min(hardwareConcurrency / 4, 1) * 0.5;
  score += memoryScore;
  score += (isMobile ? 0.2 : 0.5) * 0.2;

  const level = score > 0.7 ? 'high' : score > 0.4 ? 'medium' : 'low';

  return { score, level };
}

/**
 * 从 localStorage 加载弹幕配置
 */
export function loadDanmakuConfigFromStorage(): Partial<DanmakuPluginConfig> {
  const read = (key: string, fallback: unknown): unknown => {
    try {
      return JSON.parse(
        localStorage.getItem(`danmaku_${key}`) || JSON.stringify(fallback),
      );
    } catch {
      return fallback;
    }
  };
  const number = (key: string, fallback: number, min: number, max: number) => {
    const value = Number(read(key, fallback));
    return Number.isFinite(value)
      ? Math.min(max, Math.max(min, value))
      : fallback;
  };
  const modes = read('modes', [0, 1, 2]);
  const margin = read('margin', [10, '75%']);
  const validMargin =
    Array.isArray(margin) &&
    margin.length === 2 &&
    margin.every(
      (value) =>
        (typeof value === 'number' && Number.isFinite(value) && value >= 0) ||
        (typeof value === 'string' && /^\d{1,2}%$|^100%$/.test(value)),
    );
  return {
    speed: number('speed', 5, 1, 10),
    opacity: number('opacity', 0.5, 0, 1),
    fontSize: number('fontSize', 20, 12, 60),
    modes: Array.isArray(modes)
      ? modes.filter((mode): mode is 0 | 1 | 2 => [0, 1, 2].includes(mode))
      : [0, 1, 2],
    margin: validMargin
      ? (margin as DanmakuPluginConfig['margin'])
      : [10, '75%'],
    visible: read('visible', true) !== false,
    antiOverlap: read('antiOverlap', true) !== false,
    synchronousPlayback: read('synchronousPlayback', true) !== false,
  };
}

export function saveDanmakuConfigToStorage(option: Record<string, unknown>) {
  try {
    for (const key of [
      'speed',
      'opacity',
      'fontSize',
      'modes',
      'margin',
      'antiOverlap',
      'synchronousPlayback',
    ]) {
      if (option[key] !== undefined)
        localStorage.setItem(`danmaku_${key}`, JSON.stringify(option[key]));
    }
  } catch {
    /* 存储不可用时仍允许本次播放调整。 */
  }
}

/**
 * 获取优化的弹幕插件配置
 */
export function getOptimizedDanmakuConfig(
  isMobile: boolean,
): Partial<DanmakuPluginConfig> {
  // 保持性能分级探测函数导出以兼容调用与监测
  getDevicePerformance(isMobile);
  const storageConfig = loadDanmakuConfigFromStorage();

  return {
    danmaku: [], // 初始为空数组，后续通过load方法加载
    ...storageConfig,
    color: '#FFFFFF',
    mode: 0 as const,
    emitter: false,
    maxLength: MAX_DISPLAY_DANMAKU_LENGTH,
    lockTime: 1, // 插件约束范围 [1, 60]
    theme: 'dark' as const,
    width: 300,

    antiOverlap: storageConfig.antiOverlap,
    synchronousPlayback: storageConfig.synchronousPlayback,
    heatmap: false,

    // 过滤刷屏超长弹幕与密集 emoji，避免正常弹幕被随机/过短阈值误伤
    filter: (danmaku) => {
      if (danmaku.text && danmaku.text.length > MAX_DISPLAY_DANMAKU_LENGTH) {
        return false;
      }

      const emojiRegex = /[\u{1F300}-\u{1F9FF}]/gu;
      const emojiCount = (danmaku.text?.match(emojiRegex) || []).length;
      if (emojiCount > MAX_DANMAKU_EMOJI_COUNT) return false;

      return true;
    },

    // artplayer-plugin-danmuku 约定 beforeEmit 必须严格返回 true 才允许发射
    beforeEmit: (danmaku) => {
      if (danmaku.text && danmaku.text.length > MAX_DISPLAY_DANMAKU_LENGTH) {
        danmaku.text =
          danmaku.text.substring(0, MAX_DISPLAY_DANMAKU_LENGTH) + '...';
      }
      return true;
    },
  };
}
