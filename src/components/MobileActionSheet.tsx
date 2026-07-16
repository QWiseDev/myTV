import { Radio, X } from 'lucide-react';
import Image from 'next/image';
import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { shouldUseUnoptimizedImage } from '@/lib/video-card-utils';
import type { MobileAction } from '@/hooks/useMobileActions';

interface MobileActionSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onExited: () => void;
  title: string;
  actions: MobileAction[];
  poster?: string;
  sources?: string[]; // 播放源信息
  isAggregate?: boolean; // 是否为聚合内容
  sourceName?: string; // 播放源名称
  currentEpisode?: number; // 当前集数
  totalEpisodes?: number; // 总集数
  origin?: 'vod' | 'live';
}

const EXIT_ANIMATION_DURATION_MS = 200;
const FOCUSABLE_ELEMENT_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(FOCUSABLE_ELEMENT_SELECTOR),
  );
}

const MobileActionSheet: React.FC<MobileActionSheetProps> = ({
  isOpen,
  onClose,
  onExited,
  title,
  actions,
  poster,
  sources,
  isAggregate,
  sourceName,
  currentEpisode,
  totalEpisodes,
  origin = 'vod',
}) => {
  const [isAnimating, setIsAnimating] = useState(false);
  const actionTriggeredRef = useRef(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const closeRequestedRef = useRef(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const scrollRestoreAnimationRef = useRef<number | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  const restoreFocus = useCallback(() => {
    const opener = openerRef.current;
    openerRef.current = null;
    if (opener?.isConnected) {
      opener.focus();
    }
  }, []);

  const requestClose = useCallback(() => {
    if (!isOpen || closeRequestedRef.current) return;

    closeRequestedRef.current = true;
    onClose();
  }, [isOpen, onClose]);

  const runAction = useCallback(
    (action: MobileAction) => {
      if (!isOpen || action.disabled || actionTriggeredRef.current) return;

      actionTriggeredRef.current = true;
      try {
        action.onClick();
      } finally {
        requestClose();
      }
    },
    [isOpen, requestClose],
  );

  // 控制动画状态
  useEffect(() => {
    let animationId: number | null = null;
    let exitTimer: ReturnType<typeof setTimeout> | null = null;

    if (isOpen) {
      actionTriggeredRef.current = false;
      closeRequestedRef.current = false;
      const activeElement = document.activeElement;
      if (
        !openerRef.current &&
        activeElement instanceof HTMLElement &&
        !dialogRef.current?.contains(activeElement)
      ) {
        openerRef.current = activeElement;
      }

      // 使用双重 requestAnimationFrame 确保DOM完全渲染
      animationId = requestAnimationFrame(() => {
        animationId = requestAnimationFrame(() => {
          setIsAnimating(true);
          const firstAction =
            dialogRef.current?.querySelector<HTMLButtonElement>(
              '[data-action-sheet-action]:not([disabled])',
            );
          (firstAction || closeButtonRef.current || dialogRef.current)?.focus();
        });
      });
    } else {
      dialogRef.current?.focus();
      setIsAnimating(false);
      exitTimer = setTimeout(() => {
        restoreFocus();
        onExited();
      }, EXIT_ANIMATION_DURATION_MS);
    }

    return () => {
      if (animationId !== null) {
        cancelAnimationFrame(animationId);
      }
      if (exitTimer !== null) {
        clearTimeout(exitTimer);
      }
    };
  }, [isOpen, onExited, restoreFocus]);

  useEffect(() => restoreFocus, [restoreFocus]);

  // 阻止背景滚动
  useEffect(() => {
    if (scrollRestoreAnimationRef.current !== null) {
      cancelAnimationFrame(scrollRestoreAnimationRef.current);
      scrollRestoreAnimationRef.current = null;
    }

    // 保存当前滚动位置
    const scrollY = window.scrollY;
    const scrollX = window.scrollX;
    const body = document.body;
    const html = document.documentElement;

    // 获取滚动条宽度
    const scrollBarWidth = window.innerWidth - html.clientWidth;

    // 保存原始样式
    const originalBodyStyle = {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
      paddingRight: body.style.paddingRight,
      overflow: body.style.overflow,
    };

    // 设置body样式来阻止滚动，但保持原位置
    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.left = `-${scrollX}px`;
    body.style.right = '0';
    body.style.width = '100%';
    body.style.overflow = 'hidden';
    body.style.paddingRight = `${scrollBarWidth}px`;

    return () => {
      // 恢复所有原始样式
      body.style.position = originalBodyStyle.position;
      body.style.top = originalBodyStyle.top;
      body.style.left = originalBodyStyle.left;
      body.style.right = originalBodyStyle.right;
      body.style.width = originalBodyStyle.width;
      body.style.paddingRight = originalBodyStyle.paddingRight;
      body.style.overflow = originalBodyStyle.overflow;

      // 使用 requestAnimationFrame 确保样式恢复后再滚动
      scrollRestoreAnimationRef.current = requestAnimationFrame(() => {
        scrollRestoreAnimationRef.current = null;
        window.scrollTo(scrollX, scrollY);
      });
    };
  }, []);

  // 模态焦点圈定与 ESC 关闭
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        requestClose();
        return;
      }

      if (e.key !== 'Tab' || !dialogRef.current) return;

      const focusableElements = getFocusableElements(dialogRef.current);
      if (focusableElements.length === 0) {
        e.preventDefault();
        dialogRef.current.focus();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      const activeElement = document.activeElement;

      if (!dialogRef.current.contains(activeElement)) {
        e.preventDefault();
        (e.shiftKey ? lastElement : firstElement).focus();
        return;
      }

      if (e.shiftKey && activeElement === firstElement) {
        e.preventDefault();
        lastElement.focus();
      } else if (!e.shiftKey && activeElement === lastElement) {
        e.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, requestClose]);

  const renderContent = () => (
    <div
      className='fixed inset-0 z-[9999] flex items-end justify-center px-4'
      style={{
        paddingLeft: 'calc(1rem + env(safe-area-inset-left, 0px))',
        paddingRight: 'calc(1rem + env(safe-area-inset-right, 0px))',
      }}
    >
      {/* 背景遮罩 */}
      <div
        className={`absolute inset-0 bg-black/50 transition-opacity duration-200 ease-out ${
          isAnimating ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={requestClose}
        onTouchMove={(e) => {
          // 只阻止滚动，允许其他触摸事件（包括点击）
          e.preventDefault();
        }}
        onWheel={(e) => {
          // 阻止滚轮滚动
          e.preventDefault();
        }}
        style={{
          backdropFilter: 'blur(4px)',
          willChange: 'opacity',
          touchAction: 'none', // 禁用所有触摸操作
        }}
      />

      {/* 操作表单 */}
      <div
        ref={dialogRef}
        role='dialog'
        aria-modal='true'
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        className={`relative flex w-full max-w-lg flex-col overflow-hidden mb-4 bg-white dark:bg-gray-900 rounded-2xl shadow-2xl transition-all duration-200 ease-out ${
          isOpen ? '' : 'pointer-events-none'
        }`}
        onTouchMove={(e) => {
          // 允许操作表单内部滚动，阻止事件冒泡到外层
          e.stopPropagation();
        }}
        style={{
          marginBottom: 'calc(1rem + env(safe-area-inset-bottom))',
          maxHeight:
            'calc(100dvh - 2rem - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px))',
          willChange: 'transform, opacity',
          backfaceVisibility: 'hidden', // 避免闪烁
          transform: isAnimating
            ? 'translateY(0) translateZ(0)'
            : 'translateY(100%) translateZ(0)', // 组合变换保持滑入效果和硬件加速
          opacity: isAnimating ? 1 : 0,
          touchAction: 'auto', // 允许操作表单内的正常触摸操作
        }}
      >
        {/* 头部 */}
        <div className='flex flex-shrink-0 items-center justify-between p-4 border-b border-gray-100 dark:border-gray-800'>
          <div className='flex items-center gap-3 flex-1 min-w-0'>
            {poster && (
              <div className='relative w-12 h-16 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800 flex-shrink-0'>
                <Image
                  src={poster}
                  alt={title}
                  fill
                  className={
                    origin === 'live' ? 'object-contain' : 'object-cover'
                  }
                  loading='lazy'
                  sizes='48px'
                  unoptimized={shouldUseUnoptimizedImage(poster)}
                />
              </div>
            )}
            <div className='min-w-0 flex-1'>
              <div className='flex items-center gap-2 mb-1'>
                <h3
                  id={titleId}
                  className='text-lg font-semibold text-gray-900 dark:text-gray-100 truncate'
                >
                  {title}
                </h3>
                {sourceName && (
                  <span className='flex-shrink-0 text-xs px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800'>
                    {origin === 'live' && (
                      <Radio
                        size={12}
                        className='inline-block text-gray-500 dark:text-gray-400 mr-1.5'
                      />
                    )}
                    {sourceName}
                  </span>
                )}
              </div>
              <p
                id={descriptionId}
                className='text-sm text-gray-500 dark:text-gray-400'
              >
                选择操作
              </p>
            </div>
          </div>

          <button
            ref={closeButtonRef}
            type='button'
            aria-label='关闭操作菜单'
            onClick={requestClose}
            disabled={!isOpen}
            className='p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors duration-150'
          >
            <X
              aria-hidden='true'
              size={20}
              className='text-gray-500 dark:text-gray-400'
            />
          </button>
        </div>

        <div
          className='min-h-0 flex-1 overflow-y-auto overscroll-contain'
          style={{ touchAction: 'pan-y' }}
        >
          {/* 操作列表 */}
          <div className='px-4 py-2'>
            {actions.map((action, index) => (
              <div key={action.id}>
                <button
                  type='button'
                  data-action-sheet-action='true'
                  onClick={() => runAction(action)}
                  disabled={action.disabled || !isOpen}
                  className={`
                  w-full flex items-center gap-4 py-4 px-2 transition-all duration-150 ease-out
                  ${
                    action.disabled || !isOpen
                      ? 'opacity-50 cursor-not-allowed'
                      : `${getActionHoverColor(
                          action.color,
                        )} active:scale-[0.98]`
                  }
                `}
                  style={{ willChange: 'transform, background-color' }}
                >
                  {/* 图标 - 使用线条风格 */}
                  <div className='w-6 h-6 flex items-center justify-center flex-shrink-0'>
                    <span
                      className={`transition-colors duration-150 ${
                        action.disabled || !isOpen
                          ? 'text-gray-400 dark:text-gray-600'
                          : getActionColor(action.color)
                      }`}
                    >
                      {action.icon}
                    </span>
                  </div>

                  {/* 文字 */}
                  <span
                    className={`
                  text-left font-medium text-base flex-1
                  ${
                    action.disabled || !isOpen
                      ? 'text-gray-400 dark:text-gray-600'
                      : 'text-gray-900 dark:text-gray-100'
                  }
                `}
                  >
                    {action.label}
                  </span>

                  {/* 播放进度 - 只在播放按钮且有播放记录时显示 */}
                  {action.id === 'play' && currentEpisode && totalEpisodes && (
                    <span className='text-sm text-gray-500 dark:text-gray-400 font-medium'>
                      {currentEpisode}/{totalEpisodes}
                    </span>
                  )}
                </button>

                {/* 分割线 - 最后一项不显示 */}
                {index < actions.length - 1 && (
                  <div className='border-b border-gray-100 dark:border-gray-800 ml-10'></div>
                )}
              </div>
            ))}
          </div>

          {/* 播放源信息展示区域 */}
          {isAggregate && sources && sources.length > 0 && (
            <div className='px-4 py-3 border-t border-gray-100 dark:border-gray-800'>
              {/* 标题区域 */}
              <div className='mb-3'>
                <h4 className='text-sm font-medium text-gray-900 dark:text-gray-100 mb-1'>
                  可用播放源
                </h4>
                <p className='text-xs text-gray-500 dark:text-gray-400'>
                  共 {sources.length} 个播放源
                </p>
              </div>

              {/* 播放源列表 */}
              <div className='grid grid-cols-2 gap-2'>
                {sources.map((source, index) => (
                  <div
                    key={index}
                    className='flex items-center gap-2 py-2 px-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50/30 dark:bg-gray-800/30'
                  >
                    <div className='w-1 h-1 bg-gray-400 dark:bg-gray-500 rounded-full flex-shrink-0' />
                    <span className='text-xs text-gray-600 dark:text-gray-400 truncate'>
                      {source}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const getActionColor = (color: MobileAction['color']) => {
    switch (color) {
      case 'danger':
        return 'text-red-600 dark:text-red-400';
      case 'primary':
        return 'text-green-600 dark:text-green-400';
      default:
        return 'text-gray-700 dark:text-gray-300';
    }
  };

  const getActionHoverColor = (color: MobileAction['color']) => {
    switch (color) {
      case 'danger':
        return 'hover:bg-red-50/50 dark:hover:bg-red-900/10';
      case 'primary':
        return 'hover:bg-green-50/50 dark:hover:bg-green-900/10';
      default:
        return 'hover:bg-gray-50/50 dark:hover:bg-gray-800/20';
    }
  };

  // 使用Portal将菜单渲染到body外层，避免被虚拟滚动容器的overflow限制
  return typeof window !== 'undefined'
    ? createPortal(renderContent(), document.body)
    : null;
};

export default MobileActionSheet;
