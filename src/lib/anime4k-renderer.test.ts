import {
  createAnime4KRenderer,
  getSuperResolutionSize,
} from './anime4k-renderer';

jest.mock('anime4k-webgpu', () => ({
  ModeA: jest.fn(),
  ModeB: jest.fn(),
  ModeC: jest.fn(),
}));

it.each([1.5, 2, 3, 4])('支持 %s 倍输出', (scale) => {
  expect(getSuperResolutionSize(640, 360, scale)).toEqual({
    width: 640 * scale,
    height: 360 * scale,
  });
});

it('在申请纹理前拒绝越界尺寸和倍率', () => {
  expect(() => getSuperResolutionSize(0, 0, 2)).toThrow();
  expect(() => getSuperResolutionSize(1920, 1080, 100)).toThrow();
  expect(() => getSuperResolutionSize(3840, 2160, 4)).toThrow();
  expect(() => getSuperResolutionSize(640, 360, 2, 1024)).toThrow();
});

it('取消期间迟到的 GPU device 也会立即销毁', async () => {
  let resolveDevice: (device: { destroy: jest.Mock }) => void = () => undefined;
  const devicePromise = new Promise((resolve) => {
    resolveDevice = resolve;
  });
  const requestDevice = jest.fn(() => devicePromise);
  Object.defineProperty(window, 'isSecureContext', {
    configurable: true,
    value: true,
  });
  Object.defineProperty(navigator, 'gpu', {
    configurable: true,
    value: {
      requestAdapter: async () => ({
        limits: { maxTextureDimension2D: 8192 },
        requestDevice,
      }),
    },
  });
  const video = document.createElement('video');
  Object.defineProperties(video, {
    videoWidth: { value: 640 },
    videoHeight: { value: 360 },
  });
  const canvas = document.createElement('canvas');
  const controller = new AbortController();
  const promise = createAnime4KRenderer({
    video,
    canvas,
    scale: 2,
    mode: 'A',
    signal: controller.signal,
    onError: jest.fn(),
  });
  await Promise.resolve();
  expect(requestDevice).toHaveBeenCalled();
  controller.abort();
  const device = { destroy: jest.fn() };
  resolveDevice(device);
  await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
  expect(device.destroy).toHaveBeenCalledTimes(1);
  expect(canvas.style.visibility).toBe('hidden');
});
