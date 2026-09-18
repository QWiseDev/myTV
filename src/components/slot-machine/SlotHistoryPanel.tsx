'use client';

/* eslint-disable @next/next/no-img-element */

/**
 * 最近旋转记录面板
 */

import { Star } from 'lucide-react';

import type { SpinHistoryItem } from '@/lib/slot-machine-utils';
import { formatCoins, getSymbolById } from '@/lib/slot-machine-utils';

interface SlotHistoryPanelProps {
  history: SpinHistoryItem[];
}

export function SlotHistoryPanel({ history }: SlotHistoryPanelProps) {
  return (
    <div className="bg-white/10 backdrop-blur-sm rounded-lg p-3">
      <h3 className="text-white font-bold mb-3 flex items-center gap-2 text-sm">
        <Star className="w-4 h-4" />
        最近记录 (最近10次)
      </h3>
      <div className="space-y-1 max-h-40 overflow-y-auto pr-2">
        {history.map((record, index) => (
          <div
            key={index}
            className="flex items-center justify-between text-xs bg-white/5 rounded p-2 hover:bg-white/10 transition-colors"
          >
            <div className="flex gap-1">
              {record.symbols.slice(0, 4).map((symbolId, i) => {
                const symbol = getSymbolById(symbolId);
                return symbol ? (
                  <img
                    key={i}
                    src={symbol.image}
                    alt={symbol.name}
                    className="w-5 h-5 object-contain"
                  />
                ) : null;
              })}
              {record.symbols.length > 4 && (
                <span className="text-gray-400 text-xs">...</span>
              )}
            </div>
            <span
              className={`font-bold ${
                record.win > 0
                  ? 'text-green-400'
                  : record.win < 0
                  ? 'text-red-400'
                  : 'text-gray-400'
              }`}
            >
              {record.win > 0
                ? `+${formatCoins(record.win)}`
                : record.win < 0
                ? `-${formatCoins(Math.abs(record.win))}`
                : '未中奖'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
