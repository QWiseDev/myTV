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
  beforeEmit?: (danmaku: DanmakuItemLike) => DanmakuItemLike;
}

interface PerformanceWithMemory extends Performance {
  memory?: {
    jsHeapSizeLimit?: number;
  };
}

/**
 * 检测设备性能等级
 */
export function getDevicePerformance(isMobile: boolean): DevicePerformance {
  const hardwareConcurrency = navigator.hardwareConcurrency || 2;
  const memory =
    (performance as PerformanceWithMemory).memory?.jsHeapSizeLimit || 0;

  // 简单性能评分（0-1）
  let score = 0;
  score += Math.min(hardwareConcurrency / 4, 1) * 0.5; // CPU核心数权重
  score += Math.min(memory / (1024 * 1024 * 1024), 1) * 0.3; // 内存权重
  score += (isMobile ? 0.2 : 0.5) * 0.2; // 设备类型权重

  const level = score > 0.7 ? 'high' : score > 0.4 ? 'medium' : 'low';

  return { score, level };
}

/**
 * 从 localStorage 加载弹幕配置
 */
export function loadDanmakuConfigFromStorage(): Partial<DanmakuPluginConfig> {
  return {
    speed: parseInt(localStorage.getItem('danmaku_speed') || '5'),
    opacity: parseFloat(localStorage.getItem('danmaku_opacity') || '0.5'),
    fontSize: parseInt(localStorage.getItem('danmaku_fontSize') || '20'),
    modes: JSON.parse(
      localStorage.getItem('danmaku_modes') || '[0, 1, 2]',
    ) as Array<0 | 1 | 2>,
    margin: JSON.parse(
      localStorage.getItem('danmaku_margin') || '[10, "75%"]',
    ) as [number | `${number}%`, number | `${number}%`],
    visible: localStorage.getItem('danmaku_visible') !== 'false',
  };
}

/**
 * 获取优化的弹幕插件配置
 */
export function getOptimizedDanmakuConfig(
  isMobile: boolean,
): Partial<DanmakuPluginConfig> {
  const devicePerformance = getDevicePerformance(isMobile);
  const storageConfig = loadDanmakuConfigFromStorage();

  console.log(`🎯 设备性能等级: ${devicePerformance.level}`);

  // ✅ 优化：根据性能等级调整弹幕密度
  const maxDanmakuCount =
    devicePerformance.level === 'high'
      ? 50
      : devicePerformance.level === 'medium'
        ? 30
        : 20;

  return {
    danmaku: [], // 初始为空数组，后续通过load方法加载
    ...storageConfig,
    color: '#FFFFFF',
    mode: 0 as const,
    emitter: false,
    maxLength: maxDanmakuCount, // ✅ 动态限制弹幕长度
    lockTime: 0.5, // ✅ 从 1s 降到 0.5s，减少锁定时间
    theme: 'dark' as const,
    width: 300,

    // 🎯 激进优化配置 - 保持功能完整性
    antiOverlap: true, // ✅ 默认开启防重叠 (用户要求)
    synchronousPlayback: true, // ✅ 必须保持true！确保弹幕与视频播放速度同步
    heatmap: false, // 关闭热力图，减少DOM计算开销

    // 🧠 智能过滤器 - 激进性能优化，过滤影响性能的弹幕
    filter: (danmaku) => {
      // 过滤超长弹幕（降低阈值）
      if (danmaku.text && danmaku.text.length > maxDanmakuCount) return false;

      // 过滤emoji密集弹幕 - emoji渲染消耗资源
      const emojiRegex = /[\u{1F300}-\u{1F9FF}]/gu;
      const emojiCount = (danmaku.text?.match(emojiRegex) || []).length;
      if (emojiCount > 2) return false; // ✅ 从 3 降到 2

      // ✅ 新增：随机过滤，在低性能设备上减少弹幕数量
      if (devicePerformance.level === 'low' && Math.random() > 0.5) {
        return false; // 低性能设备只显示 50% 的弹幕
      }

      return true;
    },

    // 🔄 发射前处理 - 优化弹幕显示
    beforeEmit: (danmaku) => {
      // 截断过长文本
      if (danmaku.text && danmaku.text.length > maxDanmakuCount) {
        danmaku.text = danmaku.text.substring(0, maxDanmakuCount) + '...';
      }
      return danmaku;
    },
  };
}
