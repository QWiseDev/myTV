import type { MouseEvent, TouchEvent, WheelEvent } from 'react';

const PANEL_BACKDROP_STYLE = {
  touchAction: 'none',
} as const;

export const SCROLLABLE_PANEL_STYLE = {
  touchAction: 'pan-y',
  overscrollBehavior: 'contain',
} as const;

export const CHANGE_PASSWORD_PANEL_CONTENT_STYLE = {
  touchAction: 'auto',
} as const;

function preventPanelBackdropScroll(
  event: TouchEvent<HTMLDivElement> | WheelEvent<HTMLDivElement>,
) {
  event.preventDefault();
}

export function stopPanelClickPropagation(event: MouseEvent<HTMLDivElement>) {
  event.stopPropagation();
}

export function stopPanelTouchPropagation(event: TouchEvent<HTMLDivElement>) {
  event.stopPropagation();
}

export function UserMenuPanelBackdrop({ onClick }: { onClick: () => void }) {
  return (
    <div
      className='fixed inset-0 bg-black/50 backdrop-blur-sm z-[1000]'
      onClick={onClick}
      onTouchMove={preventPanelBackdropScroll}
      onWheel={preventPanelBackdropScroll}
      style={PANEL_BACKDROP_STYLE}
    />
  );
}
