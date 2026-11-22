/**
 * 播放器控制栏的「画质」与「倍速」文字按钮。
 *
 * 参考爱奇艺设计：控制栏右侧显示当前值（如「1080P」「1.0X」），
 * 点击后在按钮上方弹出选择面板（artplayer control 原生 selector 能力），
 * 而非塞进齿轮里的二级菜单，也取代了原先常驻画面右下角的标签。
 *
 * 单码率源同样显示按钮（展示实际分辨率），只是面板里只有当前这一档；
 * 多码率源额外提供「智能」与各档切换。
 */

type Cleanup = () => void;

interface HlsLevelLike {
  height?: number;
  width?: number;
  bitrate?: number;
  name?: string;
}

/** 画质切换所需的最小 hls 能力面 */
export type LevelAwareHls = {
  levels?: HlsLevelLike[];
  currentLevel?: number;
  autoLevelEnabled?: boolean;
  /** 当前实际生效的档位（自动模式下由 hls 内部决定） */
  loadLevel?: number;
  on: (event: string, listener: () => void) => void;
  off: (event: string, listener: () => void) => void;
};

interface SelectorItem {
  html: string;
  value?: string | number;
  default?: boolean;
}

interface ControlElementLike {
  remove: () => void;
}

/** 只声明本模块用到的 artplayer 能力，避免耦合完整类型 */
export interface ArtPlayerControlCapable {
  controls?: {
    add: (option: Record<string, unknown>) => ControlElementLike | undefined;
    update: (option: Record<string, unknown>) => ControlElementLike | undefined;
    remove: (name: string) => unknown;
  };
  template?: {
    $controlsRight?: HTMLElement;
  };
  playbackRate?: number;
  video?: HTMLVideoElement;
  on?: (event: string, listener: () => void) => void;
  off?: (event: string, listener: () => void) => void;
}

const QUALITY_CONTROL_NAME = 'quality';
const SPEED_CONTROL_NAME = 'speed';
const AUTO_VALUE = 'auto';
const AUTO_LABEL = '智能';

function levelLabel(height: number, index: number): string {
  if (height > 0) return `${height}P`;
  return `线路 ${index + 1}`;
}

/** 解析出所有可展示的档位（含单档），按分辨率从高到低 */
export function getDisplayLevels(
  hls: LevelAwareHls | null | undefined,
): Array<{ index: number; height: number; label: string }> {
  const levels = hls?.levels;
  if (!Array.isArray(levels) || levels.length === 0) return [];

  return levels
    .map((level, index) => ({ index, level }))
    .filter(({ level }) => (level.height ?? 0) > 0 || (level.bitrate ?? 0) > 0)
    .map(({ index, level }) => ({
      index,
      height: level.height ?? 0,
      label: levelLabel(level.height ?? 0, index),
    }))
    .sort((a, b) => b.height - a.height || a.index - b.index);
}

/** 控制栏按钮的通用样式（与 artplayer 图标按钮视觉对齐） */
const CONTROL_TEXT_STYLE =
  'display:inline-flex;align-items:center;justify-content:center;min-width:34px;height:100%;padding:0 6px;font-size:13px;font-weight:600;letter-spacing:0.02em;color:inherit;';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * 更新控制栏按钮的可见文案。
 * artplayer 会把内容包进 .art-selector-value，因此只改内层 span 的文本，
 * 不要整体覆盖 innerHTML（否则会破坏包装层，出现文案重复）。
 */
function updateControlLabel(
  art: ArtPlayerControlCapable,
  attr: 'data-quality-control' | 'data-speed-control',
  text: string,
): void {
  const root = art.template?.$controlsRight?.querySelector(`[${attr}]`);
  if (!(root instanceof HTMLElement)) return;
  const span = root.querySelector('.art-selector-value span');
  if (span instanceof HTMLElement) {
    span.textContent = text;
    return;
  }
  const holder = root.querySelector('.art-selector-value');
  if (holder instanceof HTMLElement) {
    holder.innerHTML = `<span style="${CONTROL_TEXT_STYLE}">${escapeHtml(text)}</span>`;
  }
}

function readVideoHeight(art: ArtPlayerControlCapable): number {
  const video = art.video;
  return video && video.videoHeight > 0 ? video.videoHeight : 0;
}

/**
 * 计算按钮文案与面板选项。
 * 优先级：HLS 实际档位 → HLS 唯一档 → video 实际分辨率 → 「画质」。
 */
function resolveQualityState(
  art: ArtPlayerControlCapable,
  hls: LevelAwareHls | null | undefined,
): { text: string; selector: SelectorItem[]; switchable: boolean } {
  const levels = getDisplayLevels(hls);
  const videoHeight = readVideoHeight(art);
  const videoLabel = videoHeight > 0 ? `${videoHeight}P` : '画质';

  if (levels.length >= 2) {
    // hls.js 的 currentLevel 在自动模式下也会返回当前播放分片的档位（不是 -1），
    // 只有 autoLevelEnabled 能可靠区分「智能」与手动锁定。
    const currentLevel =
      typeof hls?.currentLevel === 'number' ? hls.currentLevel : -1;
    const isAuto =
      typeof hls?.autoLevelEnabled === 'boolean'
        ? hls.autoLevelEnabled
        : currentLevel === -1;
    // 自动模式下面板里标注当前实际生效的档位，按钮仍显示「智能」
    const activeIndex = isAuto
      ? typeof hls?.loadLevel === 'number' && hls.loadLevel >= 0
        ? hls.loadLevel
        : currentLevel
      : currentLevel;
    const activeLevel = levels.find((item) => item.index === activeIndex);

    return {
      text: isAuto
        ? AUTO_LABEL
        : (levels.find((item) => item.index === currentLevel)?.label ??
          videoLabel),
      switchable: true,
      selector: [
        {
          html:
            isAuto && activeLevel
              ? `${AUTO_LABEL} · ${activeLevel.label}`
              : AUTO_LABEL,
          value: AUTO_VALUE,
          default: isAuto,
        },
        ...levels.map(({ index, label }) => ({
          html: label,
          value: String(index),
          default: !isAuto && currentLevel === index,
        })),
      ],
    };
  }

  // 单档或 hls 未给出档位信息：展示实际解码分辨率，面板仅列当前这一项
  const single = levels[0];
  const text = single?.label && single.height > 0 ? single.label : videoLabel;
  return {
    text,
    switchable: false,
    selector: [{ html: text, value: 'current', default: true }],
  };
}

/** 手动切换画质时的回调（fromLabel/toLabel 为面板展示文案，如 1080P → 自动） */
export type ManualQualitySwitchHandler = (
  fromLabel: string,
  toLabel: string,
) => void;

/**
 * 添加画质控制栏按钮。
 *
 * 与之前不同：单码率源也注入按钮（显示实际分辨率），
 * 只有多码率源才在面板里提供切换项。
 */
export function addQualityControl(
  art: ArtPlayerControlCapable | null | undefined,
  hls: LevelAwareHls | null | undefined,
  onManualSwitch?: ManualQualitySwitchHandler,
): Cleanup | undefined {
  if (!art?.controls) return undefined;

  let state = resolveQualityState(art, hls);
  // 连分辨率都没有（尚未解码且无档位信息）时不显示，等后续事件再补
  if (state.text === '画质' && !hls) return undefined;

  const buildOption = () => ({
    name: QUALITY_CONTROL_NAME,
    position: 'right',
    index: 30,
    html: `<span style="${CONTROL_TEXT_STYLE}">${escapeHtml(state.text)}</span>`,
    selector: state.selector,
    onSelect(item: SelectorItem) {
      if (state.switchable && hls) {
        const value = String(item?.value ?? AUTO_VALUE);
        const targetLabel = String(item?.html ?? state.text);
        // 只在真实生效的切档上报（单码率源的面板点击不触发）
        onManualSwitch?.(state.text, targetLabel);
        try {
          hls.currentLevel = value === AUTO_VALUE ? -1 : Number(value);
        } catch {
          // hls 实例已销毁时忽略
        }
        // 切换后的真实档位由 hls 在后续 LEVEL_SWITCHED 给出，先按写入口径刷新；
        // 延后一帧执行，避免在点击回调里重建正在响应的面板节点。
        state = resolveQualityState(art, hls);
        schedulePaint();
      }
      // artplayer 会用返回值替换按钮 innerHTML，必须返回带样式的 span，
      // 否则按钮会显示字面量 "undefined"
      const label = String(item?.html ?? state.text);
      return `<span style="${CONTROL_TEXT_STYLE}">${escapeHtml(label)}</span>`;
    },
    mounted(this: unknown, element: HTMLElement) {
      element.setAttribute('data-quality-control', 'true');
    },
  });

  const paint = () => {
    if (disposed) return;
    updateControlLabel(art, 'data-quality-control', state.text);
    // 档位/可切换性变化时同步面板选项
    try {
      art.controls?.update(buildOption());
    } catch {
      // 更新失败不影响播放
    }
  };

  let disposed = false;
  let paintTimer: ReturnType<typeof setTimeout> | null = null;
  const schedulePaint = () => {
    if (paintTimer) return;
    paintTimer = setTimeout(() => {
      paintTimer = null;
      paint();
    }, 0);
  };

  let control: ControlElementLike | undefined;
  try {
    control = art.controls.add(buildOption());
  } catch {
    return undefined;
  }

  const refresh = () => {
    if (disposed) return;
    const next = resolveQualityState(art, hls);
    // 自动模式下按钮文案不变，但面板里标注的实际档位会变，需要一起比较
    const signature = (stateLike: { selector: SelectorItem[] }) =>
      stateLike.selector
        .map((item) => `${item.html}:${item.default ? 1 : 0}`)
        .join('|');
    const changed =
      next.text !== state.text || signature(next) !== signature(state);
    state = next;
    if (changed) paint();
  };

  const onLevelSwitch = () => refresh();
  hls?.on('hlsLevelSwitched', onLevelSwitch);

  // 单码率源要靠解码出的分辨率才能显示，监听元数据与尺寸变化
  const videoEl = art.video;
  videoEl?.addEventListener('loadedmetadata', refresh);
  videoEl?.addEventListener('resize', refresh);

  return () => {
    disposed = true;
    if (paintTimer) {
      clearTimeout(paintTimer);
      paintTimer = null;
    }
    hls?.off('hlsLevelSwitched', onLevelSwitch);
    videoEl?.removeEventListener('loadedmetadata', refresh);
    videoEl?.removeEventListener('resize', refresh);
    try {
      art.controls?.remove(QUALITY_CONTROL_NAME);
    } catch {
      // ignore
    }
    control?.remove();
  };
}

type HlsCarrierVideo = HTMLVideoElement & {
  hls?: LevelAwareHls | null;
};

/** 画质控件需要的 artplayer 能力面（含事件订阅） */
export type QualityControlArt = ArtPlayerControlCapable & {
  on: (event: string, listener: () => void) => void;
  off: (event: string, listener: () => void) => void;
};

export interface QualityControls {
  /** 按当前生效的 hls 实例对齐控件（换集/换源后调用） */
  sync: () => void;
  dispose: () => void;
}

/**
 * 画质控件的生命周期管理器。
 *
 * 换集复用播放器时 artplayer 不会再次触发 `ready`，但 hls 实例会被重建；
 * 旧控件仍绑定已销毁的实例，选档无效。这里负责在 hls 实例变化后
 * 先卸载旧控件、再按新实例重建，并等待新实例解析出档位后再挂载。
 */
export function createQualityControls(
  art: QualityControlArt | null | undefined,
  onManualSwitch?: ManualQualitySwitchHandler,
): QualityControls {
  if (!art?.controls) {
    return { sync: () => undefined, dispose: () => undefined };
  }

  // 闭包里无法沿用类型收窄，这里固定一份非空引用
  const player = art;

  let installedHls: LevelAwareHls | undefined;
  let cleanup: Cleanup | undefined;
  let pendingHls: LevelAwareHls | undefined;
  let boundVideo: HTMLVideoElement | undefined;
  let disposed = false;

  const readHls = (): LevelAwareHls | undefined =>
    (player.video as HlsCarrierVideo | undefined)?.hls ?? undefined;

  const stopWaiting = () => {
    pendingHls?.off('hlsManifestParsed', sync);
    pendingHls = undefined;
  };

  const unbindVideo = () => {
    boundVideo?.removeEventListener('loadedmetadata', sync);
    boundVideo?.removeEventListener('loadeddata', sync);
    boundVideo?.removeEventListener('resize', sync);
    boundVideo = undefined;
  };

  function sync() {
    if (disposed) return;

    // artplayer 换集时会复用 video 元素，一般不会变；重建时兜底重新绑定
    const video = player.video;
    if (video !== boundVideo) {
      unbindVideo();
      boundVideo = video;
      video?.addEventListener('loadedmetadata', sync);
      video?.addEventListener('loadeddata', sync);
      video?.addEventListener('resize', sync);
    }

    const hls = readHls();
    if (cleanup && hls === installedHls) return;

    const uninstall = () => {
      cleanup?.();
      cleanup = undefined;
      installedHls = undefined;
    };

    // hls 实例存在但档位还没解析：先卸掉绑定旧实例的控件，等 manifest 解析完
    if (hls && (hls.levels?.length ?? 0) === 0) {
      uninstall();
      if (pendingHls !== hls) {
        stopWaiting();
        pendingHls = hls;
        hls.on('hlsManifestParsed', sync);
      }
      return;
    }

    // 原生 HLS / 直链：只靠解码出的分辨率，没有就继续等 loadedmetadata
    if (!hls && (player.video?.videoHeight ?? 0) <= 0) return;

    stopWaiting();
    uninstall();
    installedHls = hls;
    cleanup = addQualityControl(player, hls, onManualSwitch);
    if (!cleanup) installedHls = undefined;
  }

  player.on('restart', sync);
  sync();

  return {
    sync,
    dispose: () => {
      disposed = true;
      player.off('restart', sync);
      unbindVideo();
      stopWaiting();
      cleanup?.();
      cleanup = undefined;
      installedHls = undefined;
    },
  };
}

/** 倍速档位，与 setupArtplayerGlobals 中 PLAYBACK_RATE 保持一致 */
const SPEED_RATES = [3, 2, 1.5, 1.25, 1, 0.75, 0.5];

function formatRate(rate: number): string {
  // 1 → 1.0X、1.25 → 1.25X、3 → 3.0X，与爱奇艺展示风格一致
  const text = Number.isInteger(rate) ? rate.toFixed(1) : String(rate);
  return `${text}X`;
}

/**
 * 添加倍速控制栏按钮：显示当前倍速，点击弹出档位面板。
 */
export function addSpeedControl(
  art: ArtPlayerControlCapable | null | undefined,
): Cleanup | undefined {
  if (!art?.controls) return undefined;

  const readRate = () => {
    const rate = art.playbackRate ?? art.video?.playbackRate ?? 1;
    return Number.isFinite(rate) && rate > 0 ? rate : 1;
  };

  let currentRate = readRate();
  let buttonText = formatRate(currentRate);

  const buildSelector = (): SelectorItem[] =>
    SPEED_RATES.map((rate) => ({
      html: formatRate(rate),
      value: String(rate),
      default: Math.abs(rate - currentRate) < 0.001,
    }));

  let disposed = false;
  let paintTimer: ReturnType<typeof setTimeout> | null = null;

  const buildOption = (): Record<string, unknown> => ({
    name: SPEED_CONTROL_NAME,
    position: 'right',
    index: 31,
    html: `<span style="${CONTROL_TEXT_STYLE}">${escapeHtml(buttonText)}</span>`,
    selector: buildSelector(),
    onSelect(item: SelectorItem) {
      const next = Number(item?.value);
      if (!Number.isFinite(next) || next <= 0) return undefined;
      currentRate = next;
      buttonText = formatRate(next);
      try {
        if (art.video) art.video.playbackRate = next;
        else art.playbackRate = next;
      } catch {
        // ignore
      }
      // 面板里的高亮档位要跟着更新，延后一帧避免重建正在响应的节点
      schedulePaint();
      return `<span style="${CONTROL_TEXT_STYLE}">${escapeHtml(buttonText)}</span>`;
    },
    mounted(this: unknown, element: HTMLElement) {
      element.setAttribute('data-speed-control', 'true');
    },
  });

  const paint = () => {
    if (disposed) return;
    updateControlLabel(art, 'data-speed-control', buttonText);
    try {
      art.controls?.update(buildOption());
    } catch {
      // 更新失败不影响播放
    }
  };

  const schedulePaint = () => {
    if (paintTimer || disposed) return;
    paintTimer = setTimeout(() => {
      paintTimer = null;
      paint();
    }, 0);
  };

  let control: ControlElementLike | undefined;
  try {
    control = art.controls.add(buildOption());
  } catch {
    return undefined;
  }

  // 播放页其它入口（快捷键、设置面板）改倍速时同步按钮文案与面板高亮
  const videoEl = art.video;
  const onRateChange = () => {
    const next = readRate();
    if (Math.abs(next - currentRate) < 0.001) return;
    currentRate = next;
    buttonText = formatRate(next);
    paint();
  };
  videoEl?.addEventListener('ratechange', onRateChange);

  return () => {
    disposed = true;
    if (paintTimer) {
      clearTimeout(paintTimer);
      paintTimer = null;
    }
    videoEl?.removeEventListener('ratechange', onRateChange);
    try {
      art.controls?.remove(SPEED_CONTROL_NAME);
    } catch {
      // ignore
    }
    control?.remove();
  };
}
