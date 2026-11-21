import { parseStorageKey } from './storage-key';
import type { PlayRecord } from './types';

export interface PlayRecordMergeCandidate {
  key: string;
  record: PlayRecord;
}

/**
 * 判断两条播放记录是否为同一部作品：
 * - 双方都有豆瓣 ID 时以豆瓣 ID 为准（最可靠，标题改名也能对上）；
 * - 否则标题一致（trim 后精确相等）且年份兼容（任一缺省或相等）视为同一作品。
 */
function isSameShow(a: PlayRecord, b: PlayRecord): boolean {
  const doubanA = a.douban_id ? Number(a.douban_id) : 0;
  const doubanB = b.douban_id ? Number(b.douban_id) : 0;
  if (doubanA > 0 && doubanB > 0) {
    return doubanA === doubanB;
  }

  const titleA = (a.title || '').trim();
  const titleB = (b.title || '').trim();
  if (!titleA || titleA !== titleB) {
    return false;
  }

  const yearA = (a.year || '').trim();
  const yearB = (b.year || '').trim();
  if (yearA && yearB && yearA !== yearB) {
    return false;
  }

  return true;
}

/**
 * 找出与 incoming 同一部作品、但存储键不同的播放记录（跨源/跨条目同名）。
 * 保存时用于合并：同名只留最新一条，其余删除。
 */
export function findCrossKeySameShowRecords(
  incoming: PlayRecord,
  incomingKey: string,
  records: Record<string, PlayRecord>,
): PlayRecordMergeCandidate[] {
  const candidates: PlayRecordMergeCandidate[] = [];
  for (const [key, record] of Object.entries(records)) {
    if (key === incomingKey) continue;
    if (!parseStorageKey(key)) continue;
    if (!isSameShow(incoming, record)) continue;
    candidates.push({ key, record });
  }
  return candidates;
}
