/**
 * 播放源优选工具
 * 管理播放源的智能选择、测速和评分逻辑
 */

import { SearchResult } from '@/lib/types';
import { getVideoResolutionFromM3u8 } from '@/lib/utils';

import { calculateSourceScore } from './helpers';

interface DeviceInfo {
  userAgent: string;
  isIOS: boolean;
  isIOS13: boolean;
  isMobile: boolean;
}

interface SpeedTestProgress {
  current: number;
  total: number;
  currentSource: string;
  result?: string;
}

interface PreferenceOptions {
  deviceInfo: DeviceInfo;
  setSpeedTestProgress: (progress: SpeedTestProgress | null) => void;
}

interface NetworkInformationLike {
  downlink?: number;
  effectiveType?: 'slow-2g' | '2g' | '3g' | '4g' | string;
}

interface NavigatorWithConnection extends Navigator {
  connection?: NetworkInformationLike;
  mozConnection?: NetworkInformationLike;
  webkitConnection?: NetworkInformationLike;
}

type IPadPreferenceResult = {
  source: SearchResult;
  pingTime: number;
  available: boolean;
  score: number;
};

function createTimeoutSignal(timeoutMs: number): {
  signal?: AbortSignal;
  clear: () => void;
} {
  if (typeof AbortController === 'undefined') {
    return { clear: () => undefined };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  return {
    signal: controller.signal,
    clear: () => clearTimeout(timeoutId),
  };
}

/**
 * 播放源优选函数（针对旧iPad做极端保守优化）
 */
export async function preferBestSource(
  sources: SearchResult[],
  options: PreferenceOptions,
): Promise<SearchResult> {
  const { deviceInfo, setSpeedTestProgress } = options;
  const { userAgent, isIOS13, isMobile } = deviceInfo;

  // 处理空数组或单个源的情况
  if (sources.length === 0) {
    throw new Error('没有可用的播放源');
  }
  if (sources.length === 1) return sources[0];

  // 使用全局统一的设备检测结果
  const _isIPad =
    /iPad/i.test(userAgent) ||
    (userAgent.includes('Macintosh') && navigator.maxTouchPoints >= 1);

  // 如果是iPad或iOS13+（包括新iPad在桌面模式下），使用轻量级测速策略
  if (isIOS13) {
    console.log('检测到iPad/iOS13+设备，使用轻量级测速优选策略');
    return await iPadLightweightPreference(sources, setSpeedTestProgress);
  }

  // 移动设备使用轻量级测速（仅ping，不创建HLS）
  if (isMobile) {
    console.log('移动设备使用轻量级优选');
    return await lightweightPreference(sources, setSpeedTestProgress);
  }

  // 桌面设备使用原来的测速方法（控制并发）
  return await fullSpeedTest(sources, setSpeedTestProgress);
}

/**
 * 轻量级优选：仅测试连通性，不创建video和HLS
 */
export async function lightweightPreference(
  sources: SearchResult[],
  setSpeedTestProgress: (progress: SpeedTestProgress | null) => void,
): Promise<SearchResult> {
  // 🚀 优化：进一步减少测试数量以加速加载
  const maxTestCount = 5; // 从8减少到5，只测试最快的5个源
  const sourcesToTest = sources.slice(0, maxTestCount);

  console.log(
    `开始轻量级测速: 共${sources.length}个源，将测试前${sourcesToTest.length}个`,
  );

  const results = await Promise.all(
    sourcesToTest.map(async (source, index) => {
      try {
        // 更新进度：显示当前正在测试的源
        setSpeedTestProgress({
          current: index + 1,
          total: sourcesToTest.length,
          currentSource: source.source_name,
        });

        if (!source.episodes || source.episodes.length === 0) {
          return { source, pingTime: 9999, available: false };
        }

        const episodeUrl =
          source.episodes.length > 1 ? source.episodes[1] : source.episodes[0];

        // 仅测试连通性和响应时间（缩短超时时间）
        const startTime = performance.now();
        const timeout = createTimeoutSignal(2000);
        try {
          await fetch(episodeUrl, {
            method: 'HEAD',
            mode: 'no-cors',
            signal: timeout.signal,
          });
        } finally {
          timeout.clear();
        }
        const pingTime = performance.now() - startTime;

        // 更新进度：显示测试结果
        setSpeedTestProgress({
          current: index + 1,
          total: sourcesToTest.length,
          currentSource: source.source_name,
          result: `${Math.round(pingTime)}ms`,
        });

        return {
          source,
          pingTime: Math.round(pingTime),
          available: true,
        };
      } catch (error) {
        console.warn(`轻量级测速失败: ${source.source_name}`, error);

        // 更新进度：显示失败
        setSpeedTestProgress({
          current: index + 1,
          total: sourcesToTest.length,
          currentSource: source.source_name,
          result: '连接失败',
        });

        return { source, pingTime: 9999, available: false };
      }
    }),
  );

  // 按可用性和响应时间排序
  const sortedResults = results
    .filter((r) => r.available)
    .sort((a, b) => a.pingTime - b.pingTime);

  if (sortedResults.length === 0) {
    console.warn('所有源都不可用，返回第一个');
    if (sources.length === 0) {
      throw new Error('没有可用的播放源');
    }
    return sources[0];
  }

  console.log(
    '轻量级优选结果:',
    sortedResults.map((r) => `${r.source.source_name}: ${r.pingTime}ms`),
  );

  // 清除测速进度状态
  setSpeedTestProgress(null);

  return sortedResults[0].source;
}

/**
 * 获取最优并发数量（基于网络状况动态调整）
 */
function getOptimalConcurrency(): number {
  const networkNavigator = navigator as NavigatorWithConnection;
  const connection =
    networkNavigator.connection ||
    networkNavigator.mozConnection ||
    networkNavigator.webkitConnection;
  if (connection) {
    const downlink = connection.downlink ?? 0; // Mbps
    const effectiveType = connection.effectiveType; // 4g, 3g, 2g, slow-2g

    // 根据网络质量和类型调整并发数
    if (downlink > 10) return 4; // 高速网络
    if (downlink > 5) return 3; // 中速网络
    if (downlink > 2) return 2; // 一般网络
    if (effectiveType === '4g') return 3;
    if (effectiveType === '3g') return 2;
    return 1; // 慢速网络
  }
  return 2; // 默认值
}

/**
 * 增量测速策略 - 分阶段测试优质源
 */
async function progressiveSpeedTest(
  sources: SearchResult[],
  setSpeedTestProgress: (progress: SpeedTestProgress | null) => void,
): Promise<SearchResult> {
  const maxTestCount = 8; // 增加测试数量，因为使用增量策略
  const sourcesToTest = sources.slice(0, maxTestCount);

  console.log(
    `开始增量测速: 共${sources.length}个源，将测试前${sourcesToTest.length}个`,
  );

  // 第一阶段：快速测试前3个最可靠的源
  const firstBatchSources = sourcesToTest.slice(0, 3);
  console.log('第一阶段：快速测试前3个最可靠源');

  const firstBatchResults = await testSourceBatch(
    firstBatchSources,
    0,
    setSpeedTestProgress,
    'quick',
  );

  // 检查是否有优质源，如有则立即返回
  const hasGoodSource = firstBatchResults.some((result) => {
    if (!result) return false;
    const { quality, loadSpeed } = result.testResult;
    const speedMatch = loadSpeed.match(/^([\d.]+)\s*MB\/s$/);
    const speedMBps = speedMatch ? parseFloat(speedMatch[1]) : 0;

    // 优质源判断：4K/2K且速度>=3MB/s，或1080p且速度>=5MB/s
    return (
      ((quality === '4K' || quality === '2K') && speedMBps >= 3) ||
      (quality === '1080p' && speedMBps >= 5)
    );
  });

  if (hasGoodSource && firstBatchResults.length > 0) {
    console.log('✓ 第一阶段发现优质源，停止继续测试');

    // 计算评分并返回最佳源
    const successfulResults = firstBatchResults.filter(Boolean) as Array<{
      source: SearchResult;
      testResult: { quality: string; loadSpeed: string; pingTime: number };
    }>;

    if (successfulResults.length === 0) {
      return sources[0];
    }

    return selectBestSource(successfulResults);
  }

  // 第二阶段：测试剩余的源
  const remainingSources = sourcesToTest.slice(3);
  if (remainingSources.length === 0) {
    // 没有剩余源，使用第一批结果
    const successfulResults = firstBatchResults.filter(Boolean) as Array<{
      source: SearchResult;
      testResult: { quality: string; loadSpeed: string; pingTime: number };
    }>;

    if (successfulResults.length === 0) {
      return sources[0];
    }

    return selectBestSource(successfulResults);
  }

  console.log(`第二阶段：测试剩余${remainingSources.length}个源`);
  const secondBatchResults = await testSourceBatch(
    remainingSources,
    3, // 偏移量
    setSpeedTestProgress,
    'full',
  );

  // 合并结果并选择最佳源
  const allSuccessfulResults = [
    ...firstBatchResults.filter(Boolean),
    ...secondBatchResults.filter(Boolean),
  ] as Array<{
    source: SearchResult;
    testResult: { quality: string; loadSpeed: string; pingTime: number };
  }>;

  if (allSuccessfulResults.length === 0) {
    console.warn('所有播放源测速都失败，使用第一个播放源');
    return sources[0];
  }

  return selectBestSource(allSuccessfulResults);
}

/**
 * 测试源批次
 */
async function testSourceBatch(
  sources: SearchResult[],
  offset: number,
  setSpeedTestProgress: (progress: SpeedTestProgress | null) => void,
  mode: 'quick' | 'full',
): Promise<
  Array<{
    source: SearchResult;
    testResult: { quality: string; loadSpeed: string; pingTime: number };
  } | null>
> {
  const concurrency = getOptimalConcurrency();
  const results: Array<{
    source: SearchResult;
    testResult: { quality: string; loadSpeed: string; pingTime: number };
  } | null> = [];

  for (let i = 0; i < sources.length; i += concurrency) {
    const batch = sources.slice(i, i + concurrency);

    const batchResults = await Promise.all(
      batch.map(async (source, batchIndex) => {
        try {
          // 更新进度
          const currentIndex = offset + i + batchIndex + 1;
          setSpeedTestProgress({
            current: currentIndex,
            total: offset + sources.length,
            currentSource: source.source_name,
          });

          if (!source.episodes || source.episodes.length === 0) {
            return null;
          }

          const episodeUrl =
            source.episodes.length > 1
              ? source.episodes[1]
              : source.episodes[0];

          // 快速模式下使用较短的超时时间
          const timeout = mode === 'quick' ? 3000 : 5000;
          const testResult = await getVideoResolutionFromM3u8(
            episodeUrl,
            timeout,
          );

          // 更新进度：显示测试结果
          setSpeedTestProgress({
            current: currentIndex,
            total: offset + sources.length,
            currentSource: source.source_name,
            result: `${testResult.quality} | ${testResult.loadSpeed} | ${testResult.pingTime}ms`,
          });

          return { source, testResult };
        } catch (error) {
          console.warn(`测速失败: ${source.source_name}`, error);

          // 更新进度：显示失败
          const currentIndex = offset + i + batchIndex + 1;
          setSpeedTestProgress({
            current: currentIndex,
            total: offset + sources.length,
            currentSource: source.source_name,
            result: '测速失败',
          });

          return null;
        }
      }),
    );

    results.push(...batchResults);

    // 批次间延迟
    if (i + concurrency < sources.length) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  return results;
}

/**
 * 从测试结果中选择最佳源
 */
function selectBestSource(
  successfulResults: Array<{
    source: SearchResult;
    testResult: { quality: string; loadSpeed: string; pingTime: number };
  }>,
): SearchResult {
  // 找出所有有效速度的最大值，用于线性映射
  const validSpeeds = successfulResults
    .map((result) => {
      const speedStr = result.testResult.loadSpeed;
      if (speedStr === '未知' || speedStr === '测量中...') return 0;

      const match = speedStr.match(/^([\d.]+)\s*(KB\/s|MB\/s)$/);
      if (!match) return 0;

      const value = parseFloat(match[1]);
      const unit = match[2];
      return unit === 'MB/s' ? value * 1024 : value; // 统一转换为 KB/s
    })
    .filter((speed) => speed > 0);

  const maxSpeed = validSpeeds.length > 0 ? Math.max(...validSpeeds) : 1024; // 默认1MB/s作为基准

  // 找出所有有效延迟的最小值和最大值，用于线性映射
  const validPings = successfulResults
    .map((result) => result.testResult.pingTime)
    .filter((ping) => ping > 0);

  const minPing = validPings.length > 0 ? Math.min(...validPings) : 50;
  const maxPing = validPings.length > 0 ? Math.max(...validPings) : 1000;

  // 计算每个结果的评分
  const resultsWithScore = successfulResults.map((result) => ({
    ...result,
    score: calculateSourceScore(result.testResult, maxSpeed, minPing, maxPing),
  }));

  // 按综合评分排序，选择最佳播放源
  resultsWithScore.sort((a, b) => b.score - a.score);

  console.log('播放源评分排序结果:');
  resultsWithScore.forEach((result, index) => {
    console.log(
      `${index + 1}. ${
        result.source.source_name
      } - 评分: ${result.score.toFixed(2)} (${result.testResult.quality}, ${
        result.testResult.loadSpeed
      }, ${result.testResult.pingTime}ms)`,
    );
  });

  return resultsWithScore[0].source;
}

/**
 * 完整测速（桌面设备）- 使用增量测速策略
 */
/**
 * iPad轻量级优选：仅测试连通性和响应时间，不创建video和HLS实例
 */
async function iPadLightweightPreference(
  sources: SearchResult[],
  setSpeedTestProgress: (progress: SpeedTestProgress | null) => void,
): Promise<SearchResult> {
  const maxTestCount = 6; // 测试前6个源，平衡速度和可靠性
  const sourcesToTest = sources.slice(0, maxTestCount);

  console.log(
    `开始iPad轻量级测速: 共${sources.length}个源，将测试前${sourcesToTest.length}个`,
  );

  const results = await Promise.allSettled(
    sourcesToTest.map(async (source, index) => {
      try {
        // 更新进度：显示当前正在测试的源
        setSpeedTestProgress({
          current: index + 1,
          total: sourcesToTest.length,
          currentSource: source.source_name,
        });

        if (!source.episodes || source.episodes.length === 0) {
          return { source, pingTime: 9999, available: false, score: 0 };
        }

        const episodeUrl =
          source.episodes.length > 1 ? source.episodes[1] : source.episodes[0];

        // 仅测试连通性和响应时间（使用较短的超时时间）
        const startTime = performance.now();
        const timeout = createTimeoutSignal(2500);
        try {
          await fetch(episodeUrl, {
            method: 'HEAD',
            mode: 'no-cors',
            signal: timeout.signal,
          });
        } finally {
          timeout.clear();
        }
        const pingTime = performance.now() - startTime;

        // 更新进度：显示测试结果
        setSpeedTestProgress({
          current: index + 1,
          total: sourcesToTest.length,
          currentSource: source.source_name,
          result: `${Math.round(pingTime)}ms`,
        });

        // 计算基于响应时间和源可靠性的评分
        const score = calculateIPadScore(source, pingTime);

        return {
          source,
          pingTime: Math.round(pingTime),
          available: true,
          score,
        };
      } catch (error) {
        console.warn(`iPad轻量级测速失败: ${source.source_name}`, error);

        // 更新进度：显示失败
        setSpeedTestProgress({
          current: index + 1,
          total: sourcesToTest.length,
          currentSource: source.source_name,
          result: '连接失败',
        });

        return { source, pingTime: 9999, available: false, score: 0 };
      }
    }),
  );

  // 处理结果
  const validResults = results
    .filter(
      (result): result is PromiseFulfilledResult<IPadPreferenceResult> =>
        result.status === 'fulfilled',
    )
    .map((result) => result.value)
    .filter((result) => result.available);

  if (validResults.length === 0) {
    console.warn('iPad测速：所有源都不可用，使用基于优先级的排序');

    // 降级到基于源名称优先级的选择
    const sourcePreference = [
      'ok',
      'niuhu',
      'ying',
      'wasu',
      'mgtv',
      'iqiyi',
      'youku',
      'qq',
    ];

    const sortedSources = sources.sort((a, b) => {
      const aIndex = sourcePreference.findIndex((name) =>
        a.source_name?.toLowerCase().includes(name),
      );
      const bIndex = sourcePreference.findIndex((name) =>
        b.source_name?.toLowerCase().includes(name),
      );

      if (aIndex !== -1 && bIndex !== -1) {
        return aIndex - bIndex;
      }
      if (aIndex !== -1) return -1;
      if (bIndex !== -1) return 1;
      return 0;
    });

    console.log(
      'iPad降级优选结果:',
      sortedSources.map((s) => s.source_name),
    );
    return sortedSources[0];
  }

  // 按评分排序，选择最佳源
  validResults.sort((a, b) => b.score - a.score);

  console.log(
    'iPad轻量级优选结果:',
    validResults.map(
      (r) =>
        `${r.source.source_name}: ${r.pingTime}ms (评分: ${r.score.toFixed(1)})`,
    ),
  );

  // 清除测速进度状态
  setSpeedTestProgress(null);

  return validResults[0].source;
}

/**
 * 计算iPad源的评分（基于响应时间和源可靠性）
 */
function calculateIPadScore(source: SearchResult, pingTime: number): number {
  let score = 0;

  // 响应时间评分 (70% 权重)
  const pingScore = Math.max(0, 100 - pingTime / 50); // 50ms以下满分
  score += pingScore * 0.7;

  // 源可靠性评分 (30% 权重) - 基于源名称
  const sourcePreference = [
    'ok', // 100分
    'niuhu', // 90分
    'ying', // 85分
    'wasu', // 80分
    'mgtv', // 75分
    'iqiyi', // 70分
    'youku', // 65分
    'qq', // 60分
  ];

  const reliabilityScore = sourcePreference.reduce((acc, name, index) => {
    if (source.source_name?.toLowerCase().includes(name)) {
      return 100 - index * 5;
    }
    return acc;
  }, 50); // 默认50分

  score += reliabilityScore * 0.3;

  return Math.round(score * 100) / 100;
}

/**
 * 完整测速（桌面设备）- 使用增量测速策略
 */
export async function fullSpeedTest(
  sources: SearchResult[],
  setSpeedTestProgress: (progress: SpeedTestProgress | null) => void,
): Promise<SearchResult> {
  return await progressiveSpeedTest(sources, setSpeedTestProgress);
}
