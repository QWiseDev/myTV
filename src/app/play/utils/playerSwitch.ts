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
  /** 选集面板中该集的名称（episodes_titles），有额外信息时拼进播放器标题 */
  episodeTitle?: string;
  isEpisodeChange: boolean;
  resumeTime?: number | null;
}

export interface PlayerMediaSwitchResult {
  displayTitle: string;
  poster: string;
  resetCurrentTime: boolean;
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
  duration: number | null | undefined,
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

/**
 * 播放器左上角标题：`影片名 - 第X集 选集名称`，选集名称原样取自选集面板
 * （episodes_titles），无集名时只显示到集数。
 */
export function buildDisplayTitle(
  title: string,
  episodeIndex: number,
  episodeTitle?: string,
): string {
  const base = `${title} - 第${episodeIndex + 1}集`;
  const name = episodeTitle?.trim();
  return name ? `${base} ${name}` : base;
}

export async function switchPlayerMedia(
  player: SwitchablePlayer,
  options: PlayerMediaSwitchOptions,
): Promise<PlayerMediaSwitchResult> {
  const fallbackResumeTime = player.currentTime || 0;
  const requestedResumeTime =
    typeof options.resumeTime === 'number'
      ? options.resumeTime
      : fallbackResumeTime;

  await player.switchUrl(options.videoUrl);

  const result: PlayerMediaSwitchResult = {
    displayTitle: buildDisplayTitle(
      options.title,
      options.episodeIndex,
      options.episodeTitle,
    ),
    poster: options.poster,
    resetCurrentTime: false,
  };

  if (options.isEpisodeChange) {
    if (!requestedResumeTime || requestedResumeTime <= 0) {
      result.resetCurrentTime = true;
    }
    return result;
  }

  const restoredTime = clampRestoreTime(requestedResumeTime, player.duration);
  if (restoredTime <= 0) {
    return result;
  }

  result.restoredTime = restoredTime;

  return result;
}

export function applyPlayerMediaSwitch(
  player: SwitchablePlayer,
  result: PlayerMediaSwitchResult,
): void {
  player.title = result.displayTitle;
  player.poster = result.poster;

  if (result.resetCurrentTime) {
    player.currentTime = 0;
    return;
  }

  if (!result.restoredTime || result.restoredTime <= 0) {
    return;
  }

  if (player.video) {
    player.video.currentTime = result.restoredTime;
  }
  player.currentTime = result.restoredTime;
}
