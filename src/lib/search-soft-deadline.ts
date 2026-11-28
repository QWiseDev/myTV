/**
 * 聚合搜索软截止早退收集器（消除 Promise.allSettled 木桶效应）
 *
 * 规则：
 * 1. 所有源在软截止（默认 3.5s）前完成 -> 全量返回（earlyReturned: false）；
 * 2. 达到软截止且已满足最低召回条件（已有结果，且命中源数 >= minNonEmptySources 或已完成比例 >= minCompletedRatio）
 *    -> 立即早退返回已收集结果（earlyReturned: true），不再死等最后 1~2 个慢源；
 * 3. 若软截止时尚无任何结果（如生僻片只有慢源有）-> 继续等待，一旦收到首个非空结果或全部结束立即返回；
 * 4. 被早退甩在后面的慢源不会被强行取消，继续在后台自然收尾，结果照常落入 search-cache、耗时/超时照常记入 site-health。
 */

export const SEARCH_SOFT_DEADLINE_MS = 3_500;
const DEFAULT_MIN_NON_EMPTY_SOURCES = 3;
const DEFAULT_MIN_COMPLETED_RATIO = 0.5;

export interface SoftDeadlineOptions {
  softDeadlineMs?: number;
  minNonEmptySources?: number;
  minCompletedRatio?: number;
}

export interface SoftDeadlineResult<T> {
  results: T[];
  completedCount: number;
  totalCount: number;
  earlyReturned: boolean;
}

export function collectSearchResultsWithSoftDeadline<T>(
  tasks: Array<Promise<T[]>>,
  options: SoftDeadlineOptions = {},
): Promise<SoftDeadlineResult<T>> {
  const totalCount = tasks.length;
  if (totalCount === 0) {
    return Promise.resolve({
      results: [],
      completedCount: 0,
      totalCount: 0,
      earlyReturned: false,
    });
  }

  const softDeadlineMs = options.softDeadlineMs ?? SEARCH_SOFT_DEADLINE_MS;
  const minNonEmptySources =
    options.minNonEmptySources ?? DEFAULT_MIN_NON_EMPTY_SOURCES;
  const minCompletedRatio =
    options.minCompletedRatio ?? DEFAULT_MIN_COMPLETED_RATIO;

  return new Promise((resolve) => {
    const collected: T[] = [];
    let completedCount = 0;
    let nonEmptySourceCount = 0;
    let softDeadlineReached = false;
    let settled = false;

    const finish = (earlyReturned: boolean) => {
      if (settled) return;
      settled = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      resolve({
        results: collected.slice(),
        completedCount,
        totalCount,
        earlyReturned,
      });
    };

    const hasEnoughForEarlyReturn = () =>
      collected.length > 0 &&
      (nonEmptySourceCount >= minNonEmptySources ||
        completedCount / totalCount >= minCompletedRatio);

    let timer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
      timer = null;
      softDeadlineReached = true;
      if (hasEnoughForEarlyReturn()) {
        finish(true);
      }
    }, softDeadlineMs);

    tasks.forEach((task) => {
      task
        .then((items) => {
          completedCount += 1;
          if (Array.isArray(items) && items.length > 0) {
            nonEmptySourceCount += 1;
            collected.push(...items);
          }

          if (settled) return;

          if (completedCount >= totalCount) {
            finish(false);
            return;
          }

          // 软截止已过但此前 0 结果：一旦首个慢源带回非空结果立即返回，不继续干等其余死源
          if (softDeadlineReached && collected.length > 0) {
            finish(true);
          }
        })
        .catch(() => {
          completedCount += 1;
          if (settled) return;
          if (completedCount >= totalCount) {
            finish(false);
          } else if (softDeadlineReached && hasEnoughForEarlyReturn()) {
            finish(true);
          }
        });
    });
  });
}
