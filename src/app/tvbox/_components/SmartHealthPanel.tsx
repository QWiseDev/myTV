import { CheckCircle2, Clock, Globe, XCircle, Zap } from 'lucide-react';

import type { SmartHealthResult } from './types';

export interface SmartHealthPanelProps {
  result: SmartHealthResult | null;
  loading: boolean;
  onCheck: () => void;
}

/**
 * 智能健康检查标签页面板，拆分自 TVBox 配置页原 JSX，文案与结构原样保留。
 */
export function SmartHealthPanel({
  result: smartHealthResult,
  loading: smartHealthLoading,
  onCheck,
}: SmartHealthPanelProps) {
  return (
    <div>
      <div className='flex items-center justify-between mb-4'>
        <p className='text-sm text-gray-600 dark:text-gray-400'>
          全面检测网络环境、JAR可达性和智能优化建议
        </p>
        <button
          onClick={onCheck}
          disabled={smartHealthLoading}
          className='px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors'
        >
          {smartHealthLoading ? '检查中...' : '开始检查'}
        </button>
      </div>

      {smartHealthResult && (
        <div className='space-y-4'>
          {smartHealthResult.error ? (
            <div className='p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg'>
              <p className='text-red-700 dark:text-red-300'>
                {smartHealthResult.error}
              </p>
            </div>
          ) : (
            <>
              {/* 网络环境卡片 */}
              <div className='p-4 bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20 rounded-lg border border-blue-200 dark:border-blue-700'>
                <div className='flex items-center gap-2 mb-3'>
                  <Globe className='w-5 h-5 text-blue-600 dark:text-blue-400' />
                  <h3 className='font-semibold text-blue-900 dark:text-blue-300'>
                    网络环境
                  </h3>
                </div>
                <div className='grid grid-cols-2 gap-3 text-sm'>
                  <div>
                    <div className='text-blue-600 dark:text-blue-400 text-xs mb-1'>
                      环境类型
                    </div>
                    <div className='text-gray-900 dark:text-gray-100 font-medium'>
                      {smartHealthResult.network.environment === 'domestic'
                        ? '🏠 国内网络'
                        : '🌍 国际网络'}
                    </div>
                  </div>
                  <div>
                    <div className='text-blue-600 dark:text-blue-400 text-xs mb-1'>
                      地区
                    </div>
                    <div className='text-gray-900 dark:text-gray-100 font-medium'>
                      {smartHealthResult.network.region}
                    </div>
                  </div>
                  <div>
                    <div className='text-blue-600 dark:text-blue-400 text-xs mb-1'>
                      检测方式
                    </div>
                    <div className='text-gray-900 dark:text-gray-100 font-mono text-xs'>
                      {smartHealthResult.network.detectionMethod}
                    </div>
                  </div>
                  <div>
                    <div className='text-blue-600 dark:text-blue-400 text-xs mb-1'>
                      优化状态
                    </div>
                    <div className='text-green-600 dark:text-green-400 font-medium'>
                      {smartHealthResult.network.optimized
                        ? '✓ 已优化'
                        : '○ 未优化'}
                    </div>
                  </div>
                </div>
              </div>

              {/* 健康分数卡片 */}
              <div className='p-4 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-lg border border-green-200 dark:border-green-700'>
                <div className='flex items-center justify-between'>
                  <div>
                    <div className='flex items-center gap-2 mb-2'>
                      <Zap className='w-5 h-5 text-green-600 dark:text-green-400' />
                      <h3 className='font-semibold text-green-900 dark:text-green-300'>
                        健康分数
                      </h3>
                    </div>
                    <div className='text-sm text-gray-600 dark:text-gray-400'>
                      {smartHealthResult.reachability.successful}/
                      {smartHealthResult.reachability.total_tested} 源可用
                    </div>
                  </div>
                  <div className='text-center'>
                    <div
                      className={`text-5xl font-bold ${
                        smartHealthResult.reachability.health_score >= 75
                          ? 'text-green-600 dark:text-green-400'
                          : smartHealthResult.reachability.health_score >= 50
                          ? 'text-yellow-600 dark:text-yellow-400'
                          : 'text-red-600 dark:text-red-400'
                      }`}
                    >
                      {smartHealthResult.reachability.health_score}
                    </div>
                    <div className='text-xs text-gray-500 dark:text-gray-400 mt-1'>
                      {smartHealthResult.status.overall === 'excellent'
                        ? '优秀'
                        : smartHealthResult.status.overall === 'good'
                        ? '良好'
                        : '需关注'}
                    </div>
                  </div>
                </div>
              </div>

              {/* JAR可达性测试 */}
              <div className='p-4 bg-gray-50 dark:bg-gray-700 rounded-lg'>
                <h3 className='font-semibold text-gray-900 dark:text-white mb-3'>
                  JAR 源可达性测试
                </h3>
                <div className='space-y-2'>
                  {smartHealthResult.reachability.tests.map((test, idx) => (
                    <div
                      key={idx}
                      className='flex items-center justify-between p-2 bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-600'
                    >
                      <div className='flex items-center gap-2 flex-1'>
                        {test.success ? (
                          <CheckCircle2 className='w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0' />
                        ) : (
                          <XCircle className='w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0' />
                        )}
                        <div className='flex-1 min-w-0'>
                          <div className='text-xs font-mono text-gray-600 dark:text-gray-300 truncate'>
                            {test.url.split('/').slice(-3).join('/')}
                          </div>
                          {test.error && (
                            <div className='text-xs text-red-500 dark:text-red-400'>
                              {test.error}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className='flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400'>
                        {test.success && (
                          <>
                            <div className='flex items-center gap-1'>
                              <Clock className='w-3 h-3' />
                              {test.responseTime}ms
                            </div>
                            {test.size && (
                              <div>{Math.round(test.size / 1024)}KB</div>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 智能建议 */}
              <div className='p-4 bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 rounded-lg border border-purple-200 dark:border-purple-700'>
                <h3 className='font-semibold text-purple-900 dark:text-purple-300 mb-3'>
                  💡 智能建议
                </h3>
                <ul className='space-y-2'>
                  {smartHealthResult.recommendations.map((rec, idx) => (
                    <li
                      key={idx}
                      className='text-sm text-purple-700 dark:text-purple-300 flex items-start gap-2'
                    >
                      <span className='flex-shrink-0 mt-1'>•</span>
                      <span>{rec}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Spider状态概览 */}
              <div className='p-4 bg-gray-50 dark:bg-gray-700 rounded-lg'>
                <h3 className='font-semibold text-gray-900 dark:text-white mb-2'>
                  当前 Spider JAR
                </h3>
                <div className='grid grid-cols-2 gap-2 text-sm'>
                  <div className='text-gray-600 dark:text-gray-400'>来源:</div>
                  <div className='text-gray-900 dark:text-gray-100 font-mono text-xs break-all'>
                    {smartHealthResult.spider.current.source}
                  </div>
                  <div className='text-gray-600 dark:text-gray-400'>状态:</div>
                  <div
                    className={
                      smartHealthResult.spider.current.success
                        ? 'text-green-600 dark:text-green-400 font-medium'
                        : 'text-yellow-600 dark:text-yellow-400 font-medium'
                    }
                  >
                    {smartHealthResult.spider.current.success
                      ? '✓ 成功'
                      : '⚡ 备用'}
                  </div>
                  <div className='text-gray-600 dark:text-gray-400'>大小:</div>
                  <div className='text-gray-900 dark:text-gray-100 font-medium'>
                    {Math.round(smartHealthResult.spider.current.size / 1024)}KB
                  </div>
                  <div className='text-gray-600 dark:text-gray-400'>
                    尝试次数:
                  </div>
                  <div className='text-gray-900 dark:text-gray-100 font-medium'>
                    {smartHealthResult.spider.current.tried_sources}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {!smartHealthResult && !smartHealthLoading && (
        <p className='text-sm text-gray-500 dark:text-gray-400 text-center py-4'>
          点击"开始检查"进行智能健康诊断
        </p>
      )}
    </div>
  );
}
