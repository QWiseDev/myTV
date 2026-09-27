import { CheckCircle2, Clock, XCircle } from 'lucide-react';

import type { JarFixResult } from './types';

export interface JarFixPanelProps {
  result: JarFixResult | null;
  loading: boolean;
  onRun: () => void;
}

/**
 * JAR 源修复标签页面板，拆分自 TVBox 配置页原 JSX，文案与结构原样保留。
 */
export function JarFixPanel({
  result: jarFixResult,
  loading: jarFixLoading,
  onRun,
}: JarFixPanelProps) {
  return (
    <div>
      <div className='flex items-center justify-between mb-4'>
        <p className='text-sm text-gray-600 dark:text-gray-400'>
          测试所有 JAR 源并提供修复建议
        </p>
        <button
          onClick={onRun}
          disabled={jarFixLoading}
          className='px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors'
        >
          {jarFixLoading ? '诊断中...' : '开始诊断'}
        </button>
      </div>

      {jarFixResult && (
        <div className='space-y-4'>
          {jarFixResult.error ? (
            <div className='p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg'>
              <p className='text-red-700 dark:text-red-300'>
                {jarFixResult.error}
              </p>
              {jarFixResult.emergency_recommendations && (
                <ul className='mt-3 space-y-1 text-sm'>
                  {jarFixResult.emergency_recommendations.map((rec, idx) => (
                    <li key={idx} className='text-red-600 dark:text-red-400'>
                      • {rec}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <>
              {/* 测试概览 */}
              <div className='grid grid-cols-3 gap-3'>
                <div className='p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-700 text-center'>
                  <div className='text-2xl font-bold text-blue-600 dark:text-blue-400'>
                    {jarFixResult.summary.total_tested}
                  </div>
                  <div className='text-xs text-blue-700 dark:text-blue-300 mt-1'>
                    测试总数
                  </div>
                </div>
                <div className='p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-700 text-center'>
                  <div className='text-2xl font-bold text-green-600 dark:text-green-400'>
                    {jarFixResult.summary.successful}
                  </div>
                  <div className='text-xs text-green-700 dark:text-green-300 mt-1'>
                    成功
                  </div>
                </div>
                <div className='p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-700 text-center'>
                  <div className='text-2xl font-bold text-red-600 dark:text-red-400'>
                    {jarFixResult.summary.failed}
                  </div>
                  <div className='text-xs text-red-700 dark:text-red-300 mt-1'>
                    失败
                  </div>
                </div>
              </div>

              {/* 网络质量评估 */}
              <div
                className={`p-4 rounded-lg border ${
                  jarFixResult.status.network_quality === 'good'
                    ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700'
                    : jarFixResult.status.network_quality === 'fair'
                    ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-700'
                    : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700'
                }`}
              >
                <div className='flex items-center justify-between'>
                  <div>
                    <div className='font-semibold text-gray-900 dark:text-white'>
                      网络质量
                    </div>
                    <div className='text-sm text-gray-600 dark:text-gray-400 mt-1'>
                      平均响应: {Math.round(jarFixResult.summary.avg_response_time)}
                      ms
                    </div>
                  </div>
                  <div
                    className={`text-2xl font-bold ${
                      jarFixResult.status.network_quality === 'good'
                        ? 'text-green-600 dark:text-green-400'
                        : jarFixResult.status.network_quality === 'fair'
                        ? 'text-yellow-600 dark:text-yellow-400'
                        : 'text-red-600 dark:text-red-400'
                    }`}
                  >
                    {jarFixResult.status.network_quality === 'good'
                      ? '优秀'
                      : jarFixResult.status.network_quality === 'fair'
                      ? '良好'
                      : '较差'}
                  </div>
                </div>
              </div>

              {/* 推荐源 */}
              {jarFixResult.recommended_sources.length > 0 && (
                <div className='p-4 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-lg border border-green-200 dark:border-green-700'>
                  <h3 className='font-semibold text-green-900 dark:text-green-300 mb-3'>
                    ✅ 推荐源 (Top 3)
                  </h3>
                  <div className='space-y-2'>
                    {jarFixResult.recommended_sources.map((source, idx) => (
                      <div
                        key={idx}
                        className='p-3 bg-white dark:bg-gray-800 rounded border border-green-200 dark:border-green-700'
                      >
                        <div className='flex items-center justify-between mb-1'>
                          <div className='font-medium text-green-700 dark:text-green-300'>
                            #{idx + 1} {source.name}
                          </div>
                          <div className='text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2'>
                            <Clock className='w-3 h-3' />
                            {source.responseTime}ms
                          </div>
                        </div>
                        <div className='text-xs font-mono text-gray-600 dark:text-gray-400 break-all'>
                          {source.url}
                        </div>
                        {source.size && (
                          <div className='text-xs text-gray-500 dark:text-gray-400 mt-1'>
                            大小: {Math.round(source.size / 1024)}KB
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 详细测试结果 */}
              <div className='p-4 bg-gray-50 dark:bg-gray-700 rounded-lg'>
                <h3 className='font-semibold text-gray-900 dark:text-white mb-3'>
                  详细测试结果
                </h3>
                <div className='space-y-2 max-h-64 overflow-y-auto'>
                  {jarFixResult.test_results.map((test, idx) => (
                    <div
                      key={idx}
                      className={`p-2 rounded border ${
                        test.success
                          ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700'
                          : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700'
                      }`}
                    >
                      <div className='flex items-center justify-between'>
                        <div className='flex items-center gap-2 flex-1'>
                          {test.success ? (
                            <CheckCircle2 className='w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0' />
                          ) : (
                            <XCircle className='w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0' />
                          )}
                          <div className='flex-1 min-w-0'>
                            <div className='text-sm font-medium text-gray-900 dark:text-white'>
                              {test.name}
                            </div>
                            <div className='text-xs font-mono text-gray-600 dark:text-gray-400 truncate'>
                              {test.url}
                            </div>
                            {test.error && (
                              <div className='text-xs text-red-600 dark:text-red-400 mt-1'>
                                {test.error}
                              </div>
                            )}
                          </div>
                        </div>
                        {test.success && (
                          <div className='text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2'>
                            <Clock className='w-3 h-3' />
                            {test.responseTime}ms
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 三层建议系统 */}
              <div className='space-y-3'>
                {/* 立即建议 */}
                {jarFixResult.recommendations.immediate.length > 0 && (
                  <div className='p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-700'>
                    <h3 className='font-semibold text-blue-900 dark:text-blue-300 mb-2'>
                      🎯 立即建议
                    </h3>
                    <ul className='space-y-1'>
                      {jarFixResult.recommendations.immediate.map(
                        (rec, idx) => (
                          <li
                            key={idx}
                            className='text-sm text-blue-700 dark:text-blue-300 flex items-start gap-2'
                          >
                            <span className='flex-shrink-0 mt-1'>•</span>
                            <span>{rec}</span>
                          </li>
                        ),
                      )}
                    </ul>
                  </div>
                )}

                {/* 配置建议 */}
                {jarFixResult.recommendations.configuration.length > 0 && (
                  <div className='p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-700'>
                    <h3 className='font-semibold text-purple-900 dark:text-purple-300 mb-2'>
                      ⚙️ 配置建议
                    </h3>
                    <ul className='space-y-1'>
                      {jarFixResult.recommendations.configuration.map(
                        (rec, idx) => (
                          <li
                            key={idx}
                            className='text-sm text-purple-700 dark:text-purple-300 flex items-start gap-2'
                          >
                            <span className='flex-shrink-0 mt-1'>•</span>
                            <span>{rec}</span>
                          </li>
                        ),
                      )}
                    </ul>
                  </div>
                )}

                {/* 故障排查 */}
                {jarFixResult.recommendations.troubleshooting.length > 0 && (
                  <div className='p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-700'>
                    <h3 className='font-semibold text-yellow-900 dark:text-yellow-300 mb-2'>
                      🔧 故障排查
                    </h3>
                    <ul className='space-y-1'>
                      {jarFixResult.recommendations.troubleshooting.map(
                        (rec, idx) => (
                          <li
                            key={idx}
                            className='text-sm text-yellow-700 dark:text-yellow-300 flex items-start gap-2'
                          >
                            <span className='flex-shrink-0 mt-1'>•</span>
                            <span>{rec}</span>
                          </li>
                        ),
                      )}
                    </ul>
                  </div>
                )}
              </div>

              {/* 修复后的配置URL */}
              {jarFixResult.fixed_config_urls.length > 0 && (
                <div className='p-4 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-lg border border-green-200 dark:border-green-700'>
                  <h3 className='font-semibold text-green-900 dark:text-green-300 mb-2'>
                    🔗 优化配置链接
                  </h3>
                  <div className='space-y-2'>
                    {jarFixResult.fixed_config_urls.map((url, idx) => (
                      <div
                        key={idx}
                        className='p-2 bg-white dark:bg-gray-800 rounded border border-green-200 dark:border-green-700'
                      >
                        <div className='text-xs font-mono text-gray-600 dark:text-gray-400 break-all'>
                          {url}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {!jarFixResult && !jarFixLoading && (
        <p className='text-sm text-gray-500 dark:text-gray-400 text-center py-4'>
          点击"开始诊断"测试所有 JAR 源并获取修复建议
        </p>
      )}
    </div>
  );
}
