/**
 * 播放源优选工具
 * 管理播放源的智能选择、测速和评分逻辑
 */

import { SearchResult } from '@/lib/types';
import {
  type VideoResolutionProbeResult,
  getVideoResolutionFromM3u8,
} from '@/lib/utils';

import { getOptimalProbeConcurrency } from './episodeSourceCheck';
import { calculateSourceScore, parseSpeedToKBps } from './helpers';

interface DeviceInfo {
  userAgent: string;
  isIOS: boolean;
  isIOS13: boolean;
  isMobile: boolean;
  isTablet?: boolean;
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
  /** 当前目标/续播集数索引（默认 0），避免硬编码第 2 集导致测速目标偏差 */
  episodeIndex?: number;
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
 * 优先源站点 key（置顶展示 + 优选测速时优先探测）。
 * 电影天堂（dyttzyapi.com）实测响应与下载速度最优。
 * 站点订阅同步按 key 合并、key 通常取域名保持稳定，故此列表不受同步影响；
 * 另按名称兜底匹配，防上游订阅变更 key 后失效。
 */
export const PREFERRED_SOURCE_KEYS: string[] = ['dyttzyapi.com'];

/** 优先源名称兜底（key 变化时仍能按名称命中） */
export const PREFERRED_SOURCE_NAMES: string[] = ['电影天堂'];

/**
 * 解析优选探测应使用的集数 URL：优先匹配当前目标集数，其次回退首条有效 HTTP(S) 地址。
 */
function pickProbeEpisodeUrl(
  source: SearchResult,
  episodeIndex = 0,
): string | null {
  const episodes = source.episodes || [];
  if (episodes.length === 0) return null;

  const normalize = (raw: string | undefined): string | null => {
    const trimmed = (raw || '').trim();
    if (!trimmed || /^magnet:/i.test(trimmed)) return null;
    return trimmed;
  };

  if (episodeIndex >= 0 && episodeIndex < episodes.length) {
    const preferred = normalize(episodes[episodeIndex]);
    if (preferred) return preferred;
  }

  for (const ep of episodes) {
    const fallback = normalize(ep);
    if (fallback) return fallback;
  }
  return null;
}

function detectIPadDevice(deviceInfo: DeviceInfo): boolean {
  if (deviceInfo.isIOS && deviceInfo.isTablet) return true;
  const ua = deviceInfo.userAgent || '';
  if (/iPad/i.test(ua)) return true;
  return (
    ua.includes('Macintosh') &&
    typeof navigator !== 'undefined' &&
    typeof navigator.maxTouchPoints === 'number' &&
    navigator.maxTouchPoints > 2
  );
}

/**
 * 轻量级连通性探测：必须以 cors 模式发出，才能反映「浏览器可播性」。
 *
 * no-cors 的 HEAD 对跨域限制完全无感——被 CORS 拦截或已 5xx 的源照样
 * 被当成「快源」选中，移动端随后播放失败，failover 代价高昂（实测
 * 「后会友期」在移动端因此一直无法播放）。
 * - 请求被拒（CORS / 网络错误 / 超时）→ 抛错，由调用方标记不可用
 * - 403（防盗链 / 鉴权失败）/ 404 / 5xx → 不可用
 * - 2xx 或 [405, 501]（仅表示不支持 HEAD，CORS 仍开放）→ 可用
 */
async function probeSourceReachability(
  url: string,
  timeoutMs: number,
): Promise<{ available: boolean; pingTime: number }> {
  const startTime = performance.now();
  const timeout = createTimeoutSignal(timeoutMs);
  try {
    const response = await fetch(url, {
      method: 'HEAD',
      mode: 'cors',
      signal: timeout.signal,
    });
    const pingTime = Math.round(performance.now() - startTime);
    const available = response.ok || [405, 501].includes(response.status);
    return { available, pingTime };
  } finally {
    timeout.clear();
  }
}

/**
 * 聚合搜源结果按优先源置顶排序（稳定排序，其余保持原相对顺序）。
 * 优选测速只探测列表前几个源，优先源排前可大幅提高其命中率。
 */
export function sortSourcesByPriority<
  T extends { source: string; source_name?: string },
>(sources: T[]): T[] {
  if (sources.length <= 1) return sources;
  const rankOf = (item: T): number => {
    const byKey = PREFERRED_SOURCE_KEYS.indexOf(item.source);
    if (byKey !== -1) return byKey;
    const name = (item.source_name || '').toLowerCase();
    const byName = PREFERRED_SOURCE_NAMES.findIndex((n) =>
      name.includes(n.toLowerCase()),
    );
    return byName === -1
      ? Number.MAX_SAFE_INTEGER
      : PREFERRED_SOURCE_KEYS.length + byName;
  };

  return sources
    .map((item, index) => ({ item, index, rank: rankOf(item) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((entry) => entry.item);
}

type SpeedBatchResultItem = {
  source: SearchResult;
  testResult: VideoResolutionProbeResult;
};

function isSuccessfulProbeResult(
  item: SpeedBatchResultItem | null | undefined,
): item is SpeedBatchResultItem {
  if (!item) return false;
  const { testResult } = item;
  return (
    testResult.success !== false &&
    testResult.pingTime > 0 &&
    testResult.pingTime < 9999
  );
}

/**
 * 移动端/iPad 通过 HEAD 筛出多个可用候选后，进一步对前列候选做轻量分片验活与真实测速，
 * 避免“清单 HEAD 200 但分片 403/超慢”的源靠低延迟误居榜首。
 * 单可用源时直接放行，既节省首屏开销也兼容无响应体的测试桩。
 */
async function probeReachableCandidatesForBest(
  candidates: Array<{ source: SearchResult; pingTime: number }>,
  episodeIndex: number,
  fallbackSource: SearchResult,
): Promise<SearchResult> {
  if (candidates.length <= 1) {
    return candidates[0]?.source ?? fallbackSource;
  }

  // 保持调用方已确定的优先级顺序（移动端按 ping、iPad 按综合评分），
  // 并限制移动端/iPad 并发度，避免 4 路同下分片互抢带宽导致测速失真或集体超时。
  const topCandidates = candidates.slice(0, 4);
  const concurrency = Math.max(1, Math.min(2, getOptimalConcurrency()));
  const tested: Array<SpeedBatchResultItem | null> = [];

  for (let i = 0; i < topCandidates.length; i += concurrency) {
    const batch = topCandidates.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(async ({ source }): Promise<SpeedBatchResultItem | null> => {
        const episodeUrl = pickProbeEpisodeUrl(source, episodeIndex);
        if (!episodeUrl) return null;
        const testResult = await getVideoResolutionFromM3u8(episodeUrl, 3000, {
          sourceKey: source.source,
          adFilterType: source.source,
          maxBytes: 128 * 1024,
        });
        return { source, testResult };
      }),
    );
    tested.push(...batchResults);
  }

  const valid = tested.filter(isSuccessfulProbeResult);
  if (valid.length > 0) {
    return selectBestSource(valid);
  }
  return fallbackSource;
}

/**
 * 播放源优选函数（针对 iPad 与移动端做轻量级分层策略）
 */
export async function preferBestSource(
  sources: SearchResult[],
  options: PreferenceOptions,
): Promise<SearchResult> {
  const { deviceInfo, setSpeedTestProgress, episodeIndex = 0 } = options;
  const { isMobile } = deviceInfo;

  // 处理空数组或单个源的情况
  if (sources.length === 0) {
    throw new Error('没有可用的播放源');
  }
  if (sources.length === 1) return sources[0];

  try {
    // 仅真实 iPad（含桌面 UA 触控模式）走保守策略，避免误分流现代 iPhone
    if (detectIPadDevice(deviceInfo)) {
      return await iPadLightweightPreference(
        sources,
        setSpeedTestProgress,
        episodeIndex,
      );
    }

    // 移动设备使用轻量级连通性 + 候选分片测速
    if (isMobile) {
      return await lightweightPreference(
        sources,
        setSpeedTestProgress,
        episodeIndex,
      );
    }

    // 桌面设备使用增量分片测速
    return await fullSpeedTest(sources, setSpeedTestProgress, episodeIndex);
  } finally {
    setSpeedTestProgress(null);
  }
}

/**
 * 轻量级优选：先做 CORS HEAD 连通性筛选，再在多可用源间进行轻量分片测速（不创建 video/HLS 实例）
 */
export async function lightweightPreference(
  sources: SearchResult[],
  setSpeedTestProgress: (progress: SpeedTestProgress | null) => void,
  episodeIndex = 0,
): Promise<SearchResult> {
  if (sources.length === 0) {
    throw new Error('没有可用的播放源');
  }
  if (sources.length === 1) return sources[0];

  try {
    const results = await probeSourcesInBatches(
      sources,
      setSpeedTestProgress,
      episodeIndex,
    );

    // 按可用性和响应时间排序
    const availableResults = results
      .filter((r) => r.available)
      .sort((a, b) => a.pingTime - b.pingTime);

    if (availableResults.length === 0) {
      console.warn('所有源都不可用，返回第一个');
      return sources[0];
    }

    return await probeReachableCandidatesForBest(
      availableResults,
      episodeIndex,
      availableResults[0].source,
    );
  } finally {
    setSpeedTestProgress(null);
  }
}

/** 轻量级优选的批次大小与最大批次数（最多探测 15 个源） */
const LIGHTWEIGHT_BATCH_SIZE = 5;
const LIGHTWEIGHT_MAX_BATCHES = 3;

/**
 * 分批探测源连通性。
 * 优先源排在列表前部，但坏源（CORS 禁区 / 已挂）也常成片出现：
 * 首批挑不出可用源时继续往后探测，而不是直接拿第一个源去播放。
 */
async function probeSourcesInBatches(
  sources: SearchResult[],
  setSpeedTestProgress: (progress: SpeedTestProgress | null) => void,
  episodeIndex = 0,
): Promise<
  Array<{ source: SearchResult; pingTime: number; available: boolean }>
> {
  const all: Array<{
    source: SearchResult;
    pingTime: number;
    available: boolean;
  }> = [];
  const plannedTotal = Math.min(
    sources.length,
    LIGHTWEIGHT_BATCH_SIZE * LIGHTWEIGHT_MAX_BATCHES,
  );
  let completed = 0;

  for (
    let batchIndex = 0;
    batchIndex < LIGHTWEIGHT_MAX_BATCHES;
    batchIndex += 1
  ) {
    const batchStart = batchIndex * LIGHTWEIGHT_BATCH_SIZE;
    const batch = sources.slice(
      batchStart,
      batchStart + LIGHTWEIGHT_BATCH_SIZE,
    );
    if (batch.length === 0) break;

    const batchResults = await Promise.all(
      batch.map(async (source) => {
        const episodeUrl = pickProbeEpisodeUrl(source, episodeIndex);
        if (!episodeUrl) {
          completed += 1;
          setSpeedTestProgress({
            current: completed,
            total: plannedTotal,
            currentSource: source.source_name,
            result: '无有效地址',
          });
          return { source, pingTime: 9999, available: false };
        }

        try {
          const { available, pingTime } = await probeSourceReachability(
            episodeUrl,
            2000,
          );
          completed += 1;
          setSpeedTestProgress({
            current: completed,
            total: plannedTotal,
            currentSource: source.source_name,
            result: available ? `${Math.round(pingTime)}ms` : '连接失败',
          });
          return { source, pingTime, available };
        } catch (error) {
          console.warn(`轻量级测速失败: ${source.source_name}`, error);
          completed += 1;
          setSpeedTestProgress({
            current: completed,
            total: plannedTotal,
            currentSource: source.source_name,
            result: '连接失败',
          });

          return { source, pingTime: 9999, available: false };
        }
      }),
    );

    all.push(...batchResults);

    // 本批已有可用源即停止；否则继续下一批
    if (all.some((r) => r.available)) break;
  }

  return all;
}

/**
 * 获取最优并发数量（基于网络状况动态调整），策略统一收敛在
 * episodeSourceCheck.getOptimalProbeConcurrency
 */
function getOptimalConcurrency(): number {
  return getOptimalProbeConcurrency();
}

/**
 * 增量测速策略 - 分阶段测试优质源
 */
async function progressiveSpeedTest(
  sources: SearchResult[],
  setSpeedTestProgress: (progress: SpeedTestProgress | null) => void,
  episodeIndex = 0,
): Promise<SearchResult> {
  const maxTestCount = 8; // 增加测试数量，因为使用增量策略
  const sourcesToTest = sources.slice(0, maxTestCount);
  const totalCount = sourcesToTest.length;

  try {
    // 第一阶段：快速测试前3个最可靠的源
    const firstBatchSources = sourcesToTest.slice(0, 3);

    const firstBatchResults = await testSourceBatch(
      firstBatchSources,
      totalCount,
      setSpeedTestProgress,
      'quick',
      episodeIndex,
    );

    const firstSuccessful = firstBatchResults.filter(isSuccessfulProbeResult);

    // 检查是否有实测高速且画质明确的优质源，如有则立即返回
    const hasGoodSource = firstSuccessful.some((result) => {
      const { quality, loadSpeed } = result.testResult;
      const speedKBps = parseSpeedToKBps(loadSpeed);
      if (speedKBps <= 0) return false;

      if (quality === '4K' || quality === '2K') return speedKBps >= 3 * 1024;
      if (quality === '1080p') return speedKBps >= 2 * 1024;
      return speedKBps >= 2 * 1024 && quality !== '未知';
    });

    if (hasGoodSource && firstSuccessful.length > 0) {
      return selectBestSource(firstSuccessful);
    }

    // 第二阶段：测试剩余的源
    const remainingSources = sourcesToTest.slice(3);
    if (remainingSources.length === 0) {
      if (firstSuccessful.length === 0) {
        return sources[0];
      }
      return selectBestSource(firstSuccessful);
    }

    const secondBatchResults = await testSourceBatch(
      remainingSources,
      totalCount,
      setSpeedTestProgress,
      'full',
      episodeIndex,
      firstBatchSources.length,
    );

    const allSuccessfulResults = [
      ...firstSuccessful,
      ...secondBatchResults.filter(isSuccessfulProbeResult),
    ];

    if (allSuccessfulResults.length === 0) {
      console.warn('所有播放源测速都失败，使用第一个播放源');
      return sources[0];
    }

    return selectBestSource(allSuccessfulResults);
  } finally {
    setSpeedTestProgress(null);
  }
}

/**
 * 测试源批次
 */
async function testSourceBatch(
  sources: SearchResult[],
  totalCount: number,
  setSpeedTestProgress: (progress: SpeedTestProgress | null) => void,
  mode: 'quick' | 'full',
  episodeIndex = 0,
  completedOffset = 0,
): Promise<Array<SpeedBatchResultItem | null>> {
  const concurrency = getOptimalConcurrency();
  const results: Array<SpeedBatchResultItem | null> = [];
  let completed = completedOffset;

  for (let i = 0; i < sources.length; i += concurrency) {
    const batch = sources.slice(i, i + concurrency);

    const batchResults = await Promise.all(
      batch.map(async (source) => {
        try {
          const episodeUrl = pickProbeEpisodeUrl(source, episodeIndex);
          if (!episodeUrl) {
            completed += 1;
            setSpeedTestProgress({
              current: Math.min(totalCount, completed),
              total: totalCount,
              currentSource: source.source_name,
              result: '无有效地址',
            });
            return null;
          }

          // 快速模式下使用较短的超时时间
          const timeout = mode === 'quick' ? 3000 : 5000;
          const testResult = await getVideoResolutionFromM3u8(
            episodeUrl,
            timeout,
            {
              sourceKey: source.source,
              adFilterType: source.source,
            },
          );

          completed += 1;
          setSpeedTestProgress({
            current: Math.min(totalCount, completed),
            total: totalCount,
            currentSource: source.source_name,
            result:
              testResult.success === false
                ? '测速失败'
                : `${testResult.quality} | ${testResult.loadSpeed} | ${testResult.pingTime}ms`,
          });

          return { source, testResult };
        } catch (error) {
          console.warn(`测速失败: ${source.source_name}`, error);

          completed += 1;
          setSpeedTestProgress({
            current: Math.min(totalCount, completed),
            total: totalCount,
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
  successfulResults: SpeedBatchResultItem[],
): SearchResult {
  // 找出所有有效实测速度的最大值，用于线性映射
  const validSpeeds = successfulResults
    .map((result) => parseSpeedToKBps(result.testResult.loadSpeed))
    .filter((speed) => speed > 0);

  const maxSpeed = validSpeeds.length > 0 ? Math.max(...validSpeeds) : 0;

  // 找出所有有效延迟的最小值和最大值，用于线性映射（剔除 9999 失败兜底值）
  const validPings = successfulResults
    .map((result) => result.testResult.pingTime)
    .filter((ping) => ping > 0 && ping < 9999);

  const minPing = validPings.length > 0 ? Math.min(...validPings) : 50;
  const maxPing = validPings.length > 0 ? Math.max(...validPings) : 1000;

  // 计算每个结果的评分
  const resultsWithScore = successfulResults.map((result) => ({
    ...result,
    score: calculateSourceScore(result.testResult, maxSpeed, minPing, maxPing),
  }));

  // 按综合评分排序，选择最佳播放源
  resultsWithScore.sort((a, b) => b.score - a.score);

  return resultsWithScore[0].source;
}

/**
 * iPad轻量级优选：不创建 video 和 HLS 实例，先筛连通性再在多可用源间进行轻量分片测速
 */
async function iPadLightweightPreference(
  sources: SearchResult[],
  setSpeedTestProgress: (progress: SpeedTestProgress | null) => void,
  episodeIndex = 0,
): Promise<SearchResult> {
  const maxTestCount = 6; // 测试前6个源，平衡速度和可靠性
  const sourcesToTest = sources.slice(0, maxTestCount);
  let completed = 0;

  try {
    const results = await Promise.allSettled(
      sourcesToTest.map(async (source) => {
        try {
          const episodeUrl = pickProbeEpisodeUrl(source, episodeIndex);
          if (!episodeUrl) {
            completed += 1;
            setSpeedTestProgress({
              current: completed,
              total: sourcesToTest.length,
              currentSource: source.source_name,
              result: '无有效地址',
            });
            return { source, pingTime: 9999, available: false, score: 0 };
          }

          // 仅测试连通性和响应时间；
          // cors 模式才能识别跨域禁区，避免把浏览器里播不了的源排到最前
          const { available, pingTime } = await probeSourceReachability(
            episodeUrl,
            2500,
          );
          completed += 1;
          if (!available) {
            setSpeedTestProgress({
              current: completed,
              total: sourcesToTest.length,
              currentSource: source.source_name,
              result: '连接失败',
            });
            return { source, pingTime, available: false, score: 0 };
          }

          setSpeedTestProgress({
            current: completed,
            total: sourcesToTest.length,
            currentSource: source.source_name,
            result: `${Math.round(pingTime)}ms`,
          });

          const score = calculateIPadScore(source, pingTime);

          return {
            source,
            pingTime: Math.round(pingTime),
            available: true,
            score,
          };
        } catch (error) {
          console.warn(`iPad轻量级测速失败: ${source.source_name}`, error);
          completed += 1;
          setSpeedTestProgress({
            current: completed,
            total: sourcesToTest.length,
            currentSource: source.source_name,
            result: '连接失败',
          });

          return { source, pingTime: 9999, available: false, score: 0 };
        }
      }),
    );

    const validResults = results
      .filter(
        (result): result is PromiseFulfilledResult<IPadPreferenceResult> =>
          result.status === 'fulfilled',
      )
      .map((result) => result.value)
      .filter((result) => result.available)
      .sort((a, b) => b.score - a.score);

    if (validResults.length === 0) {
      console.warn('iPad测速：所有源都不可用，使用当前优先源排序兜底');
      return sortSourcesByPriority(sources)[0];
    }

    return await probeReachableCandidatesForBest(
      validResults,
      episodeIndex,
      validResults[0].source,
    );
  } finally {
    setSpeedTestProgress(null);
  }
}

/**
 * 计算iPad源的评分（基于响应时间和源可靠性）
 */
function calculateIPadScore(source: SearchResult, pingTime: number): number {
  let score = 0;

  // 响应时间评分 (70% 权重)
  const pingScore = Math.max(0, 100 - pingTime / 50); // 50ms以下满分
  score += pingScore * 0.7;

  // 源可靠性评分 (30% 权重) - 结合现有优先源与常见源权重，避免沿用失效清单
  const isPreferredByKey = PREFERRED_SOURCE_KEYS.includes(source.source);
  const isPreferredByName = PREFERRED_SOURCE_NAMES.some((n) =>
    source.source_name?.toLowerCase().includes(n.toLowerCase()),
  );
  const reliabilityScore = isPreferredByKey || isPreferredByName ? 100 : 60;

  score += reliabilityScore * 0.3;

  return Math.round(score * 100) / 100;
}

/**
 * 完整测速（桌面设备）- 使用增量测速策略
 */
export async function fullSpeedTest(
  sources: SearchResult[],
  setSpeedTestProgress: (progress: SpeedTestProgress | null) => void,
  episodeIndex = 0,
): Promise<SearchResult> {
  return await progressiveSpeedTest(
    sources,
    setSpeedTestProgress,
    episodeIndex,
  );
}
