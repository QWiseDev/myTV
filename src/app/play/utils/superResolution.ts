import type Artplayer from 'artplayer';

import type { SuperResolutionMode } from '@/lib/anime4k-renderer';

const SETTINGS_KEY = 'player_super_resolution_v1';
const SCALES = [1.5, 2, 3, 4];

export function readSuperResolutionPreference(): {
  scale: number;
  mode: SuperResolutionMode;
} {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    return {
      scale: SCALES.includes(saved.scale) ? saved.scale : 2,
      mode: ['A', 'B', 'C'].includes(saved.mode) ? saved.mode : 'A',
    };
  } catch {
    return { scale: 2, mode: 'A' };
  }
}

export interface InstallSuperResolutionOptions {
  /** 同会话换源重建播放器时继承上次开启状态；新进入页面默认 false */
  initialEnabled?: boolean;
  onEnabledChange?: (enabled: boolean) => void;
}

export function installSuperResolution(
  art: Artplayer,
  options: InstallSuperResolutionOptions = {},
) {
  let { scale, mode } = readSuperResolutionPreference();
  let enabled = options.initialEnabled === true;
  let disposed = false;
  let session: AbortController | null = null;
  let canvas: HTMLCanvasElement | null = null;
  const video = art.video;

  const setEnabled = (next: boolean) => {
    if (enabled !== next) {
      enabled = next;
      options.onEnabledChange?.(next);
    }
  };

  const suspend = () => {
    session?.abort();
    session = null;
    canvas?.remove();
    canvas = null;
  };
  const save = () => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ scale, mode }));
    } catch {
      /* 存储不可用不影响超分。 */
    }
  };
  const updateStatus = (text: string) => {
    if (!disposed)
      art.setting.update({ name: 'super-resolution', tooltip: text });
  };
  const start = async (): Promise<string> => {
    suspend();
    if (!enabled || disposed) return '已关闭';
    if (!window.isSecureContext || !navigator.gpu) {
      setEnabled(false);
      updateStatus('已关闭');
      art.notice.show = '超分需要 HTTPS 或 localhost，以及支持 WebGPU 的浏览器';
      return '已关闭';
    }
    if (video.readyState < 2 || !video.videoWidth) {
      updateStatus('等待视频');
      return '等待视频';
    }
    const controller = new AbortController();
    session = controller;
    const output = document.createElement('canvas');
    output.className = 'art-super-resolution';
    output.setAttribute('aria-hidden', 'true');
    Object.assign(output.style, {
      position: 'absolute',
      inset: '0',
      width: '100%',
      height: '100%',
      objectFit: 'contain',
      pointerEvents: 'none',
      zIndex: '11',
      background: 'black',
      visibility: 'hidden',
    });
    video.after(output);
    canvas = output;
    updateStatus('初始化中');
    const fail = (error: Error) => {
      if (session !== controller || disposed) return;
      setEnabled(false);
      suspend();
      updateStatus('已关闭');
      art.notice.show = `${error.message}，已恢复原画`;
    };
    void (async () => {
      try {
        const { createAnime4KRenderer } =
          await import('@/lib/anime4k-renderer');
        if (controller.signal.aborted) return;
        await createAnime4KRenderer({
          video,
          canvas: output,
          scale,
          mode,
          signal: controller.signal,
          onError: fail,
        });
        if (session === controller && !controller.signal.aborted)
          updateStatus(`${scale}x · ${mode}`);
      } catch (error) {
        if (!controller.signal.aborted)
          fail(error instanceof Error ? error : new Error('超分初始化失败'));
      }
    })();
    return '初始化中';
  };
  art.setting.add({
    name: 'super-resolution',
    html: '视频超分',
    tooltip: enabled ? '等待视频' : '已关闭',
    width: 220,
    selector: [
      { html: '关闭', value: 0, default: !enabled },
      ...SCALES.map((value) => ({
        html: `${value}x`,
        value,
        default: enabled && value === scale,
      })),
    ],
    onSelect(item) {
      const value = Number(item.value);
      const nextEnabled = value !== 0;
      if (nextEnabled) scale = value;
      setEnabled(nextEnabled);
      save();
      let immediateTooltip = nextEnabled ? '初始化中' : '已关闭';
      void start().then((statusText) => {
        immediateTooltip = statusText;
      });
      // start() 的同步前置分支（已关闭 / 不支持 WebGPU / 等待视频 / 初始化中）会立即给出真实状态，
      // 避免同步返回固定倍率文案覆盖掉“等待视频”或“初始化中”提示。
      return immediateTooltip;
    },
  });
  art.setting.add({
    name: 'super-resolution-mode',
    html: '超分模式',
    tooltip: mode,
    selector: ['A', 'B', 'C'].map((value) => ({
      html: `Mode ${value}`,
      value,
      default: value === mode,
    })),
    onSelect(item) {
      mode = item.value as SuperResolutionMode;
      save();
      void start();
      return mode;
    },
  });

  if (enabled) {
    void start();
  }

  const reload = () => {
    void start();
  };
  video.addEventListener('loadstart', suspend);
  video.addEventListener('emptied', suspend);
  video.addEventListener('loadeddata', reload);
  video.addEventListener('resize', reload);
  const cleanup = () => {
    disposed = true;
    suspend();
    video.removeEventListener('loadstart', suspend);
    video.removeEventListener('emptied', suspend);
    video.removeEventListener('loadeddata', reload);
    video.removeEventListener('resize', reload);
    art.off('destroy', cleanup);
  };
  art.on('destroy', cleanup);
  return cleanup;
}
