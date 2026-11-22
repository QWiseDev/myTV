// 播放记录写操作按用户串行化的独立模块：无内部依赖，
// 供 play-record-mutations 与 watching-updates-cache 复用（避免循环依赖）。

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
