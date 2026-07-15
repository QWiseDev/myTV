import { db } from './db';
import type { PlayRecord } from './types';
import { invalidateWatchingUpdatesForUser } from './watching-updates-cache';
import { shouldInvalidateWatchingUpdates } from './watching-updates-invalidation';

const playRecordMutationQueues = new Map<string, Promise<void>>();

export async function serializePlayRecordMutation<T>(
  username: string,
  operation: () => Promise<T>,
): Promise<T> {
  const previous = playRecordMutationQueues.get(username) || Promise.resolve();
  const waitForPrevious = previous.catch(() => undefined);
  let release: () => void = () => undefined;
  const current = new Promise<void>((resolve) => {
    release = () => resolve();
  });
  const tail = waitForPrevious.then(() => current);
  playRecordMutationQueues.set(username, tail);

  await waitForPrevious;
  try {
    return await operation();
  } finally {
    release();
    if (playRecordMutationQueues.get(username) === tail) {
      playRecordMutationQueues.delete(username);
    }
  }
}

async function invalidateWatchingUpdates(username: string): Promise<void> {
  try {
    await invalidateWatchingUpdatesForUser(username);
  } catch (error) {
    console.warn('失效追更缓存失败:', error);
  }
}

export async function savePlayRecordMutation(
  username: string,
  source: string,
  id: string,
  record: PlayRecord,
  options: {
    expectedSaveTime?: number;
    requireExisting?: boolean;
  } = {},
): Promise<{ ignored: boolean }> {
  return serializePlayRecordMutation(username, async () => {
    const incomingSaveTime =
      typeof record.save_time === 'number' && Number.isFinite(record.save_time)
        ? record.save_time
        : Date.now();
    const existingRecord = await db.getPlayRecord(username, source, id);

    if (options.requireExisting && !existingRecord) {
      return { ignored: true };
    }

    if (
      options.expectedSaveTime !== undefined &&
      existingRecord?.save_time !== options.expectedSaveTime
    ) {
      return { ignored: true };
    }

    if (
      existingRecord &&
      typeof existingRecord.save_time === 'number' &&
      existingRecord.save_time > incomingSaveTime
    ) {
      return { ignored: true };
    }

    const originalEpisodes =
      record.original_episodes !== undefined &&
      record.original_episodes !== null
        ? record.original_episodes
        : existingRecord?.original_episodes ||
          existingRecord?.total_episodes ||
          record.total_episodes;
    const finalRecord = {
      ...record,
      douban_id: record.douban_id || existingRecord?.douban_id,
      original_episodes: originalEpisodes,
      save_time: incomingSaveTime,
    } as PlayRecord;

    await db.savePlayRecord(username, source, id, finalRecord);
    if (shouldInvalidateWatchingUpdates(existingRecord, finalRecord)) {
      await invalidateWatchingUpdates(username);
    }

    return { ignored: false };
  });
}
