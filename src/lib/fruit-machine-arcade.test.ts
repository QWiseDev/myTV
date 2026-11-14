import {
  BET_ORDER,
  BIG_PRIZE_ODDS,
  BOARD,
  cellOdds,
  cellWeight,
  CHIP,
  createEmptyBets,
  FRUIT_GROUPS,
  getGroup,
  pickTargetIndex,
  rollDoublePoint,
  settleWin,
  totalBetAmount,
} from './fruit-machine-arcade';

describe('fruit-machine-arcade', () => {
  it('盘面共 24 格，且每种图案都有小格与大格', () => {
    expect(BOARD).toHaveLength(24);
    for (const group of FRUIT_GROUPS) {
      const cells = BOARD.filter((c) => c.group === group.id);
      expect(cells.length).toBeGreaterThan(0);
      expect(cells.some((c) => !c.big)).toBe(true);
      expect(cells.some((c) => c.big)).toBe(true);
    }
  });

  it('权重均为正数，赔率随大小格递增', () => {
    for (const cell of BOARD) {
      expect(cellWeight(cell)).toBeGreaterThan(0);
      expect(cellOdds(cell)).toBeGreaterThan(0);
    }
    for (const group of FRUIT_GROUPS) {
      expect(group.bigOdds).toBeGreaterThan(group.smallOdds);
    }
  });

  it('pickTargetIndex 始终返回合法下标，且落格频率接近权重分布', () => {
    const samples = 100000;
    const counts = new Array(BOARD.length).fill(0);
    for (let i = 0; i < samples; i++) {
      const idx = pickTargetIndex();
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(24);
      counts[idx]++;
    }
    const totalWeight = BOARD.reduce((sum, c) => sum + cellWeight(c), 0);
    for (let i = 0; i < BOARD.length; i++) {
      const expected = (cellWeight(BOARD[i]) / totalWeight) * samples;
      // 允许 ±30% 相对误差（低权重格的抽样波动大）
      expect(counts[i]).toBeGreaterThan(expected * 0.7);
      expect(counts[i]).toBeLessThan(expected * 1.3);
    }
  });

  it('各图案组的理论返还率约 90%（娱乐向调校，防配置写错）', () => {
    const totalWeight = BOARD.reduce((sum, c) => sum + cellWeight(c), 0);
    for (const group of FRUIT_GROUPS) {
      const rtp =
        BOARD.filter((c) => c.group === group.id).reduce(
          (sum, c) => sum + cellWeight(c) * cellOdds(c),
          0,
        ) / totalWeight;
      expect(rtp).toBeGreaterThan(0.75);
      expect(rtp).toBeLessThan(1.05);
    }
  });

  it('settleWin 按所落格子的赔率结算，未押中为 0', () => {
    const smallAppleIdx = BOARD.findIndex((c) => c.group === 'apple' && !c.big);
    const bigAppleIdx = BOARD.findIndex((c) => c.group === 'apple' && c.big);
    const bets = createEmptyBets();
    bets.apple = 2;
    expect(settleWin(bets, smallAppleIdx)).toBe(
      2 * getGroup('apple').smallOdds * CHIP,
    );
    expect(settleWin(bets, bigAppleIdx)).toBe(
      2 * getGroup('apple').bigOdds * CHIP,
    );

    const orangeIdx = BOARD.findIndex((c) => c.group === 'orange');
    expect(settleWin(bets, orangeIdx)).toBe(0);

    const barIdx = BOARD.findIndex((c) => c.group === 'bar' && c.big);
    bets.bar = 1;
    expect(settleWin(bets, barIdx)).toBe(getGroup('bar').bigOdds * CHIP);
    expect(getGroup('bar').bigOdds).toBeGreaterThanOrEqual(BIG_PRIZE_ODDS);
  });

  it('totalBetAmount 与押注筹码数一致', () => {
    const bets = createEmptyBets();
    bets.apple = 3;
    bets.bar = 1;
    expect(totalBetAmount(bets)).toBe(4 * CHIP);
    expect(BET_ORDER).toHaveLength(FRUIT_GROUPS.length);
  });

  it('rollDoublePoint 点数在 2-13 之间，≥8 为大（无平局）', () => {
    for (let i = 0; i < 500; i++) {
      const { point, big } = rollDoublePoint();
      expect(point).toBeGreaterThanOrEqual(2);
      expect(point).toBeLessThanOrEqual(13);
      expect(big).toBe(point >= 8);
    }
  });
});
