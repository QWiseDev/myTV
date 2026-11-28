/**
 * 播放丢帧监测（区分网络卡顿与设备解码/渲染瓶颈）
 *
 * 通过 HTMLVideoElement.getVideoPlaybackQuality()（含 WebKit 旧接口兜底）定期统计
 * 正常播放期间的丢帧率。当缓冲充足却持续高丢帧时，说明瓶颈在本地解码或渲染
 * （例如 WebGPU 超分、密集弹幕、高倍速或高码率软解），而非网络源慢；
 * 此时给出针对性的降负载建议，避免用户误判为网络问题去反复换源。
 */

import { getForwardBufferedSeconds } from './dynamicBuffer';

export type DecodeLagCause =
  | 'super_resolution'
  | 'danmaku'
  | 'high_playback_rate'
  | 'decoder';

export interface PlaybackQualityArtLike {
  video?: HTMLVideoElement | null;
  $video?: HTMLVideoElement | null;
  notice?: { show: string };
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  off?: (event: string, listener: (...args: unknown[]) => void) => void;
}

export interface InstallPlaybackQualityMonitorOptions {
  isSuperResolutionEnabled?: () => boolean;
  isDanmakuActive?: () => boolean;
  onDecodeLag?: (info: {
    dropRate: number;
    cause: DecodeLagCause;
    message: string;
  }) => void;
  sampleIntervalMs?: number;
  now?: () => number;
}

export interface PlaybackQualitySnapshot {
  supported: boolean;
  totalFrames: number;
  droppedFrames: number;
  recentDropRate: number | null;
  consecutiveHighDropSamples: number;
  decodeLagDetected: boolean;
  lastCause: DecodeLagCause | null;
}

export interface PlaybackQualityMonitor {
  reset: () => void;
  getSnapshot: () => PlaybackQualitySnapshot;
  dispose: () => void;
}

interface RawFrameCounts {
  total: number;
  dropped: number;
}

const DEFAULT_SAMPLE_INTERVAL_MS = 2_000;
/** 单个采样窗口至少需有这么多渲染帧，避免低帧率/停顿阶段误报 */
const MIN_WINDOW_FRAMES = 20;
/** 单窗口丢帧率 ≥15% 且丢帧数 ≥6 记为高丢帧 */
const HIGH_DROP_RATE_THRESHOLD = 0.15;
const MIN_WINDOW_DROPPED_FRAMES = 6;
/** 连续 3 个采样窗口（约 6 秒）持续高丢帧才确认解码/渲染瓶颈 */
const REQUIRED_CONSECUTIVE_SAMPLES = 3;
/** 缓冲至少剩 1 秒才视为非网络饥饿 */
const MIN_HEALTHY_BUFFER_SEC = 1;
/** 同一播放会话内提示冷却（毫秒） */
const NOTICE_COOLDOWN_MS = 5 * 60 * 1000;

function resolveVideo(
  art: PlaybackQualityArtLike,
): HTMLVideoElement | null | undefined {
  return art.video || art.$video;
}

export function readVideoFrameCounts(
  video: HTMLVideoElement | null | undefined,
): RawFrameCounts | null {
  if (!video) return null;
  if (typeof video.getVideoPlaybackQuality === 'function') {
    try {
      const quality = video.getVideoPlaybackQuality();
      if (
        quality &&
        typeof quality.totalVideoFrames === 'number' &&
        typeof quality.droppedVideoFrames === 'number' &&
        Number.isFinite(quality.totalVideoFrames) &&
        Number.isFinite(quality.droppedVideoFrames)
      ) {
        return {
          total: quality.totalVideoFrames,
          dropped: quality.droppedVideoFrames,
        };
      }
    } catch {
      /* ignore unsupported runtime errors */
    }
  }

  const webkitVideo = video as HTMLVideoElement & {
    webkitDecodedFrameCount?: number;
    webkitDroppedFrameCount?: number;
  };
  if (
    typeof webkitVideo.webkitDecodedFrameCount === 'number' &&
    typeof webkitVideo.webkitDroppedFrameCount === 'number' &&
    Number.isFinite(webkitVideo.webkitDecodedFrameCount) &&
    Number.isFinite(webkitVideo.webkitDroppedFrameCount)
  ) {
    return {
      total: webkitVideo.webkitDecodedFrameCount,
      dropped: webkitVideo.webkitDroppedFrameCount,
    };
  }

  return null;
}

export function buildDecodeLagDiagnosis(options: {
  dropRate: number;
  superResolutionEnabled: boolean;
  danmakuActive: boolean;
  playbackRate: number;
}): { cause: DecodeLagCause; message: string } {
  const pct = Math.min(99, Math.max(1, Math.round(options.dropRate * 100)));

  if (options.superResolutionEnabled) {
    return {
      cause: 'super_resolution',
      message: `画面持续掉帧（约 ${pct}%），属渲染压力而非网络卡顿，建议在设置中关闭「视频超分」`,
    };
  }
  if (options.danmakuActive) {
    return {
      cause: 'danmaku',
      message: `画面持续掉帧（约 ${pct}%），属设备渲染压力而非网络卡顿，可尝试隐藏或减少弹幕`,
    };
  }
  if (options.playbackRate > 1.25) {
    return {
      cause: 'high_playback_rate',
      message: `高倍速下画面持续掉帧（约 ${pct}%），属设备解码压力，建议降低倍速或切换较低画质`,
    };
  }
  return {
    cause: 'decoder',
    message: `画面持续掉帧（约 ${pct}%），属设备解码压力而非网络卡顿，建议开启硬件加速或切换较低画质`,
  };
}

export function installPlaybackQualityMonitor(
  art: PlaybackQualityArtLike,
  options: InstallPlaybackQualityMonitorOptions = {},
): PlaybackQualityMonitor {
  const sampleIntervalMs =
    options.sampleIntervalMs ?? DEFAULT_SAMPLE_INTERVAL_MS;
  const now = options.now ?? (() => Date.now());

  let disposed = false;
  let timer: ReturnType<typeof setInterval> | null = null;
  let lastSample: RawFrameCounts | null = null;
  let totalFrames = 0;
  let droppedFrames = 0;
  let recentDropRate: number | null = null;
  let consecutiveHighDropSamples = 0;
  let decodeLagDetected = false;
  let lastCause: DecodeLagCause | null = null;
  let lastNoticeAt = 0;

  const video = resolveVideo(art);
  const supported = readVideoFrameCounts(video) !== null;

  const stopTimer = () => {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  };

  const resetBaseline = () => {
    lastSample = null;
    consecutiveHighDropSamples = 0;
  };

  const reset = () => {
    resetBaseline();
    totalFrames = 0;
    droppedFrames = 0;
    recentDropRate = null;
    decodeLagDetected = false;
    lastCause = null;
    lastNoticeAt = 0;
  };

  const sample = () => {
    if (disposed) return;
    const targetVideo = resolveVideo(art);
    if (
      !targetVideo ||
      targetVideo.paused ||
      targetVideo.ended ||
      targetVideo.seeking ||
      targetVideo.readyState < 3 ||
      (typeof document !== 'undefined' && document.hidden)
    ) {
      resetBaseline();
      return;
    }

    // 缓冲不足时处于网络抖动阶段，不误判为解码瓶颈
    if (getForwardBufferedSeconds(targetVideo) < MIN_HEALTHY_BUFFER_SEC) {
      resetBaseline();
      return;
    }

    const counts = readVideoFrameCounts(targetVideo);
    if (!counts) return;
    totalFrames = counts.total;
    droppedFrames = counts.dropped;

    if (!lastSample) {
      lastSample = counts;
      return;
    }

    const deltaTotal = counts.total - lastSample.total;
    const deltaDropped = counts.dropped - lastSample.dropped;
    lastSample = counts;

    if (deltaTotal < 0 || deltaDropped < 0) {
      consecutiveHighDropSamples = 0;
      return;
    }
    if (deltaTotal < MIN_WINDOW_FRAMES) {
      return;
    }

    const dropRate = deltaDropped / deltaTotal;
    recentDropRate = dropRate;

    if (
      dropRate >= HIGH_DROP_RATE_THRESHOLD &&
      deltaDropped >= MIN_WINDOW_DROPPED_FRAMES
    ) {
      consecutiveHighDropSamples += 1;
      if (consecutiveHighDropSamples >= REQUIRED_CONSECUTIVE_SAMPLES) {
        decodeLagDetected = true;
        const currentNow = now();
        if (
          lastNoticeAt === 0 ||
          currentNow - lastNoticeAt >= NOTICE_COOLDOWN_MS
        ) {
          const diagnosis = buildDecodeLagDiagnosis({
            dropRate,
            superResolutionEnabled:
              options.isSuperResolutionEnabled?.() === true,
            danmakuActive: options.isDanmakuActive?.() === true,
            playbackRate: Number.isFinite(targetVideo.playbackRate)
              ? targetVideo.playbackRate
              : 1,
          });
          lastCause = diagnosis.cause;
          lastNoticeAt = currentNow;
          if (art.notice) {
            art.notice.show = diagnosis.message;
          }
          options.onDecodeLag?.({
            dropRate,
            cause: diagnosis.cause,
            message: diagnosis.message,
          });
        }
      }
    } else {
      consecutiveHighDropSamples = 0;
    }
  };

  const syncTimer = () => {
    if (disposed) {
      stopTimer();
      return;
    }
    const targetVideo = resolveVideo(art);
    const shouldRun = Boolean(
      targetVideo &&
      !targetVideo.paused &&
      !targetVideo.ended &&
      !(typeof document !== 'undefined' && document.hidden) &&
      readVideoFrameCounts(targetVideo) !== null,
    );
    if (shouldRun && !timer) {
      lastSample = readVideoFrameCounts(targetVideo);
      timer = setInterval(sample, sampleIntervalMs);
    } else if (!shouldRun && timer) {
      stopTimer();
      resetBaseline();
    }
  };

  const onPlaying = () => {
    resetBaseline();
    syncTimer();
  };
  const onPause = () => {
    stopTimer();
    resetBaseline();
  };
  const onSeeking = () => {
    resetBaseline();
  };
  const onWaiting = () => {
    resetBaseline();
  };
  const onMediaReset = () => {
    reset();
    syncTimer();
  };
  const onVisibilityChange = () => {
    resetBaseline();
    syncTimer();
  };

  video?.addEventListener('playing', onPlaying);
  video?.addEventListener('pause', onPause);
  video?.addEventListener('ended', onPause);
  video?.addEventListener('seeking', onSeeking);
  video?.addEventListener('waiting', onWaiting);
  video?.addEventListener('loadstart', onMediaReset);
  video?.addEventListener('emptied', onMediaReset);
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibilityChange);
  }

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    stopTimer();
    video?.removeEventListener('playing', onPlaying);
    video?.removeEventListener('pause', onPause);
    video?.removeEventListener('ended', onPause);
    video?.removeEventListener('seeking', onSeeking);
    video?.removeEventListener('waiting', onWaiting);
    video?.removeEventListener('loadstart', onMediaReset);
    video?.removeEventListener('emptied', onMediaReset);
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', onVisibilityChange);
    }
    art.off?.('restart', onMediaReset);
    art.off?.('destroy', dispose);
  };

  art.on?.('restart', onMediaReset);
  art.on?.('destroy', dispose);

  syncTimer();

  return {
    reset,
    getSnapshot: (): PlaybackQualitySnapshot => ({
      supported: supported || readVideoFrameCounts(resolveVideo(art)) !== null,
      totalFrames,
      droppedFrames,
      recentDropRate,
      consecutiveHighDropSamples,
      decodeLagDetected,
      lastCause,
    }),
    dispose,
  };
}
