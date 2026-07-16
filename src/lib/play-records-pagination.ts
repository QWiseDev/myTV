import type {
  PlayRecord,
  PlayRecordsPage,
  PlayRecordsPageOptions,
} from './types';

export const DEFAULT_PLAY_RECORDS_PAGE_SIZE = 30;
export const MAX_PLAY_RECORDS_PAGE_SIZE = 100;

interface DecodedCursor {
  key: string;
  saveTime: number;
}

export function normalizePlayRecordsPageSize(
  value: unknown,
  fallback = DEFAULT_PLAY_RECORDS_PAGE_SIZE,
): number {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number.parseInt(value, 10)
        : fallback;

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(MAX_PLAY_RECORDS_PAGE_SIZE, Math.max(1, Math.trunc(parsed)));
}

export function sortPlayRecordEntries(
  records: Record<string, PlayRecord>,
): Array<[string, PlayRecord]> {
  return Object.entries(records).sort(([leftKey, left], [rightKey, right]) => {
    const timeDiff = (right.save_time || 0) - (left.save_time || 0);
    if (timeDiff !== 0) return timeDiff;
    return leftKey.localeCompare(rightKey);
  });
}

export function encodePlayRecordsCursor(
  key: string,
  record: PlayRecord,
): string {
  return `${record.save_time || 0}:${encodeURIComponent(key)}`;
}

export function decodePlayRecordsCursor(
  cursor?: string | null,
): DecodedCursor | null {
  if (!cursor) return null;

  const separatorIndex = cursor.indexOf(':');
  if (separatorIndex <= 0) return null;

  const saveTime = Number.parseInt(cursor.slice(0, separatorIndex), 10);
  if (!Number.isFinite(saveTime)) return null;

  try {
    return {
      saveTime,
      key: decodeURIComponent(cursor.slice(separatorIndex + 1)),
    };
  } catch {
    return null;
  }
}

function isEntryAfterCursor(
  [key, record]: [string, PlayRecord],
  cursor: DecodedCursor,
): boolean {
  const saveTime = record.save_time || 0;
  if (saveTime < cursor.saveTime) return true;
  if (saveTime > cursor.saveTime) return false;
  return key.localeCompare(cursor.key) > 0;
}

export function paginatePlayRecords(
  records: Record<string, PlayRecord>,
  options: PlayRecordsPageOptions = {},
): PlayRecordsPage {
  const pageSize = normalizePlayRecordsPageSize(options.pageSize);
  const entries = sortPlayRecordEntries(records);
  const includeKeys = new Set(options.includeKeys || []);
  const regularEntries = entries.filter(([key]) => !includeKeys.has(key));
  const cursor = decodePlayRecordsCursor(options.cursor);
  const cursorStartIndex = cursor
    ? regularEntries.findIndex((entry) => isEntryAfterCursor(entry, cursor))
    : 0;
  const startIndex = cursor
    ? cursorStartIndex === -1
      ? regularEntries.length
      : cursorStartIndex
    : 0;
  const pageEntries = regularEntries.slice(startIndex, startIndex + pageSize);
  const includedEntries = cursor
    ? []
    : entries.filter(([key]) => includeKeys.has(key));
  const resultEntries = [...pageEntries, ...includedEntries];
  const hasMore = startIndex + pageEntries.length < regularEntries.length;
  const lastEntry = pageEntries[pageEntries.length - 1];

  return {
    records: Object.fromEntries(resultEntries),
    pageSize,
    nextCursor:
      hasMore && lastEntry
        ? encodePlayRecordsCursor(lastEntry[0], lastEntry[1])
        : null,
    hasMore,
    total: entries.length,
  };
}
