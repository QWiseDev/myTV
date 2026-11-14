/**
 * 街机水果机音效引擎（Web Audio 实时合成，无外部音频素材）。
 *
 * 还原游戏厅机台的听觉记忆：
 * - 押注"叮叮"币声 / 跑灯"哒哒"声（节奏随转速变化）
 * - 起跑呼啸、停定闷响、小奖号角、大奖循环号角（配爆闪）
 * - 猜大小的骰盅鼓点与翻倍/爆灭音
 * - 低音量 8bit 风格循环 BGM
 *
 * 浏览器自动播放策略：必须在用户手势后调用 ensure() 初始化。
 */

type ToneOptions = {
  type?: OscillatorType;
  f0: number;
  f1?: number;
  t?: number;
  dur?: number;
  vol?: number;
  attack?: number;
};

type NoiseOptions = {
  t?: number;
  dur?: number;
  vol?: number;
  type?: BiquadFilterType;
  f0: number;
  f1?: number;
  q?: number;
};

const midiToFreq = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

class ArcadeSfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private muted = false;
  private fanfareTimer: ReturnType<typeof setInterval> | null = null;
  private drumTimer: ReturnType<typeof setInterval> | null = null;
  private bgm = {
    on: false,
    timer: null as ReturnType<typeof setInterval> | null,
    step: 0,
    nextTime: 0,
  };

  /** 首次用户手势时调用：创建/恢复 AudioContext */
  ensure() {
    if (typeof window === 'undefined') return;
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ||
        (window as Window & { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.9;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : 0.9;
    if (muted) {
      this.stopFanfare();
      this.stopDrum();
      this.stopBgm();
    }
  }

  isMuted() {
    return this.muted;
  }

  private tone({
    type = 'sine',
    f0,
    f1,
    t = 0,
    dur = 0.15,
    vol = 0.2,
    attack = 0.004,
  }: ToneOptions) {
    if (!this.ctx || !this.master || this.muted) return;
    const now = this.ctx.currentTime + t;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, now);
    if (f1 !== undefined)
      osc.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), now + dur);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(vol, now + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.connect(gain).connect(this.master);
    osc.start(now);
    osc.stop(now + dur + 0.05);
  }

  private noise({
    t = 0,
    dur = 0.05,
    vol = 0.2,
    type = 'bandpass',
    f0,
    f1,
    q = 1,
  }: NoiseOptions) {
    if (!this.ctx || !this.master || !this.noiseBuf || this.muted) return;
    const now = this.ctx.currentTime + t;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.Q.value = q;
    filter.frequency.setValueAtTime(f0, now);
    if (f1 !== undefined)
      filter.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), now + dur);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(vol, now + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    src.connect(filter).connect(gain).connect(this.master);
    src.start(now);
    src.stop(now + dur + 0.05);
  }

  /** 押注币声：清脆"叮叮" */
  coin() {
    this.tone({ type: 'sine', f0: 2093, dur: 0.07, vol: 0.22 });
    this.tone({ type: 'sine', f0: 2637, t: 0.05, dur: 0.1, vol: 0.16 });
  }

  /** 上分：连串投币声 */
  topup() {
    for (let i = 0; i < 6; i++) {
      this.tone({
        type: 'sine',
        f0: 1900 + Math.random() * 500,
        t: i * 0.07,
        dur: 0.06,
        vol: 0.15,
      });
      this.noise({ t: i * 0.07, dur: 0.03, vol: 0.08, f0: 5000 });
    }
  }

  /** 按键咔哒 */
  click() {
    this.noise({ dur: 0.02, vol: 0.14, type: 'highpass', f0: 3500 });
  }

  /** 错误蜂鸣（不能押注/不能开始） */
  error() {
    this.tone({ type: 'square', f0: 130, f1: 95, dur: 0.16, vol: 0.15 });
    this.tone({
      type: 'square',
      f0: 130,
      f1: 95,
      t: 0.19,
      dur: 0.16,
      vol: 0.15,
    });
  }

  /** 跑灯"哒"声（转速越快越密集） */
  tick() {
    this.noise({ dur: 0.014, vol: 0.16, type: 'highpass', f0: 4200 });
    this.tone({ type: 'square', f0: 2100, f1: 1700, dur: 0.016, vol: 0.07 });
  }

  /** 起跑上扬呼啸 */
  spinStart() {
    this.noise({
      dur: 0.45,
      vol: 0.12,
      type: 'bandpass',
      f0: 400,
      f1: 3200,
      q: 2,
    });
    this.tone({ type: 'sawtooth', f0: 180, f1: 640, dur: 0.4, vol: 0.09 });
  }

  /** 停定闷响 */
  land() {
    this.tone({ type: 'sine', f0: 300, f1: 130, dur: 0.22, vol: 0.3 });
    this.noise({ dur: 0.06, vol: 0.12, f0: 800, q: 0.8 });
  }

  /** 小奖三连升号 */
  winSmall() {
    [72, 76, 79].forEach((n, i) =>
      this.tone({
        type: 'square',
        f0: midiToFreq(n),
        t: i * 0.09,
        dur: 0.12,
        vol: 0.14,
      }),
    );
    this.tone({
      type: 'triangle',
      f0: midiToFreq(84),
      t: 0.27,
      dur: 0.3,
      vol: 0.16,
    });
  }

  /** 大奖循环号角（配全场爆闪，stopFanfare 停止） */
  startFanfare() {
    this.stopFanfare();
    const phrase = () => {
      const seq: Array<[number, number]> = [
        [79, 0.11],
        [79, 0.11],
        [79, 0.11],
        [76, 0.16],
        [79, 0.16],
        [84, 0.42],
      ];
      let t = 0;
      for (const [n, d] of seq) {
        this.tone({
          type: 'square',
          f0: midiToFreq(n),
          t,
          dur: d * 0.92,
          vol: 0.1,
        });
        this.tone({
          type: 'triangle',
          f0: midiToFreq(n + 12),
          t,
          dur: d * 0.92,
          vol: 0.05,
        });
        t += d;
      }
    };
    phrase();
    this.fanfareTimer = setInterval(phrase, 1400);
  }

  stopFanfare() {
    if (this.fanfareTimer) {
      clearInterval(this.fanfareTimer);
      this.fanfareTimer = null;
    }
  }

  /** 未中：下行叹号 */
  lose() {
    this.tone({ type: 'sawtooth', f0: 220, f1: 110, dur: 0.4, vol: 0.12 });
    this.tone({
      type: 'sawtooth',
      f0: 165,
      f1: 82,
      t: 0.12,
      dur: 0.4,
      vol: 0.1,
    });
  }

  /** 骰盅鼓点（循环，stopDrum 停止） */
  startDrum() {
    this.stopDrum();
    const beat = () =>
      this.noise({
        dur: 0.045,
        vol: 0.13,
        type: 'bandpass',
        f0: 380 + Math.random() * 160,
        q: 1.4,
      });
    beat();
    this.drumTimer = setInterval(beat, 58);
  }

  stopDrum() {
    if (this.drumTimer) {
      clearInterval(this.drumTimer);
      this.drumTimer = null;
    }
  }

  /** 猜中翻倍 */
  diceWin() {
    [72, 76, 79, 84].forEach((n, i) =>
      this.tone({
        type: 'square',
        f0: midiToFreq(n),
        t: i * 0.08,
        dur: 0.14,
        vol: 0.15,
      }),
    );
  }

  /** 猜错爆灭 */
  diceLose() {
    this.tone({ type: 'square', f0: 200, f1: 70, dur: 0.5, vol: 0.16 });
    this.noise({ dur: 0.3, vol: 0.1, type: 'lowpass', f0: 900, f1: 120 });
  }

  /** 低音量 8bit 循环 BGM */
  startBgm() {
    if (!this.ctx || this.bgm.on || this.muted) return;
    this.bgm.on = true;
    this.bgm.step = 0;
    this.bgm.nextTime = this.ctx.currentTime + 0.1;
    const bass = [
      36, 0, 43, 0, 36, 0, 43, 45, 33, 0, 40, 0, 33, 0, 40, 43, 38, 0, 45, 0,
      38, 0, 45, 47, 43, 0, 50, 0, 43, 47, 50, 55,
    ];
    const lead = [
      72, 0, 76, 0, 79, 0, 76, 0, 72, 0, 76, 0, 79, 0, 84, 0, 74, 0, 77, 0, 81,
      0, 77, 0, 74, 76, 77, 79, 81, 0, 79, 0,
    ];
    const stepDur = 60 / 116 / 2;
    const scheduler = () => {
      if (!this.bgm.on || !this.ctx) return;
      while (this.bgm.nextTime < this.ctx.currentTime + 0.15) {
        const s = this.bgm.step % 32;
        const t = this.bgm.nextTime - this.ctx.currentTime;
        if (bass[s])
          this.tone({
            type: 'square',
            f0: midiToFreq(bass[s]),
            t,
            dur: stepDur * 0.9,
            vol: 0.028,
          });
        if (lead[s])
          this.tone({
            type: 'triangle',
            f0: midiToFreq(lead[s]),
            t,
            dur: stepDur * 0.85,
            vol: 0.032,
          });
        this.bgm.nextTime += stepDur;
        this.bgm.step++;
      }
    };
    scheduler();
    this.bgm.timer = setInterval(scheduler, 60);
  }

  stopBgm() {
    this.bgm.on = false;
    if (this.bgm.timer) {
      clearInterval(this.bgm.timer);
      this.bgm.timer = null;
    }
  }
}

/** 全局单例 */
export const arcadeSfx = new ArcadeSfx();
