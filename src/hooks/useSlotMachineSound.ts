/**
 * 老虎机音效系统 Hook
 */

import { useCallback, useEffect, useRef, useState } from 'react';

type SoundType =
  | 'spin'
  | 'win'
  | 'bet'
  | 'bigwin'
  | 'stop'
  | 'jackpot'
  | 'coin'
  | 'lose';

// 背景音乐列表
const BG_MUSIC_LIST = [
  '/sounds/zhiyinnizuitaimei_bg.mp3',
  '/sounds/jntm_bg.mp3',
];

interface UseSlotMachineSoundOptions {
  initialSoundEnabled?: boolean;
  initialBgMusicEnabled?: boolean;
}

export function useSlotMachineSound(options: UseSlotMachineSoundOptions = {}) {
  const { initialSoundEnabled = true, initialBgMusicEnabled = true } = options;

  const [soundEnabled, setSoundEnabled] = useState(initialSoundEnabled);
  const [bgMusicEnabled, setBgMusicEnabled] = useState(initialBgMusicEnabled);
  const [bgMusicAudio, setBgMusicAudio] = useState<HTMLAudioElement | null>(null);
  const [currentBgMusicIndex, setCurrentBgMusicIndex] = useState(0);

  // 全局AudioContext实例（避免重复创建导致内存泄漏）
  const audioContextRef = useRef<AudioContext | null>(null);

  // 获取或创建 AudioContext
  const getAudioContext = useCallback(() => {
    if (typeof window === 'undefined') return null;
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext ||
        (window as any).webkitAudioContext)();
    }
    return audioContextRef.current;
  }, []);

  // 播放音调
  const playTone = useCallback(
    (
      frequency: number,
      duration: number,
      type: OscillatorType = 'sine',
      volume = 0.1
    ) => {
      const audioContext = getAudioContext();
      if (!audioContext) return;

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
    },
    [getAudioContext]
  );

  // 播放音频文件
  const playAudioFile = useCallback((filename: string, volume = 0.3) => {
    const audio = new Audio(`/sounds/${filename}`);
    audio.volume = volume;
    return audio.play().catch((e) => {
      console.log('Audio play failed:', e);
      return Promise.reject(e);
    });
  }, []);

  // 播放合成中奖音效
  const playSynthWinSound = useCallback(() => {
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
  }, [getAudioContext]);

  // 主音效播放函数
  const playSound = useCallback(
    (type: SoundType) => {
      if (!soundEnabled || typeof window === 'undefined') return;

      try {
        switch (type) {
          case 'spin':
            playAudioFile('mixkit-slot-machine-win-1928.wav');
            break;

          case 'stop':
            playTone(1200, 0.05, 'square', 0.1);
            setTimeout(() => playTone(800, 0.05, 'square', 0.08), 50);
            break;

          case 'bet':
            playTone(150, 0.2, 'sine', 0.12);
            break;

          case 'coin':
            playTone(2000, 0.05, 'square', 0.06);
            setTimeout(() => playTone(2500, 0.03, 'square', 0.04), 30);
            break;

          case 'win':
            playAudioFile('mixkit-coin-win-notification-1992.wav').catch(
              playSynthWinSound
            );
            setTimeout(() => {
              const winNotes = [523, 659, 784];
              winNotes.forEach((freq, i) => {
                setTimeout(() => playTone(freq, 0.2, 'sine', 0.08), i * 80);
              });
            }, 200);
            break;

          case 'bigwin':
            playAudioFile('mixkit-coin-win-notification-1992.wav').catch(
              playSynthWinSound
            );
            setTimeout(() => {
              const bigwinNotes = [523, 659, 784, 1047];
              bigwinNotes.forEach((freq, i) => {
                setTimeout(() => playTone(freq, 0.4, 'sine', 0.15), i * 120);
              });
              setTimeout(() => playTone(1319, 0.3, 'triangle', 0.1), 600);
            }, 300);
            break;

          case 'jackpot':
            playAudioFile('mixkit-slot-machine-win-1928.wav');
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
                  if (freq > 500) {
                    setTimeout(
                      () => playTone(freq * 1.5, duration * 0.8, 'triangle', 0.08),
                      50
                    );
                  }
                }, delay);
              });

              setTimeout(() => playTone(100, 0.15, 'square', 0.15), 2200);
            }, 500);

            // 添加额外的金币音效
            for (let i = 0; i < 3; i++) {
              setTimeout(
                () => {
                  playTone(2000, 0.05, 'square', 0.06);
                  setTimeout(() => playTone(2500, 0.03, 'square', 0.04), 30);
                },
                1000 + i * 300
              );
            }
            break;

          case 'lose':
            playAudioFile('ngmhhy.mp3');
            break;
        }
      } catch (error) {
        console.log(`Playing sound: ${type}`, error);
      }
    },
    [soundEnabled, playAudioFile, playTone, playSynthWinSound]
  );

  // 初始化背景音乐
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const audio = new Audio(BG_MUSIC_LIST[currentBgMusicIndex]);
    audio.loop = false;
    audio.volume = 0.15;
    setBgMusicAudio(audio);

    // 监听歌曲结束，播放下一首
    const handleEnded = () => {
      setCurrentBgMusicIndex((prev) => (prev + 1) % BG_MUSIC_LIST.length);
    };
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.pause();
      audio.removeEventListener('ended', handleEnded);
    };
  }, [currentBgMusicIndex]);

  // 控制背景音乐播放
  const toggleBgMusic = useCallback(() => {
    setBgMusicEnabled((prev) => {
      if (!prev && bgMusicAudio) {
        bgMusicAudio.play().catch(console.log);
      } else if (bgMusicAudio) {
        bgMusicAudio.pause();
      }
      return !prev;
    });
  }, [bgMusicAudio]);

  // 切换音效开关
  const toggleSound = useCallback(() => {
    setSoundEnabled((prev) => !prev);
  }, []);

  // 播放背景音乐
  const playBgMusic = useCallback(() => {
    if (bgMusicEnabled && bgMusicAudio) {
      bgMusicAudio.play().catch(console.log);
    }
  }, [bgMusicEnabled, bgMusicAudio]);

  // 暂停背景音乐
  const pauseBgMusic = useCallback(() => {
    if (bgMusicAudio) {
      bgMusicAudio.pause();
    }
  }, [bgMusicAudio]);

  return {
    soundEnabled,
    bgMusicEnabled,
    playSound,
    toggleSound,
    toggleBgMusic,
    playBgMusic,
    pauseBgMusic,
    setSoundEnabled,
    setBgMusicEnabled,
  };
}
