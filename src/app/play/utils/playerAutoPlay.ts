import type { MutableRefObject } from 'react';

import type { PlayArtplayer } from './playerTypes';

/** NotAllowedError（自动播放被拦截）时的重试退避 */
const AUTOPLAY_NOT_ALLOWED_RETRY_DELAY_MS = 200;
/** AbortError（上一次播放请求被打断）时的重试退避 */
const AUTOPLAY_ABORT_RETRY_DELAY_MS = 500;
/** 自动播放整体延后启动，避开 iOS 首帧限制 */
const AUTOPLAY_START_DELAY_MS = 200;
/** 首次播放成功后解除静音的延迟 */
const FIRST_PLAY_UNMUTE_DELAY_MS = 500;
/** 用户交互兜底播放成功后恢复音量的延迟 */
const INTERACTION_UNMUTE_DELAY_MS = 1000;
const DEFAULT_VOLUME = 0.7;

interface PlayerAutoPlayDeps {
  isActivePlayer: () => boolean;
  lastVolumeRef: MutableRefObject<number>;
}

/**
 * iOS/Safari 静音起播后恢复音量：自动播放策略要求静音起播，
 * 首次 video:play 后解除静音并恢复上次音量。
 */
export function restoreMutedVolumeOnFirstPlay(
  artPlayer: PlayArtplayer,
  deps: PlayerAutoPlayDeps,
): void {
  if (!artPlayer.muted) return;

  const { isActivePlayer, lastVolumeRef } = deps;

  const handleFirstPlay = () => {
    if (!isActivePlayer()) return;
    setTimeout(() => {
      if (isActivePlayer() && artPlayer.muted) {
        artPlayer.muted = false;
        artPlayer.volume = lastVolumeRef.current || DEFAULT_VOLUME;
      }
    }, FIRST_PLAY_UNMUTE_DELAY_MS);

    artPlayer.off('video:play', handleFirstPlay);
  };

  artPlayer.on('video:play', handleFirstPlay);
}

/**
 * 自动播放兜底：iOS/Safari 下 play() 被拦截时按退避间隔重试（最多 3 次），
 * 仍失败则提示用户，并监听首次用户交互（video:play / 全局 click）后再播放。
 */
export function scheduleAutoPlayWithFallback(
  artPlayer: PlayArtplayer,
  deps: PlayerAutoPlayDeps,
): void {
  const { isActivePlayer, lastVolumeRef } = deps;

  const tryAutoPlay = async () => {
    if (!isActivePlayer()) return;
    try {
      let playAttempts = 0;
      const maxAttempts = 3;

      const attemptPlay = async (): Promise<boolean> => {
        if (!isActivePlayer()) return false;
        playAttempts++;

        try {
          await artPlayer.play();
          return true;
        } catch (playError: unknown) {
          const playErrorName =
            playError instanceof Error ? playError.name : '';

          if (playErrorName === 'NotAllowedError') {
            if (playAttempts < maxAttempts) {
              artPlayer.volume = 0.1;
              await new Promise((resolve) =>
                setTimeout(resolve, AUTOPLAY_NOT_ALLOWED_RETRY_DELAY_MS),
              );
              return attemptPlay();
            }
            return false;
          } else if (playErrorName === 'AbortError') {
            if (playAttempts < maxAttempts) {
              await new Promise((resolve) =>
                setTimeout(resolve, AUTOPLAY_ABORT_RETRY_DELAY_MS),
              );
              return attemptPlay();
            }
            return false;
          }
          return false;
        }
      };

      const success = await attemptPlay();
      if (!isActivePlayer()) return;

      if (!success && isActivePlayer()) {
        artPlayer.notice.show = '轻触播放按钮开始观看';

        let hasHandledFirstInteraction = false;
        const handleFirstUserInteraction = async () => {
          if (!isActivePlayer()) {
            artPlayer.off('video:play', handleFirstUserInteraction);
            document.removeEventListener('click', handleFirstUserInteraction);
            return;
          }
          if (hasHandledFirstInteraction) return;
          hasHandledFirstInteraction = true;

          try {
            await artPlayer.play();
            setTimeout(() => {
              if (isActivePlayer() && !artPlayer.muted) {
                artPlayer.volume = lastVolumeRef.current || DEFAULT_VOLUME;
              }
            }, INTERACTION_UNMUTE_DELAY_MS);
          } catch (error) {
            console.warn('用户交互播放失败:', error);
          }

          artPlayer.off('video:play', handleFirstUserInteraction);
          document.removeEventListener('click', handleFirstUserInteraction);
        };

        artPlayer.on('video:play', handleFirstUserInteraction);
        document.addEventListener('click', handleFirstUserInteraction);
      }
    } catch (error) {
      console.warn('自动播放回退机制执行失败:', error);
    }
  };

  setTimeout(tryAutoPlay, AUTOPLAY_START_DELAY_MS);
}
