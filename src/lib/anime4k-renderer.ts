/// <reference types="@webgpu/types" />

import { ModeA, ModeB, ModeC } from 'anime4k-webgpu';

export type SuperResolutionMode = 'A' | 'B' | 'C';
export const SUPER_RESOLUTION_SCALES = [1.5, 2, 3, 4] as const;
const MAX_OUTPUT_PIXELS = 4096 * 4096;

// 参考 MoonTVPlus / Anime4K-WebGPU 的视频纹理管线，独立管理取消和资源释放。
const PRESENT_SHADER = `
struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}
@vertex fn vertex(@builtin(vertex_index) index: u32) -> VertexOutput {
  let positions = array(vec2f(-1, -1), vec2f(3, -1), vec2f(-1, 3));
  var output: VertexOutput;
  output.position = vec4f(positions[index], 0, 1);
  output.uv = vec2f((positions[index].x + 1) / 2, (1 - positions[index].y) / 2);
  return output;
}
@group(0) @binding(0) var imageSampler: sampler;
@group(0) @binding(1) var imageTexture: texture_2d<f32>;
@fragment fn fragment(input: VertexOutput) -> @location(0) vec4f {
  return textureSample(imageTexture, imageSampler, input.uv);
}
`;

export function getSuperResolutionSize(
  width: number,
  height: number,
  scale: number,
  maxDimension = 8192,
) {
  const outputWidth = Math.floor(width * scale);
  const outputHeight = Math.floor(height * scale);
  if (
    !(SUPER_RESOLUTION_SCALES as readonly number[]).includes(scale) ||
    !Number.isSafeInteger(outputWidth) ||
    !Number.isSafeInteger(outputHeight) ||
    outputWidth <= 0 ||
    outputHeight <= 0 ||
    outputWidth > maxDimension ||
    outputHeight > maxDimension ||
    outputWidth * outputHeight > MAX_OUTPUT_PIXELS
  ) {
    throw new Error('超分输出尺寸超出限制，请降低倍率');
  }
  return { width: outputWidth, height: outputHeight };
}

interface RendererOptions {
  video: HTMLVideoElement;
  canvas: HTMLCanvasElement;
  scale: number;
  mode: SuperResolutionMode;
  signal: AbortSignal;
  onError: (error: Error) => void;
}

export async function createAnime4KRenderer({
  video,
  canvas,
  scale,
  mode,
  signal,
  onError,
}: RendererOptions) {
  let device: GPUDevice | undefined;
  let context: GPUCanvasContext | null = null;
  let stopped = false;
  let frameId = 0;
  let bitmapFallback = false;
  let lastTime = -1;
  let firstFrame = true;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(frameId);
    signal.removeEventListener('abort', stop);
    canvas.style.visibility = 'hidden';
    context?.unconfigure();
    // 管线内部纹理没有公开销毁接口，独占 device 可一次释放整条管线。
    device?.destroy();
  };
  const check = () => {
    if (signal.aborted || stopped)
      throw new DOMException('超分已取消', 'AbortError');
  };
  const fail = (error: unknown) => {
    if (stopped) return;
    stop();
    onError(error instanceof Error ? error : new Error('超分渲染失败'));
  };
  signal.addEventListener('abort', stop, { once: true });

  try {
    check();
    if (!window.isSecureContext || !navigator.gpu)
      throw new Error('超分需要 HTTPS 或 localhost，以及支持 WebGPU 的浏览器');
    const adapter = await navigator.gpu.requestAdapter();
    check();
    if (!adapter) throw new Error('无法获取 WebGPU 适配器');
    const dimensions = getSuperResolutionSize(
      video.videoWidth,
      video.videoHeight,
      scale,
      adapter.limits.maxTextureDimension2D,
    );
    const nextDevice = await adapter.requestDevice();
    if (signal.aborted || stopped) {
      nextDevice.destroy();
      check();
    }
    device = nextDevice;
    const gpu = device;
    gpu.lost.then(() => {
      if (!stopped) fail(new Error('GPU 设备已丢失，已恢复原画'));
    });
    gpu.addEventListener('uncapturederror', () =>
      fail(new Error('GPU 渲染失败，已恢复原画')),
    );
    canvas.width = dimensions.width;
    canvas.height = dimensions.height;
    context = canvas.getContext('webgpu');
    if (!context) throw new Error('无法创建 WebGPU 画布');
    const gpuContext = context;
    const format = navigator.gpu.getPreferredCanvasFormat();
    gpuContext.configure({ device: gpu, format, alphaMode: 'opaque' });
    gpu.pushErrorScope('validation');
    const input = gpu.createTexture({
      size: [video.videoWidth, video.videoHeight],
      format: 'rgba16float',
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT,
    });
    const Pipeline = { A: ModeA, B: ModeB, C: ModeC }[mode];
    const pipeline = new Pipeline({
      device: gpu,
      inputTexture: input,
      nativeDimensions: { width: video.videoWidth, height: video.videoHeight },
      targetDimensions: dimensions,
    });
    const shader = gpu.createShaderModule({ code: PRESENT_SHADER });
    const presentation = await gpu.createRenderPipelineAsync({
      layout: 'auto',
      vertex: { module: shader, entryPoint: 'vertex' },
      fragment: {
        module: shader,
        entryPoint: 'fragment',
        targets: [{ format }],
      },
      primitive: { topology: 'triangle-list' },
    });
    check();
    const binding = gpu.createBindGroup({
      layout: presentation.getBindGroupLayout(0),
      entries: [
        {
          binding: 0,
          resource: gpu.createSampler({
            magFilter: 'linear',
            minFilter: 'linear',
          }),
        },
        { binding: 1, resource: pipeline.getOutputTexture().createView() },
      ],
    });
    const validation = await gpu.popErrorScope();
    check();
    if (validation) throw new Error('当前设备不支持此超分管线');

    const draw = async () => {
      if (stopped) return;
      try {
        // 暂停、缓冲时不重复计算，拖动进度后仍渲染新的静帧。
        if (
          video.readyState >= 2 &&
          !video.seeking &&
          (!video.paused || video.currentTime !== lastTime || firstFrame)
        ) {
          if (!bitmapFallback) {
            try {
              gpu.queue.copyExternalImageToTexture(
                { source: video },
                { texture: input },
                [video.videoWidth, video.videoHeight],
              );
            } catch {
              bitmapFallback = true;
            }
          }
          if (bitmapFallback) {
            const bitmap = await createImageBitmap(video);
            try {
              check();
              gpu.queue.copyExternalImageToTexture(
                { source: bitmap },
                { texture: input },
                [video.videoWidth, video.videoHeight],
              );
            } finally {
              bitmap.close();
            }
          }
          check();
          const encoder = gpu.createCommandEncoder();
          pipeline.pass(encoder);
          const pass = encoder.beginRenderPass({
            colorAttachments: [
              {
                view: gpuContext.getCurrentTexture().createView(),
                clearValue: { r: 0, g: 0, b: 0, a: 1 },
                loadOp: 'clear' as const,
                storeOp: 'store' as const,
              },
            ],
          });
          pass.setPipeline(presentation);
          pass.setBindGroup(0, binding);
          pass.draw(3);
          pass.end();
          gpu.queue.submit([encoder.finish()]);
          // 每次最多保留一帧 GPU 工作，避免低性能设备积压渲染队列。
          await gpu.queue.onSubmittedWorkDone();
          check();
          canvas.style.visibility = 'visible';
          firstFrame = false;
          lastTime = video.currentTime;
        }
      } catch (error) {
        fail(error);
      }
      if (!stopped)
        frameId = requestAnimationFrame(() => {
          void draw();
        });
    };
    void draw();
    return { stop };
  } catch (error) {
    stop();
    throw error;
  }
}
