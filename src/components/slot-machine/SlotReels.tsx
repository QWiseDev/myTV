'use client';

/* eslint-disable @next/next/no-img-element */

/**
 * 老虎机 4 转轴渲染
 */

import type { SlotSymbol } from '@/lib/slot-machine-utils';
import { getSymbolById } from '@/lib/slot-machine-utils';

interface SlotReelsProps {
  reels: SlotSymbol[];
  spinning: boolean[];
  scrollOffsets: number[];
  randomSymbolSequences: string[][];
}

export function SlotReels({
  reels,
  spinning,
  scrollOffsets,
  randomSymbolSequences,
}: SlotReelsProps) {
  return (
    <div className="flex justify-center gap-2 mb-4">
      {reels.map((symbol, index) => (
        <div
          key={index}
          className="slot-reel-container relative w-20 h-20 border-4 border-yellow-500 rounded-lg overflow-hidden bg-gradient-to-b from-blue-900 to-purple-900 shadow-2xl"
          style={{
            boxShadow:
              'rgba(251, 191, 36, 0.6) 0px 0px 20px, rgba(0, 0, 0, 0.5) 0px 0px 20px inset',
          }}
        >
          <div
            className="slot-reel relative h-full w-full overflow-hidden"
            style={{
              transform: 'translateZ(0)',
              backfaceVisibility: 'hidden',
              perspective: '1000px',
            }}
          >
            <div
              className="slot-symbols relative w-full flex flex-col"
              style={{
                willChange: 'transform',
                transform: spinning[index]
                  ? `translateZ(0) translateY(${-scrollOffsets[index]}px)`
                  : `translateZ(0) translateY(0)`,
                backfaceVisibility: 'hidden',
                transition: spinning[index]
                  ? 'none'
                  : 'transform 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
              }}
            >
              {/* 老虎机滚动效果 - 使用预生成的随机序列 */}
              {spinning[index] ? (
                // 旋转时显示预生成的随机符号序列
                randomSymbolSequences[index].map((symbolId, i) => {
                  const sequenceSymbol = getSymbolById(symbolId);
                  return (
                    <div
                      key={i}
                      className="slot-symbol w-full h-20 flex items-center justify-center p-2 flex-shrink-0"
                      style={{
                        contain: 'layout style paint',
                      }}
                    >
                      <img
                        src={sequenceSymbol.image}
                        alt={sequenceSymbol.name}
                        className="max-w-full max-h-full object-contain"
                        style={{
                          filter: 'drop-shadow(rgba(0, 0, 0, 0.4) 0px 4px 8px)',
                          imageRendering: 'crisp-edges',
                          transform: 'translateZ(0)',
                          willChange: 'transform',
                        }}
                        loading="eager"
                      />
                    </div>
                  );
                })
              ) : (
                // 停止时只显示当前符号
                <div className="slot-symbol w-full h-20 flex items-center justify-center p-2 flex-shrink-0">
                  <img
                    src={symbol.image}
                    alt={symbol.name}
                    className="max-w-full max-h-full object-contain"
                    style={{
                      filter: 'drop-shadow(rgba(0, 0, 0, 0.4) 0px 4px 8px)',
                      imageRendering: 'crisp-edges',
                      transform: 'translateZ(0)',
                    }}
                  />
                </div>
              )}
            </div>
          </div>

          {/* 旋转时的边框动画 */}
          {spinning[index] && (
            <div
              className="absolute inset-0 border-4 border-yellow-400 rounded-lg pointer-events-none animate-pulse"
              style={{
                boxShadow: 'rgba(251, 191, 36, 0.8) 0px 0px 20px inset',
              }}
            />
          )}
        </div>
      ))}
    </div>
  );
}
