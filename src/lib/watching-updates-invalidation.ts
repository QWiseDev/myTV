import type { PlayRecord } from './types';

const WATCHING_UPDATE_FIELDS: Array<keyof PlayRecord> = [
  'index',
  'total_episodes',
  'original_episodes',
  'title',
  'source_name',
  'year',
  'douban_id',
  'cover',
  'remarks',
];

export function shouldInvalidateWatchingUpdates(
  currentRecord: PlayRecord | null,
  nextRecord: PlayRecord,
): boolean {
  if (!currentRecord) {
    return nextRecord.total_episodes > 1;
  }

  return WATCHING_UPDATE_FIELDS.some(
    (field) => currentRecord[field] !== nextRecord[field],
  );
}
