import { ClientCache } from '@/lib/client-cache';

export interface DanmakuAnime {
  id: string;
  title: string;
  episodeCount: number;
}

export interface DanmakuEpisode {
  id: string;
  title: string;
}

export interface ManualDanmakuSelection {
  episodeId: string;
  title: string;
}
export interface DanmakuFilters {
  keywords: string[];
  blockTop: boolean;
  blockBottom: boolean;
  blockColor: boolean;
}

export const DEFAULT_DANMAKU_FILTERS: DanmakuFilters = {
  keywords: [],
  blockTop: false,
  blockBottom: false,
  blockColor: false,
};
const SELECTION_KEY = 'player_danmaku_selections_v1';
const FILTER_KEY = 'player_danmaku_filters_v1';

export function danmakuMediaKey(
  title: string,
  year?: string,
  doubanId?: number | null,
) {
  return JSON.stringify([title.trim(), year || '', doubanId || 0]);
}

export function readDanmakuSelection(
  media: string,
  episodeIndex: number,
): ManualDanmakuSelection | null {
  try {
    const saved = JSON.parse(localStorage.getItem(SELECTION_KEY) || '{}');
    const value = saved[JSON.stringify([media, episodeIndex])];
    return value &&
      typeof value.episodeId === 'string' &&
      typeof value.title === 'string'
      ? value
      : null;
  } catch {
    return null;
  }
}

export function saveDanmakuSelection(
  media: string,
  episodeIndex: number,
  selection: ManualDanmakuSelection | null,
) {
  let saved: Record<string, ManualDanmakuSelection> = {};
  try {
    const parsed = JSON.parse(localStorage.getItem(SELECTION_KEY) || '{}');
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
      saved = parsed;
  } catch {
    /* 损坏的旧缓存不影响重新选择。 */
  }
  const key = JSON.stringify([media, episodeIndex]);
  delete saved[key];
  if (selection) saved[key] = selection;
  localStorage.setItem(
    SELECTION_KEY,
    JSON.stringify(Object.fromEntries(Object.entries(saved).slice(-100))),
  );
}

/**
 * 手动弹幕选择的服务端共享镜像（经 /api/cache 存储于 redis）。
 *
 * 本地选择仍然优先：只有本浏览器从未手动选择过该集时，
 * 才把其他用户选中的绑定作为默认弹幕源使用。
 */
const SHARED_SELECTION_KEY_PREFIX = 'danmaku-shared-sel';
const SHARED_SELECTION_TTL_SECONDS = 7 * 24 * 60 * 60;

/**
 * 将任意文本编码为只含安全字符的缓存键片段（规避 /api/cache 的空白、通配符与方括号校验，并控制长度）。
 */
export function encodeSafeCacheSegment(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 =
    typeof btoa === 'function'
      ? btoa(binary)
      : Buffer.from(bytes).toString('base64');
  const encoded = base64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
  if (encoded.length <= 180) {
    return encoded;
  }

  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < bytes.length; i += 1) {
    h1 = Math.imul(h1 ^ bytes[i], 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ bytes[i], 0x85ebca6b) >>> 0;
  }
  return `${encoded.slice(0, 160)}_${h1.toString(36)}${h2.toString(36)}`;
}

export function sharedSelectionCacheKey(
  media: string,
  episodeIndex: number,
): string {
  return `${SHARED_SELECTION_KEY_PREFIX}:${encodeSafeCacheSegment(media)}:${episodeIndex}`;
}

function isManualDanmakuSelection(
  value: unknown,
): value is ManualDanmakuSelection {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof (value as ManualDanmakuSelection).episodeId === 'string' &&
    typeof (value as ManualDanmakuSelection).title === 'string'
  );
}

/** 读取同一内容下其他用户最近手动选中的弹幕绑定；无记录或网络失败返回 null。 */
export async function fetchSharedDanmakuSelection(
  media: string,
  episodeIndex: number,
): Promise<ManualDanmakuSelection | null> {
  if (typeof window === 'undefined') return null;
  try {
    const data = await ClientCache.get<ManualDanmakuSelection>(
      sharedSelectionCacheKey(media, episodeIndex),
    );
    return isManualDanmakuSelection(data) ? data : null;
  } catch {
    return null;
  }
}

/** 写入/清除共享弹幕绑定（用户手动选择或恢复自动匹配时调用）。 */
export async function syncSharedDanmakuSelection(
  media: string,
  episodeIndex: number,
  selection: ManualDanmakuSelection | null,
): Promise<void> {
  if (typeof window === 'undefined') return;
  const key = sharedSelectionCacheKey(media, episodeIndex);
  try {
    if (selection) {
      await ClientCache.set(key, selection, SHARED_SELECTION_TTL_SECONDS);
    } else {
      await ClientCache.delete(key);
    }
  } catch (error) {
    console.warn('同步共享弹幕选择失败:', error);
  }
}

export function readDanmakuFilters(): DanmakuFilters {
  try {
    const value = JSON.parse(localStorage.getItem(FILTER_KEY) || '{}');
    return {
      keywords: Array.isArray(value.keywords)
        ? value.keywords
            .filter(
              (word: unknown): word is string =>
                typeof word === 'string' && word.trim().length > 0,
            )
            .slice(0, 100)
        : [],
      blockTop: value.blockTop === true,
      blockBottom: value.blockBottom === true,
      blockColor: value.blockColor === true,
    };
  } catch {
    return DEFAULT_DANMAKU_FILTERS;
  }
}

export function saveDanmakuFilters(filters: DanmakuFilters) {
  localStorage.setItem(FILTER_KEY, JSON.stringify(filters));
}

export function matchesDanmakuFilters(
  item: { text?: string; mode?: unknown; color?: unknown },
  filters: DanmakuFilters,
) {
  if (filters.blockTop && item.mode === 1) return false;
  if (filters.blockBottom && item.mode === 2) return false;
  if (
    filters.blockColor &&
    typeof item.color === 'string' &&
    item.color.toLowerCase() !== '#ffffff'
  )
    return false;
  const text = (item.text || '').toLocaleLowerCase();
  return !filters.keywords.some((word) =>
    text.includes(word.toLocaleLowerCase()),
  );
}

export function normalizeDanmakuComments(comments: unknown) {
  if (!Array.isArray(comments)) return [];
  const seen = new Set<string>();
  return comments
    .slice(0, 50000)
    .flatMap((item: unknown) => {
      if (!item || typeof item !== 'object') return [];
      const raw = item as Record<string, unknown>;
      const rawText =
        typeof raw.m === 'string'
          ? raw.m
          : typeof raw.text === 'string'
            ? raw.text
            : '';
      const text = rawText.trim();
      const parts = typeof raw.p === 'string' ? raw.p.split(',') : [];
      const rawTime =
        parts.length > 0 && parts[0] !== ''
          ? parts[0]
          : typeof raw.t === 'number'
            ? raw.t
            : Number.NaN;
      const time = Number(rawTime);
      if (!text || !Number.isFinite(time) || time < 0 || time > 86400)
        return [];
      const sourceMode = Number(parts[1]);
      const mode = sourceMode === 5 ? 1 : sourceMode === 4 ? 2 : 0;
      const colorValue = Number(parts[3] ?? 16777215);
      const color = `#${(Number.isInteger(colorValue) && colorValue >= 0 && colorValue <= 0xffffff ? colorValue : 0xffffff).toString(16).padStart(6, '0')}`;
      const key = JSON.stringify([time, text, mode, color]);
      if (seen.has(key)) return [];
      seen.add(key);
      return [{ text: text.slice(0, 1000), time, mode, color }];
    })
    .sort((a, b) => a.time - b.time)
    .slice(0, 20000);
}
