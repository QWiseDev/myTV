import React, { useCallback, useEffect, useRef, useState } from 'react';

interface CapsuleSwitchProps {
  options: ReadonlyArray<{ label: string; value: string }>;
  active: string;
  onChange: (value: string) => void;
  className?: string;
}

const CapsuleSwitch: React.FC<CapsuleSwitchProps> = ({
  options,
  active,
  onChange,
  className,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [indicatorStyle, setIndicatorStyle] = useState<{
    left: number;
    width: number;
  }>({ left: 0, width: 0 });

  const activeIndex = options.findIndex((opt) => opt.value === active);

  // 更新指示器位置
  const updateIndicatorPosition = useCallback(() => {
    if (
      activeIndex >= 0 &&
      buttonRefs.current[activeIndex] &&
      containerRef.current
    ) {
      const button = buttonRefs.current[activeIndex];
      const container = containerRef.current;
      if (button && container) {
        const buttonRect = button.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();

        if (buttonRect.width > 0) {
          setIndicatorStyle({
            left: buttonRect.left - containerRect.left,
            width: buttonRect.width,
          });
        }
      }
    }
  }, [activeIndex]);

  // 组件挂载时立即计算初始位置
  useEffect(() => {
    const timeoutId = setTimeout(updateIndicatorPosition, 0);
    return () => clearTimeout(timeoutId);
  }, [updateIndicatorPosition]);

  // 监听选中项变化
  return (
    <div
      ref={containerRef}
      className={`relative inline-flex rounded-md border border-[#e8e6dc] bg-[#f0eee6]/80 p-1 shadow-none dark:border-[#3d3934] dark:bg-[#302d29]/80 ${
        className || ''
      }`}
    >
      {/* 滑动的暖色指示器 */}
      {indicatorStyle.width > 0 && (
        <div
          className='absolute top-1 bottom-1 rounded bg-[#141413] shadow-sm transition-all duration-300 ease-out dark:bg-[#f8f6f0]'
          style={{
            left: `${indicatorStyle.left}px`,
            width: `${indicatorStyle.width}px`,
          }}
        />
      )}

      {options.map((opt, index) => {
        const isActive = active === opt.value;
        return (
          <button
            key={opt.value}
            ref={(el) => {
              buttonRefs.current[index] = el;
            }}
            onClick={() => onChange(opt.value)}
            className={`relative z-10 w-16 rounded px-3 py-1 text-xs sm:w-20 sm:py-2 sm:text-sm font-semibold transition-all duration-200 cursor-pointer ${
              isActive
                ? 'text-[#faf9f5] dark:text-[#141413]'
                : 'text-[#5e5d59] hover:text-[#141413] dark:text-[#b7b1a8] dark:hover:text-[#f8f6f0]'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
};

export default CapsuleSwitch;
