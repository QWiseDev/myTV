'use client';

import React from 'react';

interface AnimatedCardGridProps {
  children: React.ReactNode;
  className?: string;
  /** 仅对前 N 张做入场动画，降低长列表主线程压力 */
  maxAnimatedItems?: number;
}

export default function AnimatedCardGrid({
  children,
  className = '',
  maxAnimatedItems = 8,
}: AnimatedCardGridProps) {
  const childArray = React.Children.toArray(children);

  return (
    <div className={className}>
      {childArray.map((child, index) => {
        const key = React.isValidElement(child) ? child.key : null;
        const shouldAnimate = index < maxAnimatedItems;

        return (
          <div
            key={key ?? index}
            className={`flex-shrink-0 ${
              shouldAnimate
                ? 'motion-safe:animate-[card-enter_0.32s_cubic-bezier(0.22,1,0.36,1)_both]'
                : ''
            }`}
            style={
              shouldAnimate
                ? { animationDelay: `${(index + 1) * 40}ms` }
                : undefined
            }
          >
            {child}
          </div>
        );
      })}
    </div>
  );
}
