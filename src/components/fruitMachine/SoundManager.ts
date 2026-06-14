/**
 * 水果机音效管理器
 * 负责播放各种游戏音效
 */

export class SoundManager {
  private audioContext: AudioContext | null = null;
  private sounds: Map<string, AudioBuffer> = new Map();
  private enabled: boolean;

  constructor(enabled = true) {
    this.enabled = enabled;
    // 延迟初始化，等待用户交互
  }

  private async initAudioContext() {
    if (typeof window !== 'undefined' && !this.audioContext) {
      try {
        // 创建音频上下文
        this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();

        // 预加载音效
        await this.loadSounds();
      } catch (error) {
        console.warn('音频初始化失败:', error);
      }
    }
  }

  private async loadSounds() {
    // 由于没有实际的音频文件，这里使用Web Audio API创建简单的音效
    // 在实际项目中，这里应该加载实际的音频文件

    this.sounds.set('bet', this.createBeepSound(300, 0.1));
    this.sounds.set('start', this.createBeepSound(500, 0.2));
    this.sounds.set('spinning', this.createBeepSound(400, 0.05));
    this.sounds.set('win', this.createMelodySound([523, 659, 784], 0.2)); // C, E, G
    this.sounds.set('bigWin', this.createMelodySound([523, 659, 784, 1047], 0.3)); // C, E, G, C
    this.sounds.set('lose', this.createBeepSound(200, 0.3));
    this.sounds.set('bigOrSmall', this.createBeepSound(600, 0.15));
    this.sounds.set('jackpot', this.createMelodySound([262, 330, 392, 523, 659, 784], 0.4)); // C-E-G-C-E-G
    this.sounds.set('click', this.createBeepSound(800, 0.05));
    this.sounds.set('collect', this.createMelodySound([392, 523, 659], 0.15)); // G-C-E
    this.sounds.set('error', this.createBeepSound(150, 0.2));
  }

  private createBeepSound(frequency: number, duration: number): AudioBuffer {
    if (!this.audioContext) return new AudioBuffer({ length: 1, sampleRate: 44100 });

    const sampleRate = this.audioContext.sampleRate;
    const numSamples = sampleRate * duration;
    const buffer = this.audioContext.createBuffer(1, numSamples, sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < numSamples; i++) {
      // 生成带有淡入淡出的正弦波
      const t = i / sampleRate;
      const envelope = Math.sin(Math.PI * t / duration); // 淡入淡出包络
      data[i] = Math.sin(2 * Math.PI * frequency * t) * envelope * 0.3; // 音量0.3
    }

    return buffer;
  }

  private createMelodySound(frequencies: number[], noteDuration: number): AudioBuffer {
    if (!this.audioContext) return new AudioBuffer({ length: 1, sampleRate: 44100 });

    const sampleRate = this.audioContext.sampleRate;
    const totalDuration = frequencies.length * noteDuration;
    const numSamples = sampleRate * totalDuration;
    const buffer = this.audioContext.createBuffer(1, numSamples, sampleRate);
    const data = buffer.getChannelData(0);

    frequencies.forEach((frequency, noteIndex) => {
      const startSample = noteIndex * sampleRate * noteDuration;
      const noteSamples = sampleRate * noteDuration;

      for (let i = 0; i < noteSamples; i++) {
        const t = i / sampleRate;
        const envelope = Math.sin(Math.PI * t / noteDuration) * 0.8; // 更强的包络
        const sampleIndex = startSample + i;

        if (sampleIndex < numSamples) {
          data[sampleIndex] = Math.sin(2 * Math.PI * frequency * t) * envelope * 0.3;
        }
      }
    });

    return buffer;
  }

  async play(soundName: string) {
    if (!this.enabled) return;

    // 如果音频上下文未初始化，先初始化
    if (!this.audioContext) {
      await this.initAudioContext();
    }

    if (!this.audioContext) return;

    const sound = this.sounds.get(soundName);
    if (!sound) {
      console.warn(`音效 "${soundName}" 不存在`);
      return;
    }

    try {
      const source = this.audioContext.createBufferSource();
      source.buffer = sound;

      // 创建音量控制
      const gainNode = this.audioContext.createGain();
      gainNode.gain.value = 0.5; // 设置音量为50%

      // 连接音频节点
      source.connect(gainNode);
      gainNode.connect(this.audioContext.destination);

      // 播放音效
      source.start(0);
    } catch (error) {
      console.warn(`播放音效 "${soundName}" 失败:`, error);
    }
  }

  // 停止所有正在播放的音效
  stopAll() {
    if (this.audioContext) {
      try {
        // 创建新的GainNode来快速停止所有声音
        const gainNode = this.audioContext.createGain();
        gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
        gainNode.connect(this.audioContext.destination);
      } catch (error) {
        console.warn('停止音效失败:', error);
      }
    }
  }

  // 设置音效开关
  setEnabled(enabled: boolean) {
    this.enabled = enabled;
  }

  // 检查音效是否启用
  isEnabled(): boolean {
    return this.enabled;
  }

  // 释放资源
  dispose() {
    this.stopAll();
    this.sounds.clear();

    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close();
    }
    this.audioContext = null;
  }
}