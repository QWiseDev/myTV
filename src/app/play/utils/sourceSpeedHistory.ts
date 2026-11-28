/**
 * 播放源测速历史（持久化）
 *
 * 记录每个播放源（按站点 key）在真实播放中的分片下载余量、TTFB 与卡顿频率，
 * 跨页面/跨影片保留，用于：
 * - 选源排序与测速评分：历史上经常卡的源自动后排，稳定流畅的源优先；
 * - 动态缓冲热启动：已知慢源首片即按慢源档位缓冲并开启并发预取。
 */

const STORAGE_KEY = 'player_source_speed_history_v1';
const MAX_ENTRIES = 200;
const ENTRY_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** 历史开始衰减（向中性分回归）的时间 */
const STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;
/** 加权平均中历史样本的最大权重，保证新近表现能较快反映 */
const MAX_SAMPLE_WEIGHT = 40;
/** 计算卡顿率时的最小播放时长分母（秒），避免极短会话放大卡顿率 */
const MIN_STALL_RATE_WINDOW_SEC = 300;

export interface SourceSpeedHistoryEntry {
  /** 分片媒体时长 / 下载耗时 的加权平均（>1 表示下载快于播放） */
  speedRatio: number | null;
  ttfbMs: number | null;
  throughputBps: number | null;
  /** 参与加权的样本权重（已封顶） */
  samples: number;
  /** 累计卡顿次数（与 playedSeconds 同步按比例衰减） */
  stalls: number;
  /** 累计有效播放秒数 */
  playedSeconds: number;
  updatedAt: number;
}

export interface SourceSpeedSessionDelta {
  speedRatio?: number | null;
  ttfbMs?: number | null;
  throughputBps?: number | null;
  /** 自上次写入以来新增的真实分片样本数 */
  newSamples?: number;
  /** 自上次写入以来新增的卡顿次数 */
  newStalls?: number;
  /** 自上次写入以来新增的播放秒数 */
  newPlayedSeconds?: number;
}

type HistoryMap = Record<string, SourceSpeedHistoryEntry>;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function sanitizeEntry(raw: unknown): SourceSpeedHistoryEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  if (!isFiniteNumber(record.updatedAt)) return null;
  return {
    speedRatio:
      isFiniteNumber(record.speedRatio) && record.speedRatio > 0
        ? record.speedRatio
        : null,
    ttfbMs:
      isFiniteNumber(record.ttfbMs) && record.ttfbMs >= 0
        ? record.ttfbMs
        : null,
    throughputBps:
      isFiniteNumber(record.throughputBps) && record.throughputBps > 0
        ? record.throughputBps
        : null,
    samples: isFiniteNumber(record.samples)
      ? clamp(record.samples, 0, MAX_SAMPLE_WEIGHT)
      : 0,
    stalls: isFiniteNumber(record.stalls) ? Math.max(0, record.stalls) : 0,
    playedSeconds: isFiniteNumber(record.playedSeconds)
      ? Math.max(0, record.playedSeconds)
      : 0,
    updatedAt: record.updatedAt,
  };
}

function readHistory(now: number): HistoryMap {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    const result: HistoryMap = {};
    for (const [key, value] of Object.entries(
      parsed as Record<string, unknown>,
    )) {
      const entry = sanitizeEntry(value);
      if (entry && now - entry.updatedAt <= ENTRY_TTL_MS) {
        result[key] = entry;
      }
    }
    return result;
  } catch {
    return {};
  }
}

function writeHistory(history: HistoryMap): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const entries = Object.entries(history);
    const trimmed =
      entries.length > MAX_ENTRIES
        ? Object.fromEntries(
            entries
              .sort((a, b) => b[1].updatedAt - a[1].updatedAt)
              .slice(0, MAX_ENTRIES),
          )
        : history;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    /* 存储不可用或配额不足时忽略，不影响播放 */
  }
}

function weightedMerge(
  oldValue: number | null,
  oldWeight: number,
  newValue: number | null | undefined,
  newWeight: number,
): number | null {
  if (!isFiniteNumber(newValue) || newValue <= 0 || newWeight <= 0) {
    return oldValue;
  }
  if (oldValue === null || oldWeight <= 0) return newValue;
  return (
    (oldValue * oldWeight + newValue * newWeight) / (oldWeight + newWeight)
  );
}

export function clearSourceSpeedHistory(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function getSourceSpeedHistory(
  sourceKey: string | null | undefined,
  now: number = Date.now(),
): SourceSpeedHistoryEntry | null {
  const key = sourceKey?.trim();
  if (!key) return null;
  return readHistory(now)[key] ?? null;
}

/**
 * 合并一次播放会话的增量数据到持久化历史。
 * 速度类指标按样本加权平均（历史权重封顶），卡顿与播放时长累计，
 * 当累计播放时长过长时同比例缩减，使卡顿率反映近期表现。
 */
export function recordSourceSpeedSession(
  sourceKey: string | null | undefined,
  delta: SourceSpeedSessionDelta,
  now: number = Date.now(),
): void {
  const key = sourceKey?.trim();
  if (!key) return;

  const newSamples = Math.max(0, delta.newSamples ?? 0);
  const newStalls = Math.max(0, delta.newStalls ?? 0);
  const newPlayed = Math.max(0, delta.newPlayedSeconds ?? 0);
  if (newSamples === 0 && newStalls === 0 && newPlayed < 1) return;

  const history = readHistory(now);
  const prev = history[key];
  const oldWeight = prev?.samples ?? 0;

  let stalls = (prev?.stalls ?? 0) + newStalls;
  let playedSeconds = (prev?.playedSeconds ?? 0) + newPlayed;
  // 只保留约 2 小时的有效播放窗口，超出部分按比例缩减
  const MAX_PLAYED_WINDOW = 2 * 60 * 60;
  if (playedSeconds > MAX_PLAYED_WINDOW) {
    const factor = MAX_PLAYED_WINDOW / playedSeconds;
    playedSeconds = MAX_PLAYED_WINDOW;
    stalls *= factor;
  }

  history[key] = {
    speedRatio: weightedMerge(
      prev?.speedRatio ?? null,
      oldWeight,
      delta.speedRatio,
      newSamples,
    ),
    ttfbMs: weightedMerge(
      prev?.ttfbMs ?? null,
      oldWeight,
      delta.ttfbMs,
      newSamples,
    ),
    throughputBps: weightedMerge(
      prev?.throughputBps ?? null,
      oldWeight,
      delta.throughputBps,
      newSamples,
    ),
    samples: Math.min(MAX_SAMPLE_WEIGHT, oldWeight + newSamples),
    stalls: Math.round(stalls * 100) / 100,
    playedSeconds: Math.round(playedSeconds),
    updatedAt: now,
  };

  writeHistory(history);
}

/** 每 10 分钟播放的卡顿次数 */
export function getStallsPer10Min(entry: SourceSpeedHistoryEntry): number {
  const window = Math.max(entry.playedSeconds, MIN_STALL_RATE_WINDOW_SEC);
  return (entry.stalls / window) * 600;
}

function hasEnoughEvidence(entry: SourceSpeedHistoryEntry): boolean {
  return entry.samples >= 3 || entry.playedSeconds >= 120 || entry.stalls >= 2;
}

/**
 * 历史综合评分（0-100，越高越流畅）；证据不足时返回 null。
 * 速度余量 45% + 卡顿率 40% + TTFB 15%，超过 7 天未更新的记录逐步回归中性分 50。
 */
export function getSourceHistoryScore(
  entry: SourceSpeedHistoryEntry | null | undefined,
  now: number = Date.now(),
): number | null {
  if (!entry || !hasEnoughEvidence(entry)) return null;

  const parts: Array<{ score: number; weight: number }> = [];

  if (entry.speedRatio !== null) {
    // 余量 ≤1x 记 0 分，≥5x 记满分
    parts.push({
      score: clamp(((entry.speedRatio - 1) / 4) * 100, 0, 100),
      weight: 0.45,
    });
  }

  const stallRate = getStallsPer10Min(entry);
  if (entry.playedSeconds > 0 || entry.stalls > 0) {
    // 0 次/10min 满分，≥3 次/10min 记 0 分
    parts.push({
      score: clamp(100 - (stallRate / 3) * 100, 0, 100),
      weight: 0.4,
    });
  }

  if (entry.ttfbMs !== null) {
    // ≤300ms 满分，≥2500ms 记 0 分
    parts.push({
      score: clamp(100 - ((entry.ttfbMs - 300) / 2200) * 100, 0, 100),
      weight: 0.15,
    });
  }

  if (parts.length === 0) return null;
  const totalWeight = parts.reduce((sum, p) => sum + p.weight, 0);
  let score =
    parts.reduce((sum, p) => sum + p.score * p.weight, 0) / totalWeight;

  const age = now - entry.updatedAt;
  if (age > STALE_AFTER_MS) {
    const staleFactor = clamp(
      (age - STALE_AFTER_MS) / (ENTRY_TTL_MS - STALE_AFTER_MS),
      0,
      1,
    );
    score = score + (50 - score) * staleFactor;
  }

  return Math.round(score * 10) / 10;
}

export type SourceHistoryGrade = 'good' | 'neutral' | 'bad' | 'unknown';

function gradeFromScore(score: number | null): SourceHistoryGrade {
  if (score === null) return 'unknown';
  if (score >= 70) return 'good';
  if (score < 35) return 'bad';
  return 'neutral';
}

export function getSourceHistoryGrade(
  sourceKey: string | null | undefined,
  now: number = Date.now(),
): SourceHistoryGrade {
  return gradeFromScore(
    getSourceHistoryScore(getSourceSpeedHistory(sourceKey, now), now),
  );
}

export interface SourceHistoryLookup {
  getScore: (sourceKey: string | null | undefined) => number | null;
  getGrade: (sourceKey: string | null | undefined) => SourceHistoryGrade;
}

/** 批量查询（只读取并解析一次 localStorage），用于排序/评分大量候选源 */
export function createSourceHistoryLookup(
  now: number = Date.now(),
): SourceHistoryLookup {
  const history = readHistory(now);
  const getScore = (sourceKey: string | null | undefined) => {
    const key = sourceKey?.trim();
    return key ? getSourceHistoryScore(history[key], now) : null;
  };
  return {
    getScore,
    getGrade: (sourceKey) => gradeFromScore(getScore(sourceKey)),
  };
}

/**
 * 历史是否表明该源偏慢（用于动态缓冲热启动与并发预取预开启）。
 */
export function isSourceHistoricallySlow(
  sourceKey: string | null | undefined,
  now: number = Date.now(),
): boolean {
  const entry = getSourceSpeedHistory(sourceKey, now);
  if (!entry || !hasEnoughEvidence(entry)) return false;
  if (now - entry.updatedAt > STALE_AFTER_MS) return false;
  if (getStallsPer10Min(entry) >= 1.5) return true;
  if (entry.speedRatio !== null && entry.speedRatio < 2.5) return true;
  return entry.ttfbMs !== null && entry.ttfbMs >= 1200;
}
