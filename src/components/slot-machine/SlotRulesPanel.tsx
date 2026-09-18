'use client';

/**
 * 游戏规则面板（含开发环境调试信息）
 */

import { Gift } from 'lucide-react';

import type { getDebugInfo } from '@/lib/slot-config';
import { formatCoins } from '@/lib/slot-machine-utils';

type DebugInfo = ReturnType<typeof getDebugInfo>;

interface SlotRulesPanelProps {
  coins: number;
  debugInfo: DebugInfo;
  onTestGeneration: () => void;
}

export function SlotRulesPanel({
  coins,
  debugInfo,
  onTestGeneration,
}: SlotRulesPanelProps) {
  return (
    <div className="bg-white/10 backdrop-blur-sm rounded-lg p-3">
      <h3 className="text-white font-bold mb-3 flex items-center gap-2 text-sm">
        <Gift className="w-4 h-4" />
        游戏规则 (4转轴)
      </h3>
      <div className="space-y-1 text-xs text-gray-300 max-h-48 overflow-y-auto">
        <div className="space-y-1">
          <p className="font-bold text-purple-400">🎯 超级大奖 (128x):</p>
          <div className="ml-2 space-y-1">
            <div>• 姬霓太美 (j→n→t→m): 精确顺序</div>
            <div>• 篮球大使 (bj→zft→bdk→lq): 精确顺序</div>
          </div>
        </div>

        <div className="space-y-1">
          <p className="font-bold text-pink-400">🎊 大奖 (16x):</p>
          <div className="ml-2 space-y-1">
            <div>• 鸡你不太美 (j,n,t,m): 包含即可</div>
            <div>• 厉不厉害你坤哥 (bj,zft,bdk,lq): 包含即可</div>
          </div>
        </div>

        <div className="space-y-1">
          <p className="font-bold text-yellow-400">🏆 特殊奖励:</p>
          <div className="ml-2 space-y-1">
            <div>• 4坤 (4个美): 50x <span className="text-red-400">[独立奖励]</span></div>
            <div>• 4🐔 (任意4个相同): 32x</div>
            <div>• 3坤 (3个美): 18x</div>
            <div>• 普通3🐔 (任意3个相同): 8x</div>
            <div>• 🔄 对称奖励 (ABBA): 10x</div>
            <div>• 2坤 (2个美): 10x <span className="text-green-400">[可组合]</span></div>
            <div>• 普通双🐔 (任意2个相同): 4x</div>
          </div>
        </div>

        <div className="space-y-1">
          <p className="font-bold text-red-600">🎯 侯总特殊奖励:</p>
          <div className="ml-2 space-y-1">
            <div>• 4侯总: 200x <span className="text-purple-400">[视频弹窗 + 奖池翻倍]</span></div>
            <div>• 3侯总: 100x <span className="text-purple-400">[视频弹窗 + 奖池翻倍]</span></div>
            <div>• 2侯总: 50x <span className="text-purple-400">[视频弹窗 + 奖池翻倍]</span></div>
            <div>• 抽到2个以上侯总自动播放视频，奖池翻倍，奖励翻倍</div>
          </div>
        </div>

        <div className="space-y-1">
          <p className="font-bold text-red-400">⚖️ 惩罚机制:</p>
          <div className="ml-2 space-y-1">
            <div>• 1律师函: 扣除2倍投注 (多扣1倍)</div>
            <div>• 2律师函: 扣除3倍投注 (多扣2倍)</div>
            <div>• 3律师函: 扣除3倍 + 累积大奖减半</div>
            <div>• 4律师函: 扣除4倍 + 累积大奖清空</div>
            <div>• <span className="text-orange-400">基础概率: 2.86% (已提高一倍)</span></div>
            <div>• <span className="text-red-400">动态调整: 金币&gt;1000w时再提高2倍</span></div>
          </div>
        </div>

        <div className="space-y-1">
          <p className="font-bold text-blue-400">📐 奖励规则:</p>
          <div className="ml-2 space-y-1">
            <div>• <span className="text-red-400">独立奖励</span>: 只取最高奖励</div>
            <div>• <span className="text-green-400">可组合奖励</span>: 可与其他奖励累加</div>
            <div>• 普通奖励: 取最高，不累加</div>
          </div>
        </div>

        <div className="space-y-1">
          <p className="font-bold text-green-400">📊 权重配置 (总权重1048 + 动态调整):</p>
          <div className="ml-2 space-y-1">
            <div>• 姬/霓/太/美: 各140权重 (13.36%)</div>
            <div>• 中分头: 80权重 (7.63%)</div>
            <div>• 篮球: 70权重 (6.68%)</div>
            <div>• 中分头(特殊): 100权重 (9.54%)</div>
            <div>• 背带裤: 90权重 (8.59%)</div>
            <div>• 律师函: <span className="text-red-400">30-60权重 (2.86-5.71%) - 动态调整</span></div>
            <div>• 🎴 徐棋: <span className="text-yellow-400">10权重 (0.95%) - 隐藏卡</span></div>
            <div>• 🎯 侯总(4种变体): <span className="text-red-400">10-50权重/种 (总计3.82-19.1%) - 动态调整</span></div>
            <div>• &nbsp;&nbsp;- 侯总当权、开蚌、蝙蝠侠、望远镜</div>
            <div>• <span className="text-purple-400">⚡ 动态规则: 救济模式下侯总概率提高5倍</span></div>
          </div>
        </div>

        <div className="space-y-1">
          <p className="font-bold text-indigo-400">🎴 徐棋隐藏卡:</p>
          <div className="ml-2 space-y-1">
            <div>• 出现概率: 1.00% (极稀有)</div>
            <div>• 奖励机制: 如果有其他奖励，所有奖励×10</div>
            <div>• 如果无其他奖励，至少获得10倍投注</div>
            <div>• 触发时自动获得一半累积大奖池</div>
            <div>• 特殊视觉效果，极具戏剧性</div>
          </div>
        </div>

        <div className="space-y-1">
          <p className="font-bold text-red-500">🎯 侯总特殊卡 (4种变体):</p>
          <div className="ml-2 space-y-1">
            <div>• 基础概率: 总计3.82% (稀有) <span className="text-orange-400">[概率提高5倍]</span></div>
            <div>• 4种变体: 当权、开蚌、蝙蝠侠、望远镜</div>
            <div>• 触发条件: 抽到2个或以上任意侯总变体</div>
            <div>• 特殊效果: 自动播放侯总视频弹窗</div>
            <div>• 奖池翻倍: 累积大奖池直接翻倍</div>
            <div>• 奖励翻倍: 当前奖励金额翻倍</div>
            <div>• 视频时长: 8秒自动播放，可手动关闭</div>
            <div>• 视觉效果: 华丽动画和音效</div>
            <div>• 混合奖励: 不同侯总变体可组合触发奖励</div>
          </div>
        </div>

        <div className="space-y-1">
          <p className="font-bold text-purple-500">⚖️ 动态规则 (当前状态):</p>
          <div className="ml-2 space-y-1">
            <div>• 🎯 侯总概率: {typeof window !== 'undefined' && coins < 1000000 ? <span className="text-green-400">提高5倍 (救济模式)</span> : <span className="text-gray-400">标准概率</span>}</div>
            <div>• ⚖️ 律师函概率: {typeof window !== 'undefined' && coins >= 10000000 ? <span className="text-red-400">提高2倍 (平衡模式)</span> : <span className="text-gray-400">标准概率</span>}</div>
            <div>• 💎 当前金币: {formatCoins(coins)}</div>
            <div>• 📈 规则说明: 金币&lt;100w时侯总强力助力，金币&gt;1000w时律师函平衡</div>
          </div>
        </div>

        {/* 调试面板 - 仅开发环境显示 */}
        {typeof window !== 'undefined' &&
          (process.env.NODE_ENV === 'development' ||
            window.location.hostname === 'localhost') && (
            <div className="space-y-1">
              <p className="font-bold text-yellow-400">🔧 调试信息:</p>
              <div className="ml-2 space-y-1 bg-gray-800/50 p-2 rounded text-xs">
                <div>• 环境: {process.env.NODE_ENV || 'unknown'}</div>
                <div>
                  • 模式: {debugInfo.isReliefMode ? '救济模式' : '标准模式'}
                </div>
                <div>• 当前金币: {formatCoins(debugInfo.coins)}</div>
                <div>• 侯总总权重: {debugInfo.hzTotalWeight}</div>
                <div>• 总权重: {debugInfo.totalWeight}</div>
                <div>• 侯总概率: {debugInfo.hzPercentage}%</div>
                <div>
                  • 侯总变体:{' '}
                  {debugInfo.hzWeights
                    .map((w) => `${w.variant}(${w.weight})`)
                    .join(', ')}
                </div>
                <div>• 律师函权重: {debugInfo.lawyerWeight}</div>
                <div className="mt-2 pt-2 border-t border-gray-600">
                  <button
                    onClick={onTestGeneration}
                    className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1 rounded text-xs transition-colors"
                  >
                    🧪 测试100次生成
                  </button>
                  <span className="text-gray-400 ml-2">检查侯总实际出现率</span>
                </div>
              </div>
            </div>
          )}

        <div className="space-y-1">
          <p className="font-bold text-orange-400">💰 累积大奖:</p>
          <div className="ml-2 space-y-1">
            <div>• 每次下注的50%进入累积奖池</div>
            <div>• 中超级大奖(≥50x)可赢取一半累积奖池</div>
            <div>• 累积奖池保留一半，继续累积</div>
            <div>• 3-4张律师函会减少累积奖池</div>
          </div>
        </div>
      </div>
    </div>
  );
}
