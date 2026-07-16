import { useCallback, useRef } from 'react';

import { parseStorageKey } from '@/lib/storage-key';
import type { PlayRecord } from '@/lib/types';

type SetPlayRecords = (
  updater: (
    currentRecords: Record<string, PlayRecord> | null,
  ) => Record<string, PlayRecord> | null,
) => void;

interface PlayRecordsClearMutation {
  commit: () => void;
  rollback: () => void;
}

interface UsePlayRecordActionsOptions {
  setPlayRecords: SetPlayRecords;
  markPlayRecordDeleted?: (key: string) => (() => void) | void;
  markAllPlayRecordsDeleted?: () => PlayRecordsClearMutation | void;
}

function reportPlayRecordError(message: string, error: unknown) {
  if (process.env.NODE_ENV !== 'production') {
    console.error(message, error);
  }
}

export function usePlayRecordActions({
  markAllPlayRecordsDeleted,
  markPlayRecordDeleted,
  setPlayRecords,
}: UsePlayRecordActionsOptions) {
  const actionRevisionRef = useRef(0);
  const successfulClearRevisionRef = useRef(0);
  const pendingDeletePromisesRef = useRef<Map<string, Promise<void>>>(
    new Map(),
  );
  const pendingClearPromiseRef = useRef<Promise<void> | null>(null);

  const deletePlayRecord = useCallback(
    (key: string): Promise<void> => {
      const pendingDelete = pendingDeletePromisesRef.current.get(key);
      if (pendingDelete) return pendingDelete;

      const clearAtStart = pendingClearPromiseRef.current;
      const successfulClearRevisionBeforeWait =
        successfulClearRevisionRef.current;
      const trackedDelete = (async () => {
        let deletedRecord: PlayRecord | undefined;
        let rollbackOptimisticDelete: (() => void) | undefined;

        if (clearAtStart) {
          await clearAtStart;
          if (
            successfulClearRevisionRef.current !==
            successfulClearRevisionBeforeWait
          ) {
            return;
          }
        }

        const successfulClearRevision = successfulClearRevisionRef.current;
        actionRevisionRef.current += 1;

        try {
          const parsedKey = parseStorageKey(key);
          if (!parsedKey) {
            throw new Error('Invalid play record key');
          }

          setPlayRecords((currentRecords) => {
            if (!currentRecords || !currentRecords[key]) {
              return currentRecords;
            }

            deletedRecord = currentRecords[key];
            const nextRecords = { ...currentRecords };
            delete nextRecords[key];
            return nextRecords;
          });
          rollbackOptimisticDelete = markPlayRecordDeleted?.(key) || undefined;

          const db = await import('@/lib/db.client');
          await db.deletePlayRecord(parsedKey.source, parsedKey.id);
        } catch (error) {
          const pendingClear = pendingClearPromiseRef.current;
          if (pendingClear) {
            await pendingClear;
          }

          if (successfulClearRevisionRef.current === successfulClearRevision) {
            rollbackOptimisticDelete?.();
            if (!rollbackOptimisticDelete) {
              setPlayRecords((currentRecords) => {
                if (!deletedRecord || currentRecords?.[key]) {
                  return currentRecords;
                }

                return {
                  ...(currentRecords || {}),
                  [key]: deletedRecord,
                };
              });
            }
          }
          reportPlayRecordError('删除播放记录失败:', error);
        }
      })().finally(() => {
        if (pendingDeletePromisesRef.current.get(key) === trackedDelete) {
          pendingDeletePromisesRef.current.delete(key);
        }
      });
      pendingDeletePromisesRef.current.set(key, trackedDelete);
      return trackedDelete;
    },
    [markPlayRecordDeleted, setPlayRecords],
  );

  const clearAllPlayRecords = useCallback((): Promise<void> => {
    if (pendingClearPromiseRef.current) {
      return pendingClearPromiseRef.current;
    }

    const actionRevision = ++actionRevisionRef.current;
    const trackedClear = (async () => {
      let previousRecords: Record<string, PlayRecord> | null = null;
      let clearMutation: PlayRecordsClearMutation | undefined;
      try {
        clearMutation = markAllPlayRecordsDeleted?.() || undefined;
        setPlayRecords((currentRecords) => {
          previousRecords = currentRecords;
          return {};
        });

        const db = await import('@/lib/db.client');
        await db.clearAllPlayRecords();
        successfulClearRevisionRef.current += 1;
        clearMutation?.commit();
      } catch (error) {
        if (actionRevisionRef.current === actionRevision) {
          if (clearMutation) {
            clearMutation.rollback();
          } else {
            setPlayRecords(() => previousRecords);
          }
        } else {
          clearMutation?.commit();
        }
        reportPlayRecordError('清空播放记录失败:', error);
      }
    })().finally(() => {
      if (pendingClearPromiseRef.current === trackedClear) {
        pendingClearPromiseRef.current = null;
      }
    });
    pendingClearPromiseRef.current = trackedClear;
    return trackedClear;
  }, [markAllPlayRecordsDeleted, setPlayRecords]);

  return {
    deletePlayRecord,
    clearAllPlayRecords,
  };
}
