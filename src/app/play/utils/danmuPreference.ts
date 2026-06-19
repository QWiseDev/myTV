/**
 * 外部弹幕开关偏好的统一读写（localStorage）
 *
 * 抽离自原本散落在 play/page.tsx、artplayerConfig.ts、useDanmuController.ts 三处的重复逻辑，
 * 统一存储键与读写语义，避免回退行为分叉。
 */

const EXTERNAL_DANMU_STORAGE_KEY = 'enable_external_danmu';

/**
 * 读取外部弹幕开关偏好。
 * @returns 用户已设置时返回 true/false；从未设置（或读取失败/SSR）时返回 null，由调用方决定默认值。
 */
export function readExternalDanmuPref(): boolean | null {
  try {
    const stored = localStorage.getItem(EXTERNAL_DANMU_STORAGE_KEY);
    return stored === null ? null : stored === 'true';
  } catch {
    return null;
  }
}

/** 持久化外部弹幕开关偏好。 */
export function writeExternalDanmuPref(enabled: boolean): void {
  try {
    localStorage.setItem(EXTERNAL_DANMU_STORAGE_KEY, String(enabled));
  } catch (e) {
    console.warn('localStorage设置失败:', e);
  }
}
