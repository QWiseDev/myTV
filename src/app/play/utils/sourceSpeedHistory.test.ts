import {
  clearSourceSpeedHistory,
  createSourceHistoryLookup,
  getSourceHistoryGrade,
  getSourceHistoryScore,
  getSourceSpeedHistory,
  getStallsPer10Min,
  isSourceHistoricallySlow,
  recordSourceSpeedSession,
} from './sourceSpeedHistory';

describe('sourceSpeedHistory', () => {
  beforeEach(() => {
    localStorage.clear();
    clearSourceSpeedHistory();
  });

  afterEach(() => {
    clearSourceSpeedHistory();
    localStorage.clear();
  });

  it('records and merges weighted speed ratio, TTFB, stalls, and played seconds across sessions', () => {
    const now = 1_700_000_000_000;

    recordSourceSpeedSession(
      'src_a',
      {
        speedRatio: 4,
        ttfbMs: 300,
        throughputBps: 8_000_000,
        newSamples: 4,
        newStalls: 0,
        newPlayedSeconds: 180,
      },
      now,
    );

    recordSourceSpeedSession(
      'src_a',
      {
        speedRatio: 2,
        ttfbMs: 900,
        throughputBps: 4_000_000,
        newSamples: 4,
        newStalls: 1,
        newPlayedSeconds: 120,
      },
      now + 10_000,
    );

    const entry = getSourceSpeedHistory('src_a', now + 10_000);
    expect(entry).not.toBeNull();
    expect(entry?.speedRatio).toBeCloseTo(3, 5);
    expect(entry?.ttfbMs).toBeCloseTo(600, 5);
    expect(entry?.throughputBps).toBeCloseTo(6_000_000, 0);
    expect(entry?.samples).toBe(8);
    expect(entry?.stalls).toBe(1);
    expect(entry?.playedSeconds).toBe(300);
  });

  it('ignores tiny sessions with insufficient evidence when scoring', () => {
    const now = 1_700_000_000_000;
    recordSourceSpeedSession(
      'src_tiny',
      {
        speedRatio: 1.1,
        ttfbMs: 3000,
        newSamples: 2,
        newStalls: 1,
        newPlayedSeconds: 30,
      },
      now,
    );

    expect(
      getSourceHistoryScore(getSourceSpeedHistory('src_tiny', now), now),
    ).toBeNull();
    expect(getSourceHistoryGrade('src_tiny', now)).toBe('unknown');
    expect(isSourceHistoricallySlow('src_tiny', now)).toBe(false);
  });

  it('grades fast smooth sources as good and stalling slow sources as bad', () => {
    const now = 1_700_000_000_000;

    recordSourceSpeedSession(
      'fast_src',
      {
        speedRatio: 6,
        ttfbMs: 200,
        newSamples: 10,
        newStalls: 0,
        newPlayedSeconds: 600,
      },
      now,
    );

    recordSourceSpeedSession(
      'bad_src',
      {
        speedRatio: 1.1,
        ttfbMs: 2600,
        newSamples: 6,
        newStalls: 4,
        newPlayedSeconds: 300,
      },
      now,
    );

    expect(getSourceHistoryGrade('fast_src', now)).toBe('good');
    expect(isSourceHistoricallySlow('fast_src', now)).toBe(false);

    expect(getSourceHistoryGrade('bad_src', now)).toBe('bad');
    expect(isSourceHistoricallySlow('bad_src', now)).toBe(true);
    const badEntry = getSourceSpeedHistory('bad_src', now);
    expect(badEntry).not.toBeNull();
    if (!badEntry) throw new Error('expected bad_src entry');
    expect(getStallsPer10Min(badEntry)).toBeCloseTo(8, 5);

    const lookup = createSourceHistoryLookup(now);
    expect(lookup.getGrade('fast_src')).toBe('good');
    expect(lookup.getGrade('bad_src')).toBe('bad');
    expect(lookup.getGrade('unknown_src')).toBe('unknown');
    expect(lookup.getScore('fast_src') ?? 0).toBeGreaterThan(85);
    expect(lookup.getScore('bad_src') ?? 100).toBeLessThan(20);
  });

  it('decays stale entries toward neutral score after 7 days and expires after 30 days', () => {
    const t0 = 1_700_000_000_000;
    const DAY = 24 * 60 * 60 * 1000;

    recordSourceSpeedSession(
      'old_bad',
      {
        speedRatio: 1.0,
        ttfbMs: 3000,
        newSamples: 10,
        newStalls: 5,
        newPlayedSeconds: 300,
      },
      t0,
    );

    const freshScore = getSourceHistoryScore(
      getSourceSpeedHistory('old_bad', t0),
      t0,
    );
    const agedNow = t0 + 18 * DAY;
    const agedScore = getSourceHistoryScore(
      getSourceSpeedHistory('old_bad', agedNow),
      agedNow,
    );

    expect(freshScore).not.toBeNull();
    expect(agedScore).not.toBeNull();
    if (freshScore === null || agedScore === null) {
      throw new Error('expected history scores');
    }
    expect(freshScore).toBeLessThan(15);
    expect(agedScore).toBeGreaterThan(freshScore);
    expect(agedScore).toBeLessThan(50);
    // 超过 7 天不再触发慢源热启动
    expect(isSourceHistoricallySlow('old_bad', agedNow)).toBe(false);

    // 超过 30 天过期清除
    expect(getSourceSpeedHistory('old_bad', t0 + 31 * DAY)).toBeNull();
  });

  it('proportionally scales stalls when playedSeconds exceeds rolling 2-hour window', () => {
    const now = 1_700_000_000_000;
    recordSourceSpeedSession(
      'long_src',
      {
        speedRatio: 4,
        newSamples: 10,
        newStalls: 4,
        newPlayedSeconds: 7200,
      },
      now,
    );
    recordSourceSpeedSession(
      'long_src',
      {
        speedRatio: 4,
        newSamples: 10,
        newStalls: 0,
        newPlayedSeconds: 7200,
      },
      now + 1000,
    );

    const entry = getSourceSpeedHistory('long_src', now + 1000);
    expect(entry).not.toBeNull();
    if (!entry) throw new Error('expected long_src entry');
    expect(entry.playedSeconds).toBe(7200);
    expect(entry.stalls).toBeCloseTo(2, 2);
  });

  it('recovers gracefully from corrupt localStorage JSON', () => {
    localStorage.setItem('player_source_speed_history_v1', '{broken');
    expect(getSourceSpeedHistory('src_a')).toBeNull();
    expect(getSourceHistoryGrade('src_a')).toBe('unknown');
  });
});
