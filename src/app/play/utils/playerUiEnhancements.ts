/**
 * 播放器 UI 增强工具
 * 管理弹幕控件优化、进度条冲突修复、移动端适配等 UI 功能
 */

import type { MutableRefObject } from 'react';

import type { ArtPlayerLike } from './danmakuRuntime';

type Cleanup = () => void;
const noop: Cleanup = () => undefined;

type ArtPlayerRefLike =
  | MutableRefObject<ArtPlayerLike | null>
  | ArtPlayerLike
  | null
  | undefined;

interface WebkitPresentationVideo extends HTMLVideoElement {
  webkitSupportsPresentationMode?: boolean;
  webkitPresentationMode?: string;
  webkitSetPresentationMode?: (mode: string) => void;
}

function getArtPlayer(refOrArt: ArtPlayerRefLike): ArtPlayerLike | null {
  if (!refOrArt) return null;
  return 'current' in refOrArt ? refOrArt.current : refOrArt;
}

/**
 * 修复控制栏选择面板（画质/倍速）无法点选的问题。
 *
 * 根因：面板从 .art-bottom 内部向上溢出，而 .art-bottom 有 overflow:hidden，
 * 导致面板虽可见但命中测试被裁剪——鼠标移进面板等于离开控件，
 * hover 失效后面板立即关闭，选项点不到。
 */
export function fixControlSelectorInteraction(): Cleanup {
  const styleId = 'art-selector-interaction-fix';
  if (document.getElementById(styleId)) return noop;

  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
    /* 1) 面板从 .art-bottom 内部向上溢出，而它有 overflow:hidden，
       会让面板可见却无法命中——解除裁剪，同时不改变底部栏布局。 */
    .art-video-player .art-bottom {
      overflow: visible !important;
    }

    /* 2) 层叠：进度条 .art-progress 自带 z-index:1000，
       且 .art-controls(z-index:10) 形成层叠上下文封顶了子元素。
       面板必须盖过进度条，否则鼠标上移到进度条区域时被抢走 hover，面板立即关闭。 */
    .art-video-player .art-controls,
    .art-video-player .art-control-selector,
    .art-video-player .art-selector-list {
      z-index: 1001 !important;
    }
  `;
  document.head.appendChild(style);

  return () => {
    style.remove();
  };
}

/**
 * 移动端控制栏精简。
 *
 * 小屏放不下全部控件：控制栏溢出时整行会被引擎推出可视区，最左边的
 * 播放按钮反而先消失。音量在移动端用设备键调节；画质在移动端意义不大
 * （小屏 + 自动码率），两者直接隐藏（artplayer 会给移动端 UA 的播放器
 * 加 .art-mobile 类），把空间留给播放/时间/倍速/全屏。
 * PiP / 网页全屏已在配置层关闭（artplayerConfig.ts）。
 */
export function hideRedundantControlsOnMobile(): Cleanup {
  const styleId = 'art-mobile-controls-slim';
  if (document.getElementById(styleId)) return noop;

  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
    .art-video-player.art-mobile .art-control-volume,
    .art-video-player.art-mobile .art-control-quality {
      display: none !important;
    }
  `;
  document.head.appendChild(style);

  return () => {
    style.remove();
  };
}

/**
 * 移动端把投屏（Chromecast）与画中画（PiP）按钮挪到播放器右上角。
 *
 * 两个按钮在移动端仍有用，但底栏空间寸土寸金，留在控制栏会把倍速/全屏
 * 挤出可视区。挂载后把它们移出 .art-controls、锚定到播放器右上角，
 * 随控制栏一起淡入淡出。
 */
export function relocateCornerControlsOnMobile(): Cleanup {
  const isMobile =
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent,
    );
  if (!isMobile) return noop;

  const styleId = 'art-cast-corner-style';
  let style: HTMLStyleElement | null = null;
  if (!document.getElementById(styleId)) {
    style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      .art-video-player .art-control-chromecast.art-cast-corner,
      .art-video-player .art-control-pip.art-cast-corner {
        position: absolute;
        /* 顶部 12~44px 是跳过设置按钮（PlayerContainer top-3 right-3），
           投屏/画中画排在它下方，留 8px 间距 */
        top: 52px;
        right: 10px;
        z-index: 55; /* 高于 video(10)/字幕(20)/弹幕(30)/layer(40)/mask(50)，低于 bottom(60)/loading(70) */
        display: flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        cursor: pointer;
        opacity: 0;
        pointer-events: none;
        transition: opacity var(--art-transition-duration) ease;
      }
      /* 画中画排在投屏左侧 */
      .art-video-player .art-control-pip.art-cast-corner {
        right: 52px;
      }
      .art-video-player .art-control-chromecast.art-cast-corner svg,
      .art-video-player .art-control-pip.art-cast-corner svg {
        width: 22px;
        height: 22px;
      }
      .art-video-player.art-control-show .art-control-chromecast.art-cast-corner,
      .art-video-player.art-control-show .art-control-pip.art-cast-corner {
        opacity: 1;
        pointer-events: auto;
      }
    `;
    document.head.appendChild(style);
  }

  const movedButtons: HTMLElement[] = [];
  // 等待 chromecast 插件挂载控制按钮（与其他 UI 增强的延迟策略一致）
  const setupTimer = setTimeout(() => {
    const player = document.querySelector('.art-video-player');
    if (!player) return;
    for (const sel of ['.art-control-chromecast', '.art-control-pip']) {
      const btn = player.querySelector(sel) as HTMLElement | null;
      if (!btn) continue;
      btn.classList.add('art-cast-corner');
      player.appendChild(btn);
      movedButtons.push(btn);
    }
  }, 1500);

  return () => {
    clearTimeout(setupTimer);
    movedButtons.forEach((btn) => btn.classList.remove('art-cast-corner'));
    style?.remove();
  };
}

/**
 * 优化弹幕控件的 CSS
 * 隐藏弹幕开关按钮和发射器，优化配置面板显示
 */
export function optimizeDanmukuControlsCSS(): Cleanup {
  if (document.getElementById('danmuku-controls-optimize')) return noop;

  const style = document.createElement('style');
  style.id = 'danmuku-controls-optimize';
  style.textContent = `
    /* 隐藏弹幕开关按钮和发射器（移动端也不显示，控制栏空间留给
       播放/时间/倍速/全屏；弹幕显隐后续如需入口可放设置面板） */
    .artplayer-plugin-danmuku .apd-toggle {
      display: none !important;
    }

    .artplayer-plugin-danmuku .apd-emitter {
      display: none !important;
    }

    /* 弹幕配置面板优化 - 修复全屏模式下点击问题 */
    .artplayer-plugin-danmuku .apd-config {
      position: relative;
    }

    .artplayer-plugin-danmuku .apd-config-panel {
      /* 使用绝对定位而不是fixed，让ArtPlayer的动态定位生效 */
      position: absolute !important;
      /* 保持ArtPlayer原版的默认left: 0，让JS动态覆盖 */
      /* 保留z-index确保层级正确 */
      z-index: 2147483647 !important; /* 使用最大z-index确保在全屏模式下也能显示在最顶层 */
      /* 确保面板可以接收点击事件 */
      pointer-events: auto !important;
      /* 添加一些基础样式确保可见性 */
      background: rgba(0, 0, 0, 0.8);
      border-radius: 6px;
      backdrop-filter: blur(10px);
    }

    /* 全屏模式下的特殊优化 */
    .artplayer[data-fullscreen="true"] .artplayer-plugin-danmuku .apd-config-panel {
      /* 全屏时使用固定定位并调整位置 */
      position: fixed !important;
      top: auto !important;
      bottom: 80px !important; /* 距离底部控制栏80px */
      right: 20px !important; /* 距离右边20px */
      left: auto !important;
      z-index: 2147483647 !important;
    }

    /* 确保全屏模式下弹幕面板内部元素可点击 */
    .artplayer[data-fullscreen="true"] .artplayer-plugin-danmuku .apd-config-panel * {
      pointer-events: auto !important;
    }
  `;
  document.head.appendChild(style);
  return noop;
}

/**
 * 修复弹幕菜单与进度条拖拽冲突
 * 基于 ArtPlayer 原生拖拽逻辑进行精确控制
 */
export function fixDanmakuProgressConflict(): Cleanup {
  let isDraggingProgress = false;
  let progressControl: HTMLElement | null = null;
  let resetInterval: NodeJS.Timeout | null = null;
  let restoreTimer: NodeJS.Timeout | null = null;

  const handleProgressMouseDown = (event: MouseEvent) => {
    if (event.button === 0) {
      isDraggingProgress = true;
      const artplayer = document.querySelector('.artplayer') as HTMLElement;
      artplayer?.setAttribute('data-dragging', 'true');
    }
  };

  const handleDocumentMouseMove = (e: MouseEvent) => {
    const playerContainer = document.querySelector('.artplayer') as HTMLElement;
    if (!playerContainer || !playerContainer.contains(e.target as Node)) {
      return;
    }

    if (isDraggingProgress) {
      const panels = document.querySelectorAll(
        '.artplayer-plugin-danmuku .apd-config-panel, .artplayer-plugin-danmuku .apd-style-panel',
      ) as NodeListOf<HTMLElement>;
      panels.forEach((panel) => {
        if (panel.style.opacity !== '0') {
          panel.style.opacity = '0';
          panel.style.pointerEvents = 'none';
        }
      });
    }
  };

  const handleDocumentMouseUp = () => {
    if (!isDraggingProgress) return;

    isDraggingProgress = false;
    const artplayer = document.querySelector('.artplayer') as HTMLElement;
    artplayer?.removeAttribute('data-dragging');
  };

  const setupTimer = setTimeout(() => {
    progressControl = document.querySelector(
      '.art-control-progress',
    ) as HTMLElement;
    if (!progressControl) return;

    // 添加精确的 CSS 控制
    const addPrecisionCSS = () => {
      if (document.getElementById('danmaku-drag-fix')) return;

      const style = document.createElement('style');
      style.id = 'danmaku-drag-fix';
      style.textContent = `
        /* 🔧 修复长时间播放后弹幕菜单hover失效问题 */

        /* 确保控制元素本身可以接收鼠标事件，恢复原生hover机制 */
        .artplayer-plugin-danmuku .apd-config,
        .artplayer-plugin-danmuku .apd-style {
          pointer-events: auto !important;
        }

        /* 简化：依赖全局CSS中的hover处理 */

        /* 确保进度条层级足够高，避免被弹幕面板遮挡 */
        .art-progress {
          position: relative;
          z-index: 1000 !important;
        }

        /* 面板背景在非hover状态下不拦截事件，但允许hover检测 */
        .artplayer-plugin-danmuku .apd-config-panel:not(:hover),
        .artplayer-plugin-danmuku .apd-style-panel:not(:hover) {
          pointer-events: none;
        }

        /* 面板内的具体控件始终可以交互 */
        .artplayer-plugin-danmuku .apd-config-panel-inner,
        .artplayer-plugin-danmuku .apd-style-panel-inner,
        .artplayer-plugin-danmuku .apd-config-panel .apd-mode,
        .artplayer-plugin-danmuku .apd-config-panel .apd-other,
        .artplayer-plugin-danmuku .apd-config-panel .apd-slider,
        .artplayer-plugin-danmuku .apd-style-panel .apd-mode,
        .artplayer-plugin-danmuku .apd-style-panel .apd-color {
          pointer-events: auto !important;
        }
      `;
      document.head.appendChild(style);
    };

    // 绑定事件 - 与 ArtPlayer 使用相同的事件绑定方式
    progressControl.addEventListener('mousedown', handleProgressMouseDown);
    document.addEventListener('mousemove', handleDocumentMouseMove);
    document.addEventListener('mouseup', handleDocumentMouseUp);

    // 应用 CSS
    addPrecisionCSS();

    // 🔄 添加定期重置机制，防止长时间播放后状态污染
    resetInterval = setInterval(() => {
      try {
        // 重置弹幕控件和面板状态
        const controls = document.querySelectorAll(
          '.artplayer-plugin-danmuku .apd-config, .artplayer-plugin-danmuku .apd-style',
        ) as NodeListOf<HTMLElement>;
        const panels = document.querySelectorAll(
          '.artplayer-plugin-danmuku .apd-config-panel, .artplayer-plugin-danmuku .apd-style-panel',
        ) as NodeListOf<HTMLElement>;

        // 强制重置控制元素的事件接收能力
        controls.forEach((control) => {
          if (control.style.pointerEvents === 'none') {
            control.style.pointerEvents = 'auto';
          }
        });

        // 重置面板状态，但不影响当前 hover 状态
        panels.forEach((panel) => {
          if (!panel.matches(':hover') && panel.style.opacity === '0') {
            panel.style.opacity = '';
            panel.style.pointerEvents = '';
            panel.style.visibility = '';
          }
        });
      } catch (error) {
        console.warn('弹幕状态重置失败:', error);
      }
    }, 300000); // 每5分钟重置一次

    // 🚀 立即恢复 hover 状态（修复当前可能已存在的问题）
    const immediateRestore = () => {
      const controls = document.querySelectorAll(
        '.artplayer-plugin-danmuku .apd-config, .artplayer-plugin-danmuku .apd-style',
      ) as NodeListOf<HTMLElement>;
      controls.forEach((control) => {
        control.style.pointerEvents = 'auto';
      });
    };

    // 立即执行一次恢复
    restoreTimer = setTimeout(immediateRestore, 100);
  }, 1500); // 等待弹幕插件加载

  return () => {
    clearTimeout(setupTimer);
    if (restoreTimer) clearTimeout(restoreTimer);
    if (resetInterval) clearInterval(resetInterval);

    progressControl?.removeEventListener('mousedown', handleProgressMouseDown);
    document.removeEventListener('mousemove', handleDocumentMouseMove);
    document.removeEventListener('mouseup', handleDocumentMouseUp);

    const artplayer = document.querySelector('.artplayer') as HTMLElement;
    artplayer?.removeAttribute('data-dragging');
  };
}

/**
 * 移动端弹幕配置按钮点击切换支持
 * 基于 ArtPlayer 设置按钮原理
 */
export function addMobileDanmakuToggle(
  artPlayerRef: ArtPlayerRefLike,
): Cleanup {
  const isMobile =
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent,
    );
  let configButton: Element | null = null;
  let configPanel: Element | null = null;
  let isConfigVisible = false;
  let resizeTimer: NodeJS.Timeout | null = null;

  const adjustPanelPosition = () => {
    const player = document.querySelector('.artplayer');
    if (!player || !configButton || !configPanel) return;

    try {
      const panelElement = configPanel as HTMLElement;
      panelElement.style.left = '';
      panelElement.style.right = '';
      panelElement.style.transform = '';
    } catch (error) {
      console.warn('弹幕面板位置调整失败:', error);
    }
  };

  const handleConfigClick = (e: Event) => {
    e.preventDefault();
    e.stopPropagation();

    isConfigVisible = !isConfigVisible;
    if (!configPanel) return;

    if (isConfigVisible) {
      (configPanel as HTMLElement).style.display = 'block';
      resizeTimer = setTimeout(adjustPanelPosition, 10);
    } else {
      (configPanel as HTMLElement).style.display = 'none';
    }
  };

  const handleArtResize = () => {
    if (isConfigVisible) {
      resizeTimer = setTimeout(adjustPanelPosition, 50);
    }
  };

  const handleOrientationChange = () => {
    if (isConfigVisible) {
      resizeTimer = setTimeout(adjustPanelPosition, 100);
    }
  };

  const handleDocumentClick = (e: MouseEvent) => {
    const playerContainer = document.querySelector('.artplayer');
    if (!playerContainer || !playerContainer.contains(e.target as Node)) {
      return;
    }

    if (
      isConfigVisible &&
      configButton &&
      configPanel &&
      !configButton.contains(e.target as Node) &&
      !configPanel.contains(e.target as Node)
    ) {
      isConfigVisible = false;
      (configPanel as HTMLElement).style.display = 'none';
    }
  };

  const setupTimer = setTimeout(() => {
    configButton = document.querySelector(
      '.artplayer-plugin-danmuku .apd-config',
    );
    configPanel = document.querySelector(
      '.artplayer-plugin-danmuku .apd-config-panel',
    );

    if (!configButton || !configPanel) {
      console.warn('弹幕配置按钮或面板未找到');
      return;
    }

    // 桌面端：简化处理，依赖 CSS hover，移除复杂的 JavaScript 事件
    if (!isMobile) {
      return;
    }

    if (isMobile) {
      // 移动端：添加点击切换支持 + 持久位置修正

      configButton.addEventListener('click', handleConfigClick);

      // 监听 ArtPlayer 的 resize 事件
      const art = getArtPlayer(artPlayerRef);
      if (art?.on) {
        art.on('resize', handleArtResize);
      }

      window.addEventListener('orientationchange', handleOrientationChange);
      window.addEventListener('resize', handleOrientationChange);
      document.addEventListener('click', handleDocumentClick);
    }
  }, 2000); // 延迟2秒确保弹幕插件完全初始化

  return () => {
    clearTimeout(setupTimer);
    if (resizeTimer) clearTimeout(resizeTimer);

    configButton?.removeEventListener('click', handleConfigClick);
    getArtPlayer(artPlayerRef)?.off?.('resize', handleArtResize);
    window.removeEventListener('orientationchange', handleOrientationChange);
    window.removeEventListener('resize', handleOrientationChange);
    document.removeEventListener('click', handleDocumentClick);
  };
}

export function enablePictureInPictureControl(
  artPlayerRef: ArtPlayerRefLike,
): Cleanup {
  let pipControl: HTMLElement | null = null;

  const tryTogglePip = async () => {
    const art = getArtPlayer(artPlayerRef);
    const video = art?.video as HTMLVideoElement | undefined;
    if (!video) return;

    const webkitVideo = video as WebkitPresentationVideo;
    const canWebkitPip =
      !!webkitVideo?.webkitSupportsPresentationMode &&
      typeof webkitVideo.webkitSetPresentationMode === 'function';

    if (!canWebkitPip) return;

    try {
      const mode = webkitVideo.webkitPresentationMode;
      webkitVideo.webkitSetPresentationMode?.(
        mode === 'picture-in-picture' ? 'inline' : 'picture-in-picture',
      );
    } catch (_) {
      if (art?.notice) {
        art.notice.show = '画中画启动失败';
      }
    }
  };

  const handlePipClick = async (e: MouseEvent) => {
    const art = getArtPlayer(artPlayerRef);
    const video = art?.video as HTMLVideoElement | undefined;
    if (!video) return;

    const hasNativePip = typeof video.requestPictureInPicture === 'function';
    if (hasNativePip) return;

    const webkitVideo = video as WebkitPresentationVideo;
    const canWebkitPip =
      !!webkitVideo?.webkitSupportsPresentationMode &&
      typeof webkitVideo.webkitSetPresentationMode === 'function';
    if (!canWebkitPip) {
      if (art?.notice) {
        art.notice.show = '当前浏览器不支持画中画';
      }
      return;
    }

    e.preventDefault();
    e.stopPropagation();
    await tryTogglePip();
  };

  const setupTimer = setTimeout(() => {
    pipControl = document.querySelector(
      '.art-control-pip',
    ) as HTMLElement | null;
    if (!pipControl) return;
    if (pipControl.dataset.pipEnhanced === 'true') return;
    pipControl.dataset.pipEnhanced = 'true';

    pipControl.addEventListener('click', handlePipClick, true);
  }, 1200);

  return () => {
    clearTimeout(setupTimer);
    pipControl?.removeEventListener('click', handlePipClick, true);
    if (pipControl?.dataset.pipEnhanced === 'true') {
      delete pipControl.dataset.pipEnhanced;
    }
  };
}

/**
 * 一次性应用所有 UI 增强功能
 */
export function applyAllUiEnhancements(
  artPlayerRef: ArtPlayerRefLike,
): Cleanup {
  const art = getArtPlayer(artPlayerRef);
  art?.__uiEnhancementsCleanup?.();

  const cleanups = [
    fixControlSelectorInteraction(),
    hideRedundantControlsOnMobile(),
    relocateCornerControlsOnMobile(),
    optimizeDanmukuControlsCSS(),
    fixDanmakuProgressConflict(),
    addMobileDanmakuToggle(artPlayerRef),
    enablePictureInPictureControl(artPlayerRef),
  ];

  const cleanup = () => {
    cleanups.splice(0).forEach((dispose) => dispose());
    if (art?.__uiEnhancementsCleanup === cleanup) {
      delete art.__uiEnhancementsCleanup;
    }
  };

  if (art) {
    art.__uiEnhancementsCleanup = cleanup;
  }

  return cleanup;
}
