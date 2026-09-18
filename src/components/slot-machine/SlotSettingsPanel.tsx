'use client';

/**
 * 游戏设置面板：音效、背景音乐、自动播放、惩罚状态
 */

import { Cog, Music, Play, Volume2, VolumeX } from 'lucide-react';

import type { PenaltyStatus } from '@/lib/slot-machine-utils';
import { BG_MUSIC_NAMES } from '@/lib/slot-machine-utils';

interface SlotSettingsPanelProps {
  soundEnabled: boolean;
  onToggleSound: () => void;
  bgMusicEnabled: boolean;
  onToggleMusic: () => void;
  currentBgMusicIndex: number;
  autoPlay: boolean;
  onToggleAutoPlay: () => void;
  penaltyStatus: PenaltyStatus;
  coins: number;
  bet: number;
}

export function SlotSettingsPanel({
  soundEnabled,
  onToggleSound,
  bgMusicEnabled,
  onToggleMusic,
  currentBgMusicIndex,
  autoPlay,
  onToggleAutoPlay,
  penaltyStatus,
  coins,
  bet,
}: SlotSettingsPanelProps) {
  return (
    <div className="bg-white/10 backdrop-blur-sm rounded-lg p-3 mb-4">
      <h3 className="text-white font-bold mb-3 flex items-center gap-2 text-sm">
        <Cog className="w-4 h-4" />
        游戏设置
      </h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <button
          onClick={onToggleSound}
          className="bg-white/20 hover:bg-white/30 text-white py-2 px-3 rounded-lg transition-all transform hover:scale-105 flex items-center justify-center gap-1"
        >
          {soundEnabled ? (
            <Volume2 className="w-4 h-4" />
          ) : (
            <VolumeX className="w-4 h-4" />
          )}
          <span className="text-xs">音效</span>
        </button>
        <button
          onClick={onToggleMusic}
          className={`py-2 px-3 rounded-lg transition-all transform hover:scale-105 flex items-center justify-center gap-1 ${
            bgMusicEnabled
              ? 'bg-gradient-to-r from-green-500 to-green-600 text-white shadow-lg'
              : 'bg-white/20 hover:bg-white/30 text-white'
          }`}
          title={
            bgMusicEnabled
              ? `当前播放: ${BG_MUSIC_NAMES[currentBgMusicIndex] || '未知'}`
              : '背景音乐已关闭 - 点击开启以享受游戏音乐'
          }
        >
          <div className={`relative ${bgMusicEnabled ? 'text-white' : 'opacity-50'}`}>
            <Music className="w-4 h-4" />
            {bgMusicEnabled && (
              <div className="absolute -top-1 -right-1 w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
            )}
          </div>
          <span className="text-xs">
            {bgMusicEnabled ? `音乐${currentBgMusicIndex + 1}` : '音乐关'}
          </span>
        </button>
        <button
          onClick={onToggleAutoPlay}
          disabled={coins < bet || penaltyStatus.isActive}
          className={`py-2 px-3 rounded-lg transition-all transform hover:scale-105 flex items-center justify-center gap-1 ${
            autoPlay
              ? 'bg-gradient-to-r from-green-500 to-green-600 text-white shadow-lg'
              : 'bg-white/20 hover:bg-white/30 text-white'
          } ${(coins < bet || penaltyStatus.isActive) ? 'opacity-50 cursor-not-allowed' : ''}`}
          title={
            autoPlay
              ? '自动播放中（每分钟最多30次）'
              : penaltyStatus.isActive
              ? '惩罚激活中，无法自动播放'
              : '开启自动播放'
          }
        >
          <Play className="w-4 h-4" />
          <span className="text-xs">{autoPlay ? '自动中' : '自动'}</span>
        </button>
        <button
          className={`py-2 px-3 rounded-lg transition-all transform hover:scale-105 flex items-center justify-center gap-1 ${
            penaltyStatus.isActive
              ? 'bg-gradient-to-r from-red-500 to-red-600 text-white shadow-lg animate-pulse'
              : 'bg-white/20 hover:bg-white/30 text-white'
          }`}
          title={
            penaltyStatus.isActive
              ? `惩罚激活中！律师函概率${penaltyStatus.multiplier}倍`
              : '无惩罚状态'
          }
        >
          <span className="text-xl">⚠️</span>
          <span className="text-xs text-center">
            {penaltyStatus.isActive ? `惩罚${penaltyStatus.multiplier}x` : '正常'}
          </span>
        </button>
      </div>

      {/* 惩罚状态详情 */}
      {penaltyStatus.isActive && (
        <div className="mt-2 p-2 bg-red-500/20 border border-red-400 rounded-lg text-center">
          <div className="text-xs text-red-200 space-y-1">
            <div className="font-bold text-red-100">⚠️ 惩罚激活中</div>
            <div>律师函概率: {penaltyStatus.multiplier}倍</div>
            <div>
              剩余时间: {Math.ceil(penaltyStatus.remainingTime / 1000 / 60)}分钟
            </div>
            {penaltyStatus.violationCount > 1 && (
              <div className="text-red-300">
                第 {penaltyStatus.violationCount} 次违规
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
