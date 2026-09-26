/**
 * 跳过片头片尾的时间格式转换（分:秒字符串 ⇄ 秒）。
 */
export function timeToSeconds(timeStr: string): number {
  if (!timeStr || timeStr.trim() === '') return 0;

  // 支持多种格式: "2:10", "2:10.5", "130", "130.5"
  if (timeStr.includes(':')) {
    const parts = timeStr.split(':');
    const minutes = parseInt(parts[0]) || 0;
    const seconds = parseFloat(parts[1]) || 0;
    return minutes * 60 + seconds;
  } else {
    return parseFloat(timeStr) || 0;
  }
}

export function secondsToTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const decimal = seconds % 1;
  if (decimal > 0) {
    return `${mins}:${secs.toString().padStart(2, '0')}.${Math.floor(
      decimal * 10
    )}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
