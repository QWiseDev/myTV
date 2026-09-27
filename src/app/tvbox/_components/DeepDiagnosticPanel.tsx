import { CheckCircle2, XCircle } from 'lucide-react';

import type { DeepDiagnosticResult } from './types';

// 深度诊断 JAR 测试状态对应的容器配色、徽标配色与文案
function getJarTestStatusStyle(status: string): {
  containerClass: string;
  badgeClass: string;
  label: string;
} {
  if (status === 'success') {
    return {
      containerClass:
        'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700',
      badgeClass:
        'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
      label: '✅ 可用',
    };
  }
  if (status === 'timeout') {
    return {
      containerClass:
        'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-700',
      badgeClass:
        'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300',
      label: '⏱️ 超时',
    };
  }
  return {
    containerClass:
      'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700',
    badgeClass: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
    label: status === 'invalid' ? '⚠️ 无效' : '❌ 失败',
  };
}

export interface DeepDiagnosticPanelProps {
  result: DeepDiagnosticResult | null;
  loading: boolean;
  onRun: () => void;
}

/**
 * 深度诊断标签页面板，拆分自 TVBox 配置页原 JSX，文案与结构原样保留。
 */
export function DeepDiagnosticPanel({
  result: deepDiagnosticResult,
  loading: deepDiagnosticLoading,
  onRun,
}: DeepDiagnosticPanelProps) {
  return (
    <div>
      <div className='flex items-center justify-between mb-4'>
        <p className='text-sm text-gray-600 dark:text-gray-400'>
          深度测试 JAR 文件源的可用性和性能，包含文件头验证和 MD5 校验
        </p>
        <button
          onClick={onRun}
          disabled={deepDiagnosticLoading}
          className='px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors'
        >
          {deepDiagnosticLoading ? '诊断中...' : '开始诊断'}
        </button>
      </div>

      {deepDiagnosticResult && (
        <div className='space-y-4'>
          {deepDiagnosticResult.error ? (
            <div className='p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg'>
              <p className='text-red-700 dark:text-red-300'>
                {deepDiagnosticResult.error}
              </p>
            </div>
          ) : (
            <>
              {/* 环境信息 */}
              <div className='grid grid-cols-3 gap-3'>
                <div className='p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-700'>
                  <div className='text-xs text-blue-600 dark:text-blue-400 mb-1'>
                    网络环境
                  </div>
                  <div className='text-sm font-medium text-gray-900 dark:text-white'>
                    {deepDiagnosticResult.environment.isDomestic
                      ? '🇨🇳 国内'
                      : '🌐 国际'}
                  </div>
                </div>
                <div className='p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-700'>
                  <div className='text-xs text-green-600 dark:text-green-400 mb-1'>
                    时区
                  </div>
                  <div className='text-sm font-medium text-gray-900 dark:text-white'>
                    {deepDiagnosticResult.environment.timezone}
                  </div>
                </div>
                <div className='p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-700'>
                  <div className='text-xs text-purple-600 dark:text-purple-400 mb-1'>
                    测试时间
                  </div>
                  <div className='text-sm font-medium text-gray-900 dark:text-white'>
                    {new Date(
                      deepDiagnosticResult.timestamp,
                    ).toLocaleTimeString('zh-CN')}
                  </div>
                </div>
              </div>

              {/* 测试统计 */}
              <div className='grid grid-cols-4 gap-3'>
                <div className='p-3 bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 rounded-lg text-center'>
                  <div className='text-2xl font-bold text-blue-600 dark:text-blue-400'>
                    {deepDiagnosticResult.summary.totalTested}
                  </div>
                  <div className='text-xs text-blue-700 dark:text-blue-300 mt-1'>
                    总测试源
                  </div>
                </div>
                <div className='p-3 bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20 rounded-lg text-center'>
                  <div className='text-2xl font-bold text-green-600 dark:text-green-400'>
                    {deepDiagnosticResult.summary.successCount}
                  </div>
                  <div className='text-xs text-green-700 dark:text-green-300 mt-1'>
                    可用源
                  </div>
                </div>
                <div className='p-3 bg-gradient-to-br from-red-50 to-red-100 dark:from-red-900/20 dark:to-red-800/20 rounded-lg text-center'>
                  <div className='text-2xl font-bold text-red-600 dark:text-red-400'>
                    {deepDiagnosticResult.summary.failedCount}
                  </div>
                  <div className='text-xs text-red-700 dark:text-red-300 mt-1'>
                    失败源
                  </div>
                </div>
                <div className='p-3 bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-800/20 rounded-lg text-center'>
                  <div className='text-2xl font-bold text-purple-600 dark:text-purple-400'>
                    {Math.round(
                      deepDiagnosticResult.summary.averageResponseTime,
                    )}
                    ms
                  </div>
                  <div className='text-xs text-purple-700 dark:text-purple-300 mt-1'>
                    平均响应
                  </div>
                </div>
              </div>

              {/* 诊断建议 */}
              <div className='p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-700'>
                <h3 className='font-semibold text-yellow-900 dark:text-yellow-300 mb-2'>
                  💡 诊断建议
                </h3>
                <ul className='space-y-1'>
                  {deepDiagnosticResult.recommendations.map(
                    (rec: string, idx: number) => (
                      <li
                        key={idx}
                        className='text-sm text-yellow-700 dark:text-yellow-300'
                      >
                        {rec}
                      </li>
                    ),
                  )}
                </ul>
              </div>

              {/* 详细测试结果 */}
              <div className='p-4 bg-gray-50 dark:bg-gray-700 rounded-lg'>
                <h3 className='font-semibold text-gray-900 dark:text-white mb-3'>
                  详细测试结果
                </h3>
                <div className='space-y-2 max-h-96 overflow-y-auto'>
                  {deepDiagnosticResult.jarTests.map(
                    (test, idx: number) => {
                      const statusStyle = getJarTestStatusStyle(test.status);
                      return (
                        <div
                          key={idx}
                          className={`p-3 rounded border ${statusStyle.containerClass}`}
                        >
                          <div className='flex items-center justify-between mb-2'>
                            <div className='flex items-center gap-2'>
                              {test.status === 'success' ? (
                                <CheckCircle2 className='w-4 h-4 text-green-600 dark:text-green-400' />
                              ) : (
                                <XCircle className='w-4 h-4 text-red-600 dark:text-red-400' />
                              )}
                              <span className='text-sm font-medium text-gray-900 dark:text-white'>
                                {test.name}
                              </span>
                            </div>
                            <span
                              className={`text-xs px-2 py-1 rounded ${statusStyle.badgeClass}`}
                            >
                              {statusStyle.label}
                            </span>
                          </div>

                          <div className='text-xs font-mono text-gray-600 dark:text-gray-400 mb-2 break-all'>
                            {test.url}
                          </div>

                          <div className='grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs'>
                            <div>
                              <span className='text-gray-500 dark:text-gray-400'>
                                响应:
                              </span>
                              <span className='ml-1 font-medium text-gray-900 dark:text-white'>
                                {test.responseTime}ms
                              </span>
                            </div>
                            {test.httpStatus && (
                              <div>
                                <span className='text-gray-500 dark:text-gray-400'>
                                  状态:
                                </span>
                                <span className='ml-1 font-medium text-gray-900 dark:text-white'>
                                  {test.httpStatus}
                                </span>
                              </div>
                            )}
                            {test.fileSize && (
                              <div>
                                <span className='text-gray-500 dark:text-gray-400'>
                                  大小:
                                </span>
                                <span className='ml-1 font-medium text-gray-900 dark:text-white'>
                                  {Math.round(test.fileSize / 1024)}KB
                                </span>
                              </div>
                            )}
                            {test.isValidJar !== undefined && (
                              <div>
                                <span className='text-gray-500 dark:text-gray-400'>
                                  验证:
                                </span>
                                <span
                                  className={`ml-1 font-medium ${
                                    test.isValidJar
                                      ? 'text-green-600 dark:text-green-400'
                                      : 'text-red-600 dark:text-red-400'
                                  }`}
                                >
                                  {test.isValidJar ? '✓ 有效JAR' : '✗ 无效'}
                                </span>
                              </div>
                            )}
                            {test.md5 && (
                              <div className='col-span-2'>
                                <span className='text-gray-500 dark:text-gray-400'>
                                  MD5:
                                </span>
                                <span className='ml-1 font-mono text-gray-900 dark:text-white'>
                                  {test.md5}
                                </span>
                              </div>
                            )}
                          </div>

                          {test.error && (
                            <div className='mt-2 p-2 bg-red-100 dark:bg-red-900/30 rounded text-xs text-red-700 dark:text-red-300'>
                              <strong>错误:</strong> {test.error}
                            </div>
                          )}
                        </div>
                      );
                    },
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {!deepDiagnosticResult && !deepDiagnosticLoading && (
        <p className='text-sm text-gray-500 dark:text-gray-400 text-center py-4'>
          点击"开始诊断"进行深度 JAR 源测试（包含文件头验证和 MD5
          校验）
        </p>
      )}
    </div>
  );
}
