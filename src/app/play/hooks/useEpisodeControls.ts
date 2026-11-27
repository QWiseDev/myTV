'use client';

import { MutableRefObject, useCallback } from 'react';

import { SearchResult } from '@/lib/types';

import { useEpisodeKeyboardShortcuts } from './useEpisodeShortcuts';
import type { ArtPlayerLike } from '../utils/danmakuRuntime';

interface EpisodeControlsOptions {
  totalEpisodes: number;
  artPlayerRef: MutableRefObject<ArtPlayerLike | null>;
  saveCurrentPlayProgress: () => void | Promise<void>;
  setCurrentEpisodeIndex: (index: number) => void;
  detailRef: MutableRefObject<SearchResult | null>;
  currentEpisodeIndexRef: MutableRefObject<number>;
  isSkipControllerTriggeredRef: MutableRefObject<boolean>;
}

export function useEpisodeControls({
  totalEpisodes,
  artPlayerRef,
  saveCurrentPlayProgress,
  setCurrentEpisodeIndex,
  detailRef,
  currentEpisodeIndexRef,
  isSkipControllerTriggeredRef,
}: EpisodeControlsOptions) {
  const handleEpisodeChange = useCallback(
    (episodeNumber: number) => {
      if (episodeNumber >= 0 && episodeNumber < totalEpisodes) {
        if (artPlayerRef.current) {
          saveCurrentPlayProgress();
        }
        setCurrentEpisodeIndex(episodeNumber);
      }
    },
    [
      artPlayerRef,
      saveCurrentPlayProgress,
      setCurrentEpisodeIndex,
      totalEpisodes,
    ],
  );

  const handlePreviousEpisode = useCallback(() => {
    const detail = detailRef.current;
    const idx = currentEpisodeIndexRef.current;
    if (detail && detail.episodes && idx > 0) {
      if (artPlayerRef.current && !artPlayerRef.current.paused) {
        saveCurrentPlayProgress();
      }
      setCurrentEpisodeIndex(idx - 1);
    }
  }, [
    artPlayerRef,
    currentEpisodeIndexRef,
    detailRef,
    saveCurrentPlayProgress,
    setCurrentEpisodeIndex,
  ]);

  const handleNextEpisode = useCallback(() => {
    const detail = detailRef.current;
    const idx = currentEpisodeIndexRef.current;
    if (detail && detail.episodes && idx < detail.episodes.length - 1) {
      if (artPlayerRef.current && !artPlayerRef.current.paused) {
        saveCurrentPlayProgress();
      }
      isSkipControllerTriggeredRef.current = true;
      setCurrentEpisodeIndex(idx + 1);
    }
  }, [
    artPlayerRef,
    currentEpisodeIndexRef,
    detailRef,
    isSkipControllerTriggeredRef,
    saveCurrentPlayProgress,
    setCurrentEpisodeIndex,
  ]);

  const handleKeyboardShortcuts = useCallback(
    (e: KeyboardEvent) => {
      // 带 Ctrl/Cmd 的组合键留给浏览器（页内查找、前进后退等），不当作播放快捷键
      if (e.ctrlKey || e.metaKey) return;

      // 忽略输入类控件中的按键事件
      const target = e.target as HTMLElement | null;
      const tagName = target?.tagName;
      if (
        tagName === 'INPUT' ||
        tagName === 'TEXTAREA' ||
        tagName === 'SELECT' ||
        target?.isContentEditable
      )
        return;

      // 焦点在按钮/链接上时，空格交还给控件自身，避免同时触发点击和播放暂停
      if (e.key === ' ' && (tagName === 'BUTTON' || tagName === 'A')) return;

      // Alt + 左箭头 = 上一集
      if (e.altKey && e.key === 'ArrowLeft') {
        handlePreviousEpisode();
        e.preventDefault();
      }

      // Alt + 右箭头 = 下一集
      if (e.altKey && e.key === 'ArrowRight') {
        handleNextEpisode();
        e.preventDefault();
      }

      // 左箭头 = 快退
      if (!e.altKey && e.key === 'ArrowLeft') {
        const player = artPlayerRef.current;
        const currentTime = player?.currentTime ?? 0;
        if (player && currentTime > 0) {
          player.currentTime = Math.max(0, currentTime - 10);
          e.preventDefault();
        }
      }

      // 右箭头 = 快进
      if (!e.altKey && e.key === 'ArrowRight') {
        const player = artPlayerRef.current;
        const currentTime = player?.currentTime ?? 0;
        const duration = player?.duration ?? 0;
        if (player && duration > 0 && currentTime < duration) {
          player.currentTime = Math.min(duration, currentTime + 10);
          e.preventDefault();
        }
      }

      // 上箭头 = 音量+
      if (e.key === 'ArrowUp') {
        const player = artPlayerRef.current;
        const volume = player?.volume ?? 0;
        if (player && volume < 1) {
          player.volume = Math.min(1, Math.round((volume + 0.1) * 10) / 10);
          if (player.notice) {
            player.notice.show = `音量: ${Math.round(player.volume * 100)}`;
          }
          e.preventDefault();
        }
      }

      // 下箭头 = 音量-
      if (e.key === 'ArrowDown') {
        const player = artPlayerRef.current;
        const volume = player?.volume ?? 0;
        if (player && volume > 0) {
          player.volume = Math.max(0, Math.round((volume - 0.1) * 10) / 10);
          if (player.notice) {
            player.notice.show = `音量: ${Math.round(player.volume * 100)}`;
          }
          e.preventDefault();
        }
      }

      // 空格 = 播放/暂停
      if (e.key === ' ') {
        if (artPlayerRef.current?.toggle) {
          artPlayerRef.current.toggle();
          e.preventDefault();
        }
      }

      // f 键 = 切换全屏
      if (e.key === 'f' || e.key === 'F') {
        if (artPlayerRef.current) {
          artPlayerRef.current.fullscreen = !artPlayerRef.current.fullscreen;
          e.preventDefault();
        }
      }
    },
    [artPlayerRef, handleNextEpisode, handlePreviousEpisode],
  );

  useEpisodeKeyboardShortcuts(handleKeyboardShortcuts);

  return {
    handleEpisodeChange,
    handlePreviousEpisode,
    handleNextEpisode,
  };
}
