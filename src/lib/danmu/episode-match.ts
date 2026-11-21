/**
 * 综艺集名的智能匹配纯函数。
 *
 * 综艺本地集名（如「第20261022期第01期」「第20261022期沉浸版」「第20261029期上」）
 * 与 danmu_api 一侧的集名（「第1期：xxx」「20261022期 xxx」）及番剧条目
 * （正片 / 沉浸版 / 加更分条目）对不齐时，纯序数映射会错绑或拿空。
 * 这里提供日期 / 版式 / 序数三个维度的解析与综合打分，供服务端匹配使用。
 *
 * 本模块必须保持无服务端依赖：客户端（播放页）也要用它计算集名元数据。
 */

import type { KlmEpisodeMatch } from './types';

/** 从集名解析日期并归一化为 YYYYMMDD；无法解析返回 null */
export function extractEpisodeDate(
  title: string,
  fallbackYear?: string | null,
): string | null {
  if (!title) return null;

  const normalize = (y: string, m: string, d: string) =>
    `${y}${m.padStart(2, '0')}${d.padStart(2, '0')}`;

  // 紧凑 8 位日期（月日两位零填充）：第20261022期
  const compact = title.match(
    /(20\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])(?!\d)/,
  );
  if (compact) {
    return normalize(compact[1], compact[2], compact[3]);
  }

  // 带分隔符：2026-10-22、2026.10.22、2026年10月22日
  const full = title.match(
    /(20\d{2})\s*[年\-/.]\s*(\d{1,2})\s*[月\-/.]\s*(\d{1,2})\s*[日号]?/,
  );
  if (full) {
    return normalize(full[1], full[2], full[3]);
  }

  // 只有月日（10月22日）：年份用兜底年份补齐
  const monthDay = title.match(
    /(?:^|[^\d])(1[0-2]|0?[1-9])\s*[月]\s*(\d{1,2})\s*[日号]?/,
  );
  const year = Number.parseInt(fallbackYear || '', 10);
  if (monthDay && year >= 2000 && year <= 2099) {
    return normalize(String(year), monthDay[1], monthDay[2]);
  }

  return null;
}

/** 衍生版式词表（正片之外的特别内容） */
const EPISODE_VARIANT_PATTERNS: Array<{ key: string; pattern: RegExp }> = [
  { key: '沉浸版', pattern: /沉浸/ },
  { key: '加更', pattern: /加更/ },
  { key: '抢鲜', pattern: /抢[鲜先]/ },
  { key: '纯享', pattern: /纯享/ },
  { key: '花絮', pattern: /花絮/ },
  { key: '预告', pattern: /预告/ },
];

/** 版式归类：命中衍生词返回该词，否则为「正片」 */
export function extractEpisodeVariant(title: string): string {
  for (const { key, pattern } of EPISODE_VARIANT_PATTERNS) {
    if (pattern.test(title)) return key;
  }
  return '正片';
}

/** 上/下拆分方向：「第20261029期上」「第3期上：xxx」「沉浸版上：xxx」→ 上/下；无拆分返回 null */
export function extractEpisodeSplitDirection(
  title: string,
): '上' | '下' | null {
  if (!title) return null;
  const matched = title.match(/(?:期|版)\s*(上|下)(?=[：:）)\s]|$)/);
  return matched ? (matched[1] as '上' | '下') : null;
}

/** 上/下拆分标记（同一期拆成两段），不算独立版式 */
export function hasEpisodeSplitMark(title: string): boolean {
  return extractEpisodeSplitDirection(title) !== null;
}

/** 从「第2集/第02集/第二集/EP02/[02]」等标题中解析集数，无法解析返回 null */
export function extractEpisodeNumber(episodeTitle: string): number | null {
  if (!episodeTitle) return null;

  // EP01 / E02 / [03] 前缀写法（部分源站不用「第N期」）
  const prefixed = episodeTitle.match(/(?:\bEP|\bE)\s*0*(\d{1,4})\b/i);
  if (prefixed) {
    const num = Number.parseInt(prefixed[1], 10);
    if (Number.isFinite(num) && num > 0) return num;
  }
  const bracketed = episodeTitle.match(/\[\s*0*(\d{1,4})\s*\]/);
  if (bracketed) {
    const num = Number.parseInt(bracketed[1], 10);
    if (Number.isFinite(num) && num > 0) return num;
  }

  const arabic = episodeTitle.match(/第\s*(\d{1,4})\s*[集话期]/);
  if (arabic) {
    const num = Number.parseInt(arabic[1], 10);
    return Number.isFinite(num) ? num : null;
  }

  const chinese = episodeTitle.match(
    /第\s*([零一二三四五六七八九十]{1,7})\s*[集话期]/,
  );
  if (!chinese) return null;

  const digits: Record<string, number> = {
    零: 0,
    一: 1,
    二: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
  };
  const text = chinese[1];
  if (text === '十') return 10;

  // 十X / X十 / X十Y
  const shiMatch = text.match(
    /^(?:([一二三四五六七八九])?十)(?:([一二三四五六七八九]))?$/,
  );
  if (shiMatch) {
    const tens = shiMatch[1] ? digits[shiMatch[1]] : 1;
    const ones = shiMatch[2] ? digits[shiMatch[2]] : 0;
    return tens * 10 + ones;
  }

  // 纯数字串（如 一二三）
  if (/^[零一二三四五六七八九]+$/.test(text)) {
    const num = Number.parseInt(
      text
        .split('')
        .map((char) => digits[char])
        .join(''),
      10,
    );
    return Number.isFinite(num) ? num : null;
  }

  return null;
}

/** 综艺集名在本地列表中按同版式计数的序号（沉浸版第几期等），从 1 起 */
export function computeVariantOrdinal(
  episodes: string[],
  index: number,
): number {
  const target = episodes[index];
  if (!target) return 0;
  const variant = extractEpisodeVariant(target);
  if (variant === '正片') return index + 1;

  let ordinal = 0;
  for (let i = 0; i <= index; i += 1) {
    if (extractEpisodeVariant(episodes[i] || '') === variant) ordinal += 1;
  }
  return ordinal;
}

export interface EpisodeCandidateLike {
  animeTitle?: string;
  episodeTitle?: string;
}

export interface EpisodeMatchTarget {
  /** 影片标题（用于番剧条目的归一化包含判断） */
  title: string;
  /** 年份（用于番剧条目的年份加分） */
  year?: string | null;
  /** 期望序数：正片=全局集数；衍生版=同版式内的序数 */
  episodeNum: number;
  /** 本地集名解析出的日期（YYYYMMDD），无则 null */
  date: string | null;
  /** 本地集名的版式 */
  variant: string;
  /** 本地集名的上/下拆分方向，无拆分则 null */
  splitDirection: '上' | '下' | null;
}

function normalizeTitleText(text: string): string {
  return text.replace(/[\s\p{P}]+/gu, '').toLowerCase();
}

/**
 * 对单个候选集（danmu_api 的番剧条目 + 集名）打分，分数越高越可能是
 * 本地集名对应的弹幕集。仅用于多个合法候选之间排序，不判断绝对可用性。
 *
 * 权重设计：版式 > 日期 > 序数 —— 综艺的沉浸版/加更与正片同天播出，
 * 日期无法区分版式，版式错绑是最伤的（内容完全不同）；日期用于跨天
 * 对齐；序数是原生对齐信号但在多版式下不可靠。
 */
export function scoreEpisodeCandidate(
  candidate: EpisodeCandidateLike,
  target: EpisodeMatchTarget,
): number {
  let score = 0;
  const combined = `${candidate.animeTitle || ''} ${candidate.episodeTitle || ''}`;

  // 日期：双方都能解析出日期时是最强的对齐信号
  const candidateDate =
    extractEpisodeDate(candidate.episodeTitle || '') ??
    extractEpisodeDate(candidate.animeTitle || '');
  if (target.date && candidateDate) {
    if (candidateDate === target.date) score += 40;
    else score -= 20;
  }

  // 序数：目标序数（衍生版已换算为同版式内序数）
  const candidateNum = extractEpisodeNumber(candidate.episodeTitle || '');
  if (candidateNum !== null && target.episodeNum > 0) {
    if (candidateNum === target.episodeNum) score += 30;
    else score -= 10;
  }

  // 版式：目标衍生版要找同版式条目；目标正片时衍生版重罚
  const candidateVariant = extractEpisodeVariant(combined);
  if (target.variant !== '正片') {
    if (candidateVariant === target.variant) score += 50;
    else score -= 40;
  } else if (candidateVariant !== '正片') {
    score -= 40;
  }

  // 上/下方向：同一天的同版式常拆成上下两段，方向不一致重罚
  if (target.splitDirection) {
    const candidateDirection = extractEpisodeSplitDirection(
      candidate.episodeTitle || '',
    );
    if (candidateDirection) {
      score += candidateDirection === target.splitDirection ? 15 : -15;
    }
  }

  // 番剧标题与影片标题的包含关系 + 年份命中
  const candidateAnime = normalizeTitleText(candidate.animeTitle || '');
  const queryTitle = normalizeTitleText(target.title);
  if (queryTitle && candidateAnime) {
    if (
      candidateAnime.includes(queryTitle) ||
      queryTitle.includes(candidateAnime)
    ) {
      score += 10;
    } else {
      const common = Array.from(queryTitle).filter((char) =>
        candidateAnime.includes(char),
      ).length;
      if (queryTitle.length > 0 && common / queryTitle.length < 0.5) {
        score -= 15;
      }
    }
  }
  const year = (target.year || '').trim();
  if (year && (candidate.animeTitle || '').includes(year)) score += 30;

  return score;
}

/** 在候选列表里挑最优集（按 scoreEpisodeCandidate 降序） */
export function pickBestEpisodeCandidate(
  candidates: KlmEpisodeMatch[],
  target: EpisodeMatchTarget,
): KlmEpisodeMatch | null {
  if (candidates.length === 0) return null;
  return [...candidates].sort(
    (a, b) =>
      scoreEpisodeCandidate(b, target) - scoreEpisodeCandidate(a, target),
  )[0];
}
