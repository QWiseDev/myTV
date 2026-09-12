import { waitFor } from '@testing-library/react';
import type Artplayer from 'artplayer';
import type { Setting } from 'artplayer';

import { createAnime4KRenderer } from '@/lib/anime4k-renderer';

import {
  installSuperResolution,
  readSuperResolutionPreference,
} from './superResolution';

jest.mock('@/lib/anime4k-renderer', () => ({
  createAnime4KRenderer: jest.fn(),
}));
const createRenderer = createAnime4KRenderer as jest.Mock;

function fixture() {
  const container = document.createElement('div');
  const video = document.createElement('video');
  container.append(video);
  document.body.append(container);
  Object.defineProperties(video, {
    readyState: { value: 2 },
    videoWidth: { value: 640 },
    videoHeight: { value: 360 },
  });
  const settings: Record<string, Setting> = {};
  const handlers: Record<string, () => void> = {};
  const art = {
    video,
    notice: { show: '' },
    setting: {
      add: (setting: Setting) => {
        settings[setting.name || ''] = setting;
      },
      update: jest.fn(),
    },
    on: (name: string, handler: () => void) => {
      handlers[name] = handler;
    },
    off: jest.fn(),
  } as unknown as Artplayer;
  const cleanup = installSuperResolution(art);
  const choose = (value: number) =>
    settings['super-resolution'].onSelect?.call(art, { value }, container);
  return { art, choose, handlers, container, video, cleanup };
}

beforeEach(() => {
  localStorage.clear();
  createRenderer.mockReset().mockResolvedValue({ stop: jest.fn() });
  Object.defineProperty(window, 'isSecureContext', {
    value: true,
    configurable: true,
  });
  Object.defineProperty(navigator, 'gpu', { value: {}, configurable: true });
});
afterEach(() => {
  document.body.innerHTML = '';
});

it('默认不开启，开关、换源及销毁取消渲染且移除画布', async () => {
  const f = fixture();
  expect(createRenderer).not.toHaveBeenCalled();
  f.choose(2);
  await Promise.resolve();
  await Promise.resolve();
  expect(createRenderer).toHaveBeenCalledTimes(1);
  const signal = createRenderer.mock.calls[0][0].signal as AbortSignal;
  f.video.dispatchEvent(new Event('loadstart'));
  expect(signal.aborted).toBe(true);
  expect(f.container.querySelector('canvas')).toBeNull();
  f.video.dispatchEvent(new Event('loadeddata'));
  await Promise.resolve();
  await Promise.resolve();
  expect(createRenderer).toHaveBeenCalledTimes(2);
  f.choose(0);
  expect(f.container.querySelector('canvas')).toBeNull();
  f.cleanup();
});

it('初始化失败自动回退，不遮挡原视频', async () => {
  createRenderer.mockRejectedValue(new Error('GPU unavailable'));
  const f = fixture();
  f.choose(2);
  await waitFor(() => expect(f.container.querySelector('canvas')).toBeNull());
  expect(f.art.notice.show).toContain('已恢复原画');
  f.cleanup();
});

it('不支持 WebGPU 时不加载渲染器', () => {
  Object.defineProperty(navigator, 'gpu', {
    value: undefined,
    configurable: true,
  });
  const f = fixture();
  f.choose(2);
  expect(createRenderer).not.toHaveBeenCalled();
  expect(f.art.notice.show).toContain('WebGPU');
  f.cleanup();
});

it('损坏或越界的偏好恢复默认值', () => {
  localStorage.setItem(
    'player_super_resolution_v1',
    '{"scale":100,"mode":"X"}',
  );
  expect(readSuperResolutionPreference()).toEqual({ scale: 2, mode: 'A' });
});
