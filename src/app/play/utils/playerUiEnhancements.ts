/**
 * 播放器 UI 增强工具
 * 管理弹幕控件优化、进度条冲突修复、移动端适配等 UI 功能
 */

import type { MutableRefObject } from 'react';

import type { ArtPlayerLike } from './danmakuRuntime';
import type { HlsInstanceLike } from './hlsStreamInfo';

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
 * 优化弹幕控件的 CSS
 * 隐藏弹幕开关按钮和发射器，优化配置面板显示
 */
export function optimizeDanmukuControlsCSS(): Cleanup {
  if (document.getElementById('danmuku-controls-optimize')) return noop;

  const style = document.createElement('style');
  style.id = 'danmuku-controls-optimize';
  style.textContent = `
    /* 隐藏弹幕开关按钮和发射器 */
    .artplayer-plugin-danmuku .apd-toggle {
      display: none !important;
    }

    @media (max-width: 768px) {
      .artplayer-plugin-danmuku .apd-toggle {
        display: inline-flex !important;
      }
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

        // console.log('🔄 弹幕菜单hover状态已重置'); // 减少控制台噪音
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
      // console.log('🚀 弹幕菜单hover状态已立即恢复'); // 减少控制台噪音
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

      console.log('弹幕面板：使用CSS默认定位，自动适配屏幕方向');
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
      console.log('移动端弹幕配置面板：显示');
    } else {
      (configPanel as HTMLElement).style.display = 'none';
      console.log('移动端弹幕配置面板：隐藏');
    }
  };

  const handleArtResize = () => {
    if (isConfigVisible) {
      console.log('检测到ArtPlayer resize事件，重新调整弹幕面板位置');
      resizeTimer = setTimeout(adjustPanelPosition, 50);
    }
  };

  const handleOrientationChange = () => {
    if (isConfigVisible) {
      console.log('检测到屏幕方向变化，重新调整弹幕面板位置');
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

    console.log('设备类型:', isMobile ? '移动端' : '桌面端');

    // 桌面端：简化处理，依赖 CSS hover，移除复杂的 JavaScript 事件
    if (!isMobile) {
      console.log('桌面端：使用CSS原生hover，避免JavaScript事件冲突');
      return;
    }

    if (isMobile) {
      // 移动端：添加点击切换支持 + 持久位置修正
      console.log('为移动端添加弹幕配置按钮点击切换功能');

      configButton.addEventListener('click', handleConfigClick);

      // 监听 ArtPlayer 的 resize 事件
      const art = getArtPlayer(artPlayerRef);
      if (art?.on) {
        art.on('resize', handleArtResize);
        console.log('已监听ArtPlayer resize事件，实现自动适配');
      }

      window.addEventListener('orientationchange', handleOrientationChange);
      window.addEventListener('resize', handleOrientationChange);
      document.addEventListener('click', handleDocumentClick);

      console.log('移动端弹幕配置切换功能已激活');
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
 * 添加播放器实时分辨率显示
 * 在播放器右下角显示当前播放的分辨率和码率
 * @param art ArtPlayer 实例
 * @param hlsInstance HLS.js 实例
 * @param m3u8Url M3U8 URL（用于从缓存读取）
 * @returns 清理函数
 */
export function addResolutionDisplay(
  art: ArtPlayerLike | null | undefined,
  hlsInstance: HlsInstanceLike | null | undefined,
  m3u8Url?: string,
): (() => void) | undefined {
  if (!art) return;

  try {
    // 创建显示元素
    const resolutionEl = document.createElement('div');
    resolutionEl.className = 'art-resolution-display';
    resolutionEl.style.cssText = `
      position: absolute;
      bottom: 50px;
      right: 50px;
      background: rgba(0, 0, 0, 0.75);
      color: white;
      padding: 4px 10px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 600;
      pointer-events: none;
      z-index: 20;
      transition: opacity 0.3s ease;
      opacity: 0;
      backdrop-filter: blur(8px);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    `;

    const playerElement = art.template?.$player;
    if (!playerElement) return undefined;
    playerElement.appendChild(resolutionEl);

    let hideTimer: NodeJS.Timeout | null = null;
    let lastUpdate = 0;
    const updateThrottle = 2000; // ✅ 限制更新频率为 2 秒

    // 更新分辨率显示
    const updateDisplay = () => {
      try {
        // ✅ 节流：避免频繁更新
        const now = Date.now();
        if (now - lastUpdate < updateThrottle) {
          return;
        }
        lastUpdate = now;

        const currentLevel = hlsInstance?.currentLevel ?? -1;
        if (!hlsInstance?.levels || currentLevel < 0) {
          return;
        }

        const level = hlsInstance.levels[currentLevel];
        if (level && level.height > 0) {
          const resolution = `${level.height}p`;
          const bitrate =
            level.bitrate > 0 ? (level.bitrate / 1000000).toFixed(1) : '?';

          resolutionEl.textContent = `${resolution} · ${bitrate}Mbps`;
          resolutionEl.style.opacity = '1';

          // 清除之前的定时器
          if (hideTimer) {
            clearTimeout(hideTimer);
          }

          // 3秒后淡出
          hideTimer = setTimeout(() => {
            resolutionEl.style.opacity = '0.3';
          }, 3000);

          console.log(`📺 分辨率显示更新: ${resolution} (${bitrate}Mbps)`);
        }
      } catch (error) {
        console.warn('⚠️ 更新分辨率显示失败:', error);
      }
    };

    // 如果有 HLS 实例，监听事件
    if (hlsInstance) {
      hlsInstance.on('hlsLevelSwitched', updateDisplay);
      hlsInstance.on('hlsManifestParsed', updateDisplay);

      // 延迟初始显示，等待播放器稳定
      setTimeout(updateDisplay, 1000);
    } else {
      // 没有 HLS 实例，尝试从缓存读取
      if (m3u8Url) {
        import('./smartCache')
          .then(({ smartCache }) => {
            const cached = smartCache.get(m3u8Url);

            if (cached?.levels && cached.levels.length > 0) {
              const bestLevel = cached.levels[0];
              const resolution = `${bestLevel.height}p`;
              const bitrate =
                bestLevel.bitrate > 0
                  ? (bestLevel.bitrate / 1000000).toFixed(1)
                  : '?';

              resolutionEl.textContent = `${resolution} · ${bitrate}Mbps`;
              resolutionEl.style.opacity = '1';

              setTimeout(() => {
                resolutionEl.style.opacity = '0.3';
              }, 3000);

              console.log(
                `📺 分辨率显示（缓存）: ${resolution} (${bitrate}Mbps)`,
              );
            }
          })
          .catch((error) => {
            console.warn('⚠️ 从缓存读取分辨率失败:', error);
          });
      }
    }

    // 鼠标移入播放器时显示，移出时淡化
    const handleMouseEnter = () => {
      if (resolutionEl.textContent) {
        resolutionEl.style.opacity = '1';
      }
    };

    const handleMouseLeave = () => {
      if (resolutionEl.textContent) {
        resolutionEl.style.opacity = '0.3';
      }
    };

    art.template?.$player.addEventListener('mouseenter', handleMouseEnter);
    art.template?.$player.addEventListener('mouseleave', handleMouseLeave);

    console.log('✅ 分辨率显示组件已添加');

    // 返回清理函数
    return () => {
      if (hideTimer) {
        clearTimeout(hideTimer);
      }

      if (hlsInstance) {
        hlsInstance.off('hlsLevelSwitched', updateDisplay);
        hlsInstance.off('hlsManifestParsed', updateDisplay);
      }

      art.template?.$player.removeEventListener('mouseenter', handleMouseEnter);
      art.template?.$player.removeEventListener('mouseleave', handleMouseLeave);

      resolutionEl.remove();
      console.log('🧹 分辨率显示组件已清理');
    };
  } catch (error) {
    console.error('❌ 添加分辨率显示失败:', error);
    return undefined;
  }
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
