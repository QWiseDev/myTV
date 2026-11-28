import {
  collectSearchResultsWithSoftDeadline,
  SEARCH_SOFT_DEADLINE_MS,
} from './search-soft-deadline';

function createDeferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  let reject: (reason?: unknown) => void = () => undefined;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('collectSearchResultsWithSoftDeadline 聚合搜索软截止早退', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('全部源在软截止前完成时全量返回且 earlyReturned=false', async () => {
    const res = await collectSearchResultsWithSoftDeadline([
      Promise.resolve(['a1']),
      Promise.resolve(['b1', 'b2']),
    ]);

    expect(res).toEqual({
      results: ['a1', 'b1', 'b2'],
      completedCount: 2,
      totalCount: 2,
      earlyReturned: false,
    });
  });

  test('超过软截止且已有足够快源返回时立即早退，不再等待长尾慢源', async () => {
    const slowStraggler = createDeferred<string[]>();
    let stragglerSettledAfterReturn = false;
    void slowStraggler.promise.then(() => {
      stragglerSettledAfterReturn = true;
    });

    const promise = collectSearchResultsWithSoftDeadline(
      [
        Promise.resolve(['fast-1']),
        Promise.resolve(['fast-2']),
        slowStraggler.promise,
      ],
      { softDeadlineMs: 3500 },
    );

    // 先刷新微任务，模拟 2 个快源在软截止前已返回
    await Promise.resolve();
    // 推进到软截止：2/3 源已完成且有结果 -> 立即早退
    jest.advanceTimersByTime(3500);
    const res = await promise;

    expect(res.earlyReturned).toBe(true);
    expect(res.completedCount).toBe(2);
    expect(res.totalCount).toBe(3);
    expect(res.results).toEqual(['fast-1', 'fast-2']);
    expect(stragglerSettledAfterReturn).toBe(false);

    // 长尾慢源仍可在后台自然完成（写入缓存/上报健康度）
    slowStraggler.resolve(['late-1']);
    await Promise.resolve();
    expect(stragglerSettledAfterReturn).toBe(true);
  });

  test('生僻片在软截止时尚无任何结果时继续等待，首个慢源带回结果后立即返回', async () => {
    const slowHit = createDeferred<string[]>();
    const deadSource = createDeferred<string[]>();

    const promise = collectSearchResultsWithSoftDeadline(
      [Promise.resolve([]), slowHit.promise, deadSource.promise],
      { softDeadlineMs: SEARCH_SOFT_DEADLINE_MS },
    );

    let resolved = false;
    void promise.then(() => {
      resolved = true;
    });

    // 3.5s 软截止时仍为 0 结果：不早退，保证召回
    jest.advanceTimersByTime(SEARCH_SOFT_DEADLINE_MS);
    await Promise.resolve();
    expect(resolved).toBe(false);

    // 4.2s 时慢源带回结果：立即早退返回，不等 deadSource
    slowHit.resolve(['rare-movie']);
    const res = await promise;
    expect(res.earlyReturned).toBe(true);
    expect(res.results).toEqual(['rare-movie']);
  });
});
