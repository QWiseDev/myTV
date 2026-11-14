'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';

import './ArcadeFruitMachine.css';

import {
  BET_ORDER,
  BIG_PRIZE_ODDS,
  BOARD,
  cellOdds,
  CHIP,
  createEmptyBets,
  FRUIT_GROUPS,
  FruitGroupId,
  getGroup,
  pickTargetIndex,
  rollDoublePoint,
  settleWin,
  totalBetAmount,
} from '@/lib/fruit-machine-arcade';
import { arcadeSfx } from '@/lib/fruit-machine-arcade-sfx';

const wait = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/** 跑灯单步时长：起步加速 → 匀速 → 末段减速（街机手感的关键） */
function stepDuration(step: number, total: number): number {
  const p = step / total;
  if (p < 0.15) return 130 - (p / 0.15) * 88;
  if (p > 0.72) {
    const q = (p - 0.72) / 0.28;
    return 42 + q * q * 250;
  }
  return 42;
}

interface ArcadeFruitMachineProps {
  coins: number;
  onCoinsChange: (newCoins: number) => void;
  onClose?: () => void;
}

interface HubState {
  symbol: string;
  symbolIsText: boolean;
  text: React.ReactNode;
  sub: string;
}

const IDLE_HUB: HubState = {
  symbol: '🍒',
  symbolIsText: false,
  text: '请押注',
  sub: '点图案下注 · 空格开始',
};

type DoubleGuess = 'big' | 'small';

interface DoubleState {
  stake: number;
  point: number;
  big: boolean;
  rolling: boolean;
  revealed: boolean;
  won: boolean | null;
}

export default function ArcadeFruitMachine({
  coins,
  onCoinsChange,
  onClose: _onClose,
}: ArcadeFruitMachineProps) {
  const [credit, setCredit] = useState(coins);
  const [bets, setBets] = useState(createEmptyBets);
  const [lastBets, setLastBets] = useState<Record<FruitGroupId, number> | null>(
    null,
  );
  const [phase, setPhase] = useState<'idle' | 'spinning' | 'result' | 'double'>(
    'idle',
  );
  const [lightIndex, setLightIndex] = useState(0);
  const [winnerIndex, setWinnerIndex] = useState<number | null>(null);
  const [lastWin, setLastWin] = useState(0);
  const [hub, setHub] = useState<HubState>(IDLE_HUB);
  const [hubPopKey, setHubPopKey] = useState(0);
  const [bigWin, setBigWin] = useState(false);
  const [muted, setMuted] = useState(false);
  const [bulbOffset, setBulbOffset] = useState(0);
  const [double, setDouble] = useState<DoubleState>({
    stake: 0,
    point: 0,
    big: false,
    rolling: false,
    revealed: false,
    won: null,
  });

  const creditRef = useRef(coins);
  const lightRef = useRef(0);
  const mountedRef = useRef(true);
  const coinLayerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      arcadeSfx.stopFanfare();
      arcadeSfx.stopDrum();
      arcadeSfx.stopBgm();
    };
  }, []);

  /** 金币与页面/老虎机互通（localStorage 同步由页面层负责） */
  const updateCoins = useCallback(
    (next: number) => {
      creditRef.current = next;
      setCredit(next);
      onCoinsChange(next);
    },
    [onCoinsChange],
  );

  /** 浏览器自动播放策略：首次交互初始化音频并开启 BGM */
  useEffect(() => {
    const kick = () => {
      arcadeSfx.ensure();
      arcadeSfx.startBgm();
      window.removeEventListener('pointerdown', kick);
      window.removeEventListener('keydown', kick);
    };
    window.addEventListener('pointerdown', kick);
    window.addEventListener('keydown', kick);
    return () => {
      window.removeEventListener('pointerdown', kick);
      window.removeEventListener('keydown', kick);
    };
  }, []);

  /** 待机跑马灯 */
  useEffect(() => {
    if (phase !== 'idle' && phase !== 'double') return;
    const timer = setInterval(() => setBulbOffset((o) => (o + 1) % 24), 170);
    return () => clearInterval(timer);
  }, [phase]);

  const totalBet = totalBetAmount(bets);

  /* ---------- 押注 ---------- */

  const placeBet = useCallback(
    (group: FruitGroupId) => {
      if (phase !== 'idle') return;
      if (creditRef.current < CHIP) {
        arcadeSfx.error();
        setHub({ ...IDLE_HUB, text: '余额不足', sub: '点击「上分」继续游戏' });
        return;
      }
      arcadeSfx.ensure();
      arcadeSfx.coin();
      setBets((prev) => ({ ...prev, [group]: prev[group] + 1 }));
      updateCoins(creditRef.current - CHIP);
    },
    [phase, updateCoins],
  );

  const clearBets = useCallback(() => {
    if (phase !== 'idle') return;
    const refund = totalBetAmount(bets);
    if (refund <= 0) return;
    arcadeSfx.click();
    setBets(createEmptyBets());
    updateCoins(creditRef.current + refund);
  }, [phase, bets, updateCoins]);

  const repeatBets = useCallback(() => {
    if (phase !== 'idle' || !lastBets) return;
    const amount = totalBetAmount(lastBets);
    if (amount <= 0) return;
    const refund = totalBetAmount(bets);
    if (creditRef.current + refund < amount) {
      arcadeSfx.error();
      setHub({ ...IDLE_HUB, text: '余额不足', sub: '无法续押上一局' });
      return;
    }
    arcadeSfx.coin();
    setBets({ ...lastBets });
    updateCoins(creditRef.current + refund - amount);
  }, [phase, lastBets, bets, updateCoins]);

  const topUp = useCallback(() => {
    arcadeSfx.ensure();
    arcadeSfx.topup();
    updateCoins(creditRef.current + 1000);
  }, [updateCoins]);

  /* ---------- 开奖 ---------- */

  const backToIdle = useCallback(() => {
    if (!mountedRef.current) return;
    setBets(createEmptyBets());
    setWinnerIndex(null);
    setPhase('idle');
    setHub(IDLE_HUB);
  }, []);

  const coinShower = useCallback((count: number) => {
    const layer = coinLayerRef.current;
    if (!layer) return;
    for (let i = 0; i < count; i++) {
      const coin = document.createElement('div');
      coin.className = 'afm-coin';
      coin.textContent = Math.random() < 0.5 ? '¥' : '★';
      coin.style.left = `${4 + Math.random() * 92}%`;
      coin.style.width = coin.style.height = `${16 + Math.random() * 18}px`;
      coin.style.animationDuration = `${1.1 + Math.random() * 1.2}s`;
      coin.style.animationDelay = `${Math.random() * 0.6}s`;
      coin.style.setProperty('--afm-spin', `${360 + Math.random() * 720}deg`);
      coin.addEventListener('animationend', () => coin.remove());
      layer.appendChild(coin);
    }
  }, []);

  const startSpin = useCallback(async () => {
    if (phase !== 'idle') return;
    const currentBets = bets;
    if (totalBetAmount(currentBets) <= 0) {
      arcadeSfx.error();
      setHub({ ...IDLE_HUB, text: '请先押注', sub: '点图案下注后开始' });
      return;
    }

    setLastBets({ ...currentBets });
    setPhase('spinning');
    setWinnerIndex(null);
    setHub({
      symbol: '🍀',
      symbolIsText: false,
      text: '转动中…',
      sub: '祝你好运',
    });
    arcadeSfx.ensure();
    arcadeSfx.spinStart();

    const target = pickTargetIndex();
    const odds = cellOdds(BOARD[target]);
    const isBigPrize = odds >= BIG_PRIZE_ODDS;
    // 大奖过一格再回拉，制造悬念
    const overshootTarget = isBigPrize ? (target + 2) % 24 : target;
    const start = lightRef.current;
    const totalSteps = 2 * 24 + ((overshootTarget - start + 24) % 24);

    let index = start;
    for (let step = 0; step < totalSteps; step++) {
      if (!mountedRef.current) return;
      index = (index + 1) % 24;
      lightRef.current = index;
      setLightIndex(index);
      arcadeSfx.tick();
      await wait(stepDuration(step, totalSteps));
    }

    if (isBigPrize) {
      // 过格回拉：停两拍 → 退一格 → 悬念 → 落定
      await wait(340);
      if (!mountedRef.current) return;
      index = (index + 23) % 24;
      lightRef.current = index;
      setLightIndex(index);
      arcadeSfx.tick();
      await wait(300);
      if (!mountedRef.current) return;
      await wait(420);
      index = target;
      lightRef.current = index;
      setLightIndex(index);
      arcadeSfx.tick();
    }

    if (!mountedRef.current) return;
    arcadeSfx.land();
    setPhase('result');
    setWinnerIndex(target);

    const win = settleWin(currentBets, target);
    setLastWin(win);
    if (win > 0) {
      updateCoins(creditRef.current + win);
      const group = getGroup(BOARD[target].group);
      setHubPopKey((k) => k + 1);
      setHub({
        symbol: group.icon ?? group.text ?? '🎁',
        symbolIsText: !group.icon,
        text: (
          <>
            {group.name} ×{odds} <span className='afm-plus'>+{win}</span>
          </>
        ),
        sub: '恭喜中奖！',
      });
      if (isBigPrize) {
        setBigWin(true);
        arcadeSfx.startFanfare();
        coinShower(46);
        await wait(2800);
        arcadeSfx.stopFanfare();
        if (!mountedRef.current) return;
        setBigWin(false);
      } else {
        arcadeSfx.winSmall();
        coinShower(Math.min(24, 6 + Math.floor(win / 40)));
        await wait(1700);
        if (!mountedRef.current) return;
      }
      // 中奖后进入猜大小翻倍
      setDouble({
        stake: win,
        point: 0,
        big: false,
        rolling: false,
        revealed: false,
        won: null,
      });
      setPhase('double');
      setHub({
        symbol: '🎲',
        symbolIsText: false,
        text: '猜大小',
        sub: `可翻倍 ${win} 分`,
      });
    } else {
      setHub({
        symbol: '💨',
        symbolIsText: false,
        text: '没中…',
        sub: '再来一把',
      });
      arcadeSfx.lose();
      await wait(1500);
      backToIdle();
    }
  }, [phase, bets, updateCoins, coinShower, backToIdle]);

  /* ---------- 猜大小 ---------- */

  const exitDouble = useCallback(
    (lostStake: number) => {
      if (lostStake > 0) updateCoins(creditRef.current - lostStake);
      setHub({
        symbol: lostStake > 0 ? '💥' : '🎉',
        symbolIsText: false,
        text: lostStake > 0 ? '猜错了…' : '落袋为安',
        sub: `本局 ${lostStake > 0 ? '翻倍失败' : `赢 ${lastWin}`} 分`,
      });
      backToIdle();
    },
    [updateCoins, backToIdle, lastWin],
  );

  const guessDouble = useCallback(
    async (guess: DoubleGuess) => {
      if (double.rolling) return;
      arcadeSfx.ensure();
      setDouble((d) => ({ ...d, rolling: true, revealed: false }));
      arcadeSfx.startDrum();
      await wait(1050);
      if (!mountedRef.current) return;
      arcadeSfx.stopDrum();
      const { point, big } = rollDoublePoint();
      const won = (guess === 'big') === big;
      setDouble((d) => ({
        ...d,
        rolling: false,
        revealed: true,
        point,
        big,
        won,
        stake: won ? d.stake * 2 : d.stake,
      }));
      if (won) {
        arcadeSfx.diceWin();
        coinShower(18);
      } else {
        arcadeSfx.diceLose();
      }
      await wait(1300);
      if (!mountedRef.current) return;
      if (!won) exitDouble(double.stake);
    },
    [double.rolling, double.stake, coinShower, exitDouble],
  );

  const takeDouble = useCallback(() => {
    arcadeSfx.click();
    exitDouble(0);
  }, [exitDouble]);

  /* ---------- 键盘 ---------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (phase === 'double') {
        if (e.key === 'b') void guessDouble('big');
        if (e.key === 's') void guessDouble('small');
        return;
      }
      if (phase !== 'idle') return;
      if (e.code === 'Space') {
        e.preventDefault();
        void startSpin();
        return;
      }
      if (e.key === 'Backspace') {
        e.preventDefault();
        clearBets();
        return;
      }
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= BET_ORDER.length) placeBet(BET_ORDER[n - 1]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, startSpin, clearBets, placeBet, guessDouble]);

  const toggleMute = useCallback(() => {
    const next = !muted;
    setMuted(next);
    arcadeSfx.setMuted(next);
    if (!next) {
      arcadeSfx.ensure();
      arcadeSfx.startBgm();
    }
  }, [muted]);

  /* ---------- 渲染 ---------- */

  const renderBulbs = () =>
    BOARD.map((_, i) => {
      let on = false;
      let blink = false;
      if (phase === 'spinning') {
        const trail = (i - lightIndex + 24) % 24;
        on = trail === 0 || trail === 23;
      } else if (phase === 'result' && winnerIndex !== null) {
        const d = Math.min(
          (i - winnerIndex + 24) % 24,
          (winnerIndex - i + 24) % 24,
        );
        blink = d <= 1;
      } else {
        on = (i + bulbOffset) % 6 === 0 || (i + bulbOffset) % 6 === 1;
      }
      const isRed = i % 6 === 3;
      const cls = [
        'afm-bulb',
        isRed ? 'afm-red' : '',
        blink ? 'afm-win-blink' : '',
        on && !blink ? 'afm-on' : '',
      ]
        .filter(Boolean)
        .join(' ');
      const angle = ((i * 15 + 7.5) * Math.PI) / 180;
      const radius = 48.6;
      const x = 50 + radius * Math.sin(angle);
      const y = 50 - radius * Math.cos(angle);
      return (
        <span key={i} className={cls} style={{ left: `${x}%`, top: `${y}%` }} />
      );
    });

  const renderCells = () =>
    BOARD.map((cell, i) => {
      const group = getGroup(cell.group);
      const odds = cellOdds(cell);
      const angle = (i * 15 * Math.PI) / 180;
      const radius = 42.5;
      const x = 50 + radius * Math.sin(angle);
      const y = 50 - radius * Math.cos(angle);
      const isWinner = phase === 'result' && winnerIndex === i;
      const dim = phase === 'result' && winnerIndex !== null && !isWinner;
      const cls = [
        'afm-cell',
        cell.big ? 'afm-big' : '',
        group.text ? 'afm-text' : '',
        cell.group === 'bar' ? 'afm-bar' : '',
        isWinner ? 'afm-win-flash' : '',
        dim ? 'afm-dim' : '',
      ]
        .filter(Boolean)
        .join(' ');
      return (
        <button
          key={i}
          type='button'
          className={cls}
          style={{ left: `${x}%`, top: `${y}%` }}
          onClick={() => placeBet(cell.group)}
          aria-label={`押注 ${group.name}${cell.big ? '大' : '小'} 赔率${odds}`}
        >
          <span className='afm-ico'>{group.icon ?? group.text}</span>
          <span className='afm-odds'>×{odds}</span>
        </button>
      );
    });

  const betLocked = phase !== 'idle';

  return (
    <div className='afm-root'>
      <div className={`afm-cabinet ${bigWin ? 'afm-frenzy' : ''}`}>
        <header className='afm-marquee'>
          <h1 className='afm-marquee-title'>
            <span className='afm-neon'>怀旧水果机</span>
          </h1>
          <div className='afm-marquee-sub'>FRUIT MACHINE · ARCADE 1998</div>
        </header>

        <div className='afm-board-wrap'>
          {renderBulbs()}
          {renderCells()}
          <div className='afm-hub'>
            <div className='afm-hub-disc' />
            <div
              key={hubPopKey}
              className={`afm-hub-symbol ${hub.symbolIsText ? 'afm-text' : ''} ${hubPopKey ? 'afm-pop' : ''}`}
            >
              {hub.symbol}
            </div>
            <div className='afm-hub-text'>{hub.text}</div>
            <div className='afm-hub-sub'>{hub.sub}</div>
          </div>
        </div>

        <div className='afm-deck'>
          <div className='afm-lcd'>
            <div className='afm-lcd-item'>
              <span className='afm-lcd-label'>余额</span>
              <span className='afm-lcd-val'>{credit.toLocaleString()}</span>
            </div>
            <div className='afm-lcd-item'>
              <span className='afm-lcd-label'>押注</span>
              <span className='afm-lcd-val'>{totalBet.toLocaleString()}</span>
            </div>
            <div className='afm-lcd-item'>
              <span className='afm-lcd-label'>上局赢</span>
              <span className='afm-lcd-val afm-win'>
                {lastWin.toLocaleString()}
              </span>
            </div>
          </div>

          <div className='afm-bet-grid'>
            {FRUIT_GROUPS.map((group, idx) => (
              <button
                key={group.id}
                type='button'
                className={`afm-bet-btn ${group.text ? 'afm-text' : ''} ${group.id === 'bar' ? 'afm-bar' : ''} ${betLocked ? 'afm-locked' : ''}`}
                onClick={() => placeBet(group.id)}
                aria-label={`押注 ${group.name}（键盘 ${idx + 1}）`}
              >
                <span className='afm-b-ico'>{group.icon ?? group.text}</span>
                <span className='afm-b-name'>
                  {group.name} {group.smallOdds}-{group.bigOdds}
                </span>
                <span
                  className={`afm-b-badge ${bets[group.id] > 0 ? 'afm-show' : ''}`}
                >
                  {bets[group.id] * CHIP}
                </span>
              </button>
            ))}
          </div>

          <div className='afm-actions'>
            <button
              type='button'
              className='afm-btn afm-ghost'
              onClick={clearBets}
              disabled={betLocked}
            >
              清注
            </button>
            <button
              type='button'
              className='afm-btn afm-ghost'
              onClick={repeatBets}
              disabled={betLocked || !lastBets}
            >
              续押
            </button>
            <button
              type='button'
              className={`afm-btn afm-start ${phase !== 'idle' || totalBet <= 0 ? 'afm-locked' : ''}`}
              onClick={() => void startSpin()}
            >
              开&nbsp;始
            </button>
            {credit < CHIP && totalBet <= 0 && phase === 'idle' && (
              <button
                type='button'
                className='afm-btn afm-ghost'
                onClick={topUp}
              >
                上分 +1000
              </button>
            )}
            <button
              type='button'
              className='afm-btn afm-ghost'
              onClick={toggleMute}
              title='音效开关'
            >
              {muted ? '🔇' : '🔊'}
            </button>
          </div>

          <div className='afm-hint'>
            点图案押注（{CHIP}分/次） · 空格=开始 · 1-8=押注 · Backspace=清注 ·
            中奖后可猜大小翻倍
          </div>
        </div>
      </div>

      {phase === 'double' && (
        <div className='afm-double-overlay'>
          <div className='afm-double-panel'>
            <h2 className='afm-double-title'>猜大小 · 翻倍</h2>
            <div className='afm-dice-wrap'>
              <div
                className={`afm-dice ${double.rolling ? 'afm-shaking' : ''} ${double.revealed ? 'afm-reveal' : ''}`}
              >
                {double.revealed ? (double.big ? '🔺' : '🔻') : '🎲'}
              </div>
            </div>
            <div className='afm-double-info'>
              {double.revealed ? (
                <span
                  className={`afm-res ${double.big ? 'afm-res-big' : 'afm-res-small'}`}
                >
                  {double.point} 点 · {double.big ? '大' : '小'} ·{' '}
                  {double.won
                    ? `翻倍成功！现在 ${double.stake} 分`
                    : '翻倍失败…'}
                </span>
              ) : (
                <span>
                  可翻倍 <b>{double.stake}</b> 分，猜中 ×2，猜错清零
                </span>
              )}
            </div>
            <div className='afm-double-actions'>
              <button
                type='button'
                className='afm-btn afm-big'
                onClick={() => void guessDouble('big')}
                disabled={double.rolling}
              >
                大
              </button>
              <button
                type='button'
                className='afm-btn afm-small'
                onClick={() => void guessDouble('small')}
                disabled={double.rolling}
              >
                小
              </button>
              <button
                type='button'
                className='afm-btn afm-ghost'
                onClick={takeDouble}
                disabled={double.rolling}
              >
                收下离场
              </button>
            </div>
          </div>
        </div>
      )}

      <div className='afm-coin-layer' ref={coinLayerRef} />
    </div>
  );
}
