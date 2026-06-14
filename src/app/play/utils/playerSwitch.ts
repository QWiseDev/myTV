export interface SwitchablePlayer {
  currentTime: number;
  duration?: number;
  poster: string;
  title: string;
  video?: HTMLVideoElement;
  switchUrl: (url: string) => Promise<void>;
}

export interface PlayerMediaSwitchOptions {
  videoUrl: string;
  title: string;
  poster: string;
  episodeIndex: number;
  isEpisodeChange: boolean;
  resumeTime?: number | null;
}

export interface PlayerMediaSwitchResult {
  restoredTime?: number;
}

export interface PlayerMediaSwitchStrategy {
  isEpisodeChange: boolean;
  isSourceChange: boolean;
}

export function shouldRebuildPlayerForMediaSwitch({
  isSourceChange,
}: PlayerMediaSwitchStrategy): boolean {
  return isSourceChange;
}

export function clampRestoreTime(
  time: number | null | undefined,
  duration: number | null | undefined
): number {
  if (typeof time !== 'number' || !Number.isFinite(time) || time <= 0) {
    return 0;
  }

  if (
    typeof duration === 'number' &&
    Number.isFinite(duration) &&
    duration > 0
  ) {
    return time >= duration - 2 ? Math.max(0, duration - 5) : time;
  }

  return time;
}

export async function switchPlayerMedia(
  player: SwitchablePlayer,
  options: PlayerMediaSwitchOptions
): Promise<PlayerMediaSwitchResult> {
  const fallbackResumeTime = player.currentTime || 0;
  const requestedResumeTime =
    typeof options.resumeTime === 'number'
      ? options.resumeTime
      : fallbackResumeTime;

  await player.switchUrl(options.videoUrl);

  player.title = `${options.title} - 第${options.episodeIndex + 1}集`;
  player.poster = options.poster;

  if (options.isEpisodeChange) {
    if (!requestedResumeTime || requestedResumeTime <= 0) {
      player.currentTime = 0;
    }
    return {};
  }

  const restoredTime = clampRestoreTime(requestedResumeTime, player.duration);
  if (restoredTime <= 0) {
    return {};
  }

  if (player.video) {
    player.video.currentTime = restoredTime;
  }
  player.currentTime = restoredTime;

  return { restoredTime };
}
