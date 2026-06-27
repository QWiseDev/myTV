import { useCallback } from 'react';

import { parseStorageKey } from '@/lib/storage-key';
import type { PlayRecord } from '@/lib/types';

type SetPlayRecords = (
  updater: (
    currentRecords: Record<string, PlayRecord> | null,
  ) => Record<string, PlayRecord> | null,
) => void;

interface UsePlayRecordActionsOptions {
  refreshPlayRecords: () => Promise<void> | void;
  setPlayRecords: SetPlayRecords;
}

function reportPlayRecordError(message: string, error: unknown) {
  if (process.env.NODE_ENV !== 'production') {
    console.error(message, error);
  }
}

export function usePlayRecordActions({
  refreshPlayRecords,
  setPlayRecords,
}: UsePlayRecordActionsOptions) {
  const deletePlayRecord = useCallback(
    async (key: string) => {
      let deletedRecord: PlayRecord | undefined;

      try {
        setPlayRecords((currentRecords) => {
          if (!currentRecords || !currentRecords[key]) {
            return currentRecords;
          }

          deletedRecord = currentRecords[key];
          const nextRecords = { ...currentRecords };
          delete nextRecords[key];
          return nextRecords;
        });

        const parsedKey = parseStorageKey(key);
        if (!parsedKey) {
          throw new Error('Invalid play record key');
        }

        const db = await import('@/lib/db.client');
        await db.deletePlayRecord(parsedKey.source, parsedKey.id);
        await refreshPlayRecords();
      } catch (error) {
        setPlayRecords((currentRecords) => {
          if (!deletedRecord || currentRecords?.[key]) {
            return currentRecords;
          }

          return {
            ...(currentRecords || {}),
            [key]: deletedRecord,
          };
        });
        reportPlayRecordError('删除播放记录失败:', error);
      }
    },
    [refreshPlayRecords, setPlayRecords],
  );

  const clearAllPlayRecords = useCallback(async () => {
    try {
      const db = await import('@/lib/db.client');
      await db.clearAllPlayRecords();
      await refreshPlayRecords();
    } catch (error) {
      reportPlayRecordError('清空播放记录失败:', error);
    }
  }, [refreshPlayRecords]);

  return {
    deletePlayRecord,
    clearAllPlayRecords,
  };
}
