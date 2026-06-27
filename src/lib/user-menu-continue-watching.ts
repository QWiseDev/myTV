import type { PlayRecord } from './types';

export const USER_MENU_CONTINUE_WATCHING_LIMIT = 12;
export const USER_MENU_MIN_PLAY_TIME_SECONDS = 120;

export type UserMenuContinueWatchingRecord = PlayRecord & { key: string };

export interface UserMenuContinueWatchingOptions {
  enableProgressFilter: boolean;
  minProgress: number;
  maxProgress: number;
  limit?: number;
}

export function calculatePlayRecordProgress(record: PlayRecord): number {
  if (record.total_time === 0) return 0;

  return (record.play_time / record.total_time) * 100;
}

function shouldShowContinueWatchingRecord(
  record: UserMenuContinueWatchingRecord,
  options: UserMenuContinueWatchingOptions,
): boolean {
  if (record.play_time < USER_MENU_MIN_PLAY_TIME_SECONDS) {
    return false;
  }

  if (!options.enableProgressFilter) {
    return true;
  }

  const progress = calculatePlayRecordProgress(record);

  return progress >= options.minProgress && progress <= options.maxProgress;
}

export function buildUserMenuContinueWatchingRecords(
  records: Record<string, PlayRecord>,
  options: UserMenuContinueWatchingOptions,
): UserMenuContinueWatchingRecord[] {
  return Object.entries(records)
    .map(([key, record]) => ({
      ...record,
      key,
    }))
    .filter((record) => shouldShowContinueWatchingRecord(record, options))
    .sort((left, right) => right.save_time - left.save_time)
    .slice(0, options.limit ?? USER_MENU_CONTINUE_WATCHING_LIMIT);
}
