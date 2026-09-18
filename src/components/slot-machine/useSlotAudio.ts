'use client';

/**
 * 老虎机音频系统：音效播放 + 背景音乐管理
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { BG_MUSIC_TRACKS } from '@/lib/slot-machine-utils';

export type SlotSoundType =
  | 'spin'
  | 'win'
  | 'bet'
  | 'bigwin'
  | 'stop'
  | 'jackpot'
  | 'coin'
  | 'lose';

// 音效系统 - 使用真实音频文件 + Web Audio API生成合成音效
export function useSlotSound(soundEnabled: boolean) {
  // 全局AudioContext实例（避免重复创建导致内存泄漏）
  const audioContextRef = useRef<AudioContext | null>(null);

  const playSound = useCallback(
    (type: SlotSoundType) => {
      if (!soundEnabled || typeof window === 'undefined') return;

      try {
        // 播放真实音频文件 - 确保用户交互后播放
        const playAudioFile = (filename: string) => {
          const audio = new Audio(`/sounds/${filename}`);
          audio.volume = 0.3;
          // 确保音频可以播放，如果失败则使用合成音效作为后备
          audio.play().catch((e) => {
            console.log('Audio play failed, using synthesized sound:', e);
            // 使用合成音效作为后备
            if (type === 'win' || type === 'bigwin') {
              const audioContext = getAudioContext();
              if (!audioContext) return;
              const winNotes = [523, 659, 784]; // C, E, G
              winNotes.forEach((freq, i) => {
                setTimeout(() => {
                  const oscillator = audioContext.createOscillator();
                  const gainNode = audioContext.createGain();
                  oscillator.connect(gainNode);
                  gainNode.connect(audioContext.destination);
                  oscillator.frequency.value = freq;
                  gainNode.gain.value = 0.08;
                  oscillator.start();
                  gainNode.gain.exponentialRampToValueAtTime(
                    0.001,
                    audioContext.currentTime + 0.2
                  );
                  oscillator.stop(audioContext.currentTime + 0.2);
                }, i * 80);
              });
            }
          });
        };

        const getAudioContext = () => {
          if (!audioContextRef.current) {
            type AudioContextCtor = new () => AudioContext;
            const Ctor: AudioContextCtor | undefined =
              window.AudioContext ??
              (window as Window & { webkitAudioContext?: AudioContextCtor })
                .webkitAudioContext;
            if (!Ctor) {
              // 与原实现一致：抛错由外层 try/catch 兜底
              throw new TypeError('AudioContext not supported');
            }
            audioContextRef.current = new Ctor();
          }
          return audioContextRef.current;
        };

        const playTone = (
          frequency: number,
          duration: number,
          type: OscillatorType = 'sine',
          volume = 0.1
        ) => {
          const audioContext = getAudioContext();
          const oscillator = audioContext.createOscillator();
          const gainNode = audioContext.createGain();

          oscillator.connect(gainNode);
          gainNode.connect(audioContext.destination);

          oscillator.type = type;
          oscillator.frequency.value = frequency;
          gainNode.gain.value = volume;

          oscillator.start();
          gainNode.gain.exponentialRampToValueAtTime(
            0.001,
            audioContext.currentTime + duration
          );
          oscillator.stop(audioContext.currentTime + duration);
        };

        switch (type) {
          case 'spin':
            // 播放老虎机旋转音效
            playAudioFile('mixkit-slot-machine-win-1928.wav');
            break;

          case 'stop':
            // 使用合成音效：清脆的点击声
            playTone(1200, 0.05, 'square', 0.1);
            setTimeout(() => playTone(800, 0.05, 'square', 0.08), 50);
            break;

          case 'bet':
            // 使用合成音效：低沉的确认声
            playTone(150, 0.2, 'sine', 0.12);
            break;

          case 'coin':
            // 使用合成音效：清脆的金属声
            playTone(2000, 0.05, 'square', 0.06);
            setTimeout(() => playTone(2500, 0.03, 'square', 0.04), 30);
            break;

          case 'win':
            // 播放真实音频文件 + 合成和声
            playAudioFile('mixkit-coin-win-notification-1992.wav');
            // 添加装饰性合成音效
            setTimeout(() => {
              const winNotes = [523, 659, 784]; // C, E, G
              winNotes.forEach((freq, i) => {
                setTimeout(() => playTone(freq, 0.2, 'sine', 0.08), i * 80);
              });
            }, 200);
            break;

          case 'bigwin':
            // 播放金币获胜音频文件 + 更丰富的合成和声
            playAudioFile('mixkit-coin-win-notification-1992.wav');
            // 添加辉煌的合成和弦
            setTimeout(() => {
              const bigwinNotes = [523, 659, 784, 1047]; // C, E, G, High C
              bigwinNotes.forEach((freq, i) => {
                setTimeout(() => playTone(freq, 0.4, 'sine', 0.15), i * 120);
              });
              // 添加装饰音
              setTimeout(() => playTone(1319, 0.3, 'triangle', 0.1), 600);
            }, 300);
            break;

          case 'jackpot':
            // 播放大胜利音频文件 + 华丽的合成效果
            playAudioFile('mixkit-slot-machine-win-1928.wav');
            // 添加累积大奖的特殊合成音效
            setTimeout(() => {
              const jackpotMelody = [
                { freq: 523, duration: 0.3, delay: 0 },
                { freq: 659, duration: 0.3, delay: 200 },
                { freq: 784, duration: 0.3, delay: 400 },
                { freq: 1047, duration: 0.5, delay: 600 },
                { freq: 1319, duration: 0.5, delay: 1000 },
                { freq: 1568, duration: 0.7, delay: 1500 },
              ];

              jackpotMelody.forEach(({ freq, duration, delay }) => {
                setTimeout(() => {
                  playTone(freq, duration, 'sine', 0.2);
                  // 添加和声
                  if (freq > 500) {
                    setTimeout(
                      () => playTone(freq * 1.5, duration * 0.8, 'triangle', 0.08),
                      50
                    );
                  }
                }, delay);
              });

              // 添加打击乐效果
              setTimeout(() => playTone(100, 0.15, 'square', 0.15), 2200);
            }, 500);

            // 添加额外的金币音效
            for (let i = 0; i < 3; i++) {
              setTimeout(() => playSound('coin'), 1000 + i * 300);
            }
            break;

          case 'lose':
            // 使用下载的惩罚音效
            playAudioFile('ngmhhy.mp3');
            break;
        }
      } catch (error) {
        console.log(`Playing sound: ${type}`, error);
      }
    },
    [soundEnabled]
  );

  // 组件卸载时释放 AudioContext
  useEffect(() => {
    return () => {
      if (audioContextRef.current) {
        try {
          audioContextRef.current.close();
        } catch (e) {
          console.log('AudioContext cleanup error:', e);
        }
        audioContextRef.current = null;
      }
    };
  }, []);

  return playSound;
}

// 背景音乐管理：随机起播、播完自动切下一首、页面隐藏时暂停
export function useSlotBackgroundMusic(enabled: boolean) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [currentBgMusicIndex, setCurrentBgMusicIndex] = useState(0);

  useEffect(() => {
    if (enabled) {
      // 随机选择一个背景音乐
      const randomIndex = Math.floor(Math.random() * BG_MUSIC_TRACKS.length);
      setCurrentBgMusicIndex(randomIndex);

      // 创建新的音频实例
      const audio = new Audio(BG_MUSIC_TRACKS[randomIndex]);
      audio.volume = 0.3;
      audioRef.current = audio;

      // 播放结束后自动切换下一首
      const handleEnded = () => {
        const nextIndex = (randomIndex + 1) % BG_MUSIC_TRACKS.length;
        setCurrentBgMusicIndex(nextIndex);
        audio.src = BG_MUSIC_TRACKS[nextIndex];
        audio.play().catch((e) => console.log('Next track play failed:', e));
      };

      audio.addEventListener('ended', handleEnded);
      audio.play().catch((e) => {
        console.log('Background music play failed:', e);
      });

      return () => {
        audio.removeEventListener('ended', handleEnded);
        audio.pause();
        audio.src = '';
        audioRef.current = null;
      };
    }

    audioRef.current?.pause();
  }, [enabled]);

  // 页面隐藏时暂停背景音乐，恢复显示时继续播放
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        audioRef.current?.pause();
      } else if (audioRef.current && enabled) {
        audioRef.current.play().catch((e) => console.log('Resume play failed:', e));
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [enabled]);

  return { currentBgMusicIndex };
}
