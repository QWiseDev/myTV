import { Shield } from 'lucide-react';

import type { DiagnosisResult } from './types';

export interface BasicDiagnosticPanelProps {
  result: DiagnosisResult | null;
  loading: boolean;
  jarRefreshMsg: string | null;
  onDiagnose: () => void;
}

/**
 * 基础诊断标签页面板，拆分自 TVBox 配置页原 JSX，文案与结构原样保留。
 */
export function BasicDiagnosticPanel({
  result: diagnosisResult,
  loading: diagnosing,
  jarRefreshMsg,
  onDiagnose,
}: BasicDiagnosticPanelProps) {
  return (
    <div>
      <div className='flex items-center justify-between mb-4'>
        <p className='text-sm text-gray-600 dark:text-gray-400'>
          检查配置基本信息和 Spider JAR 状态
        </p>
        <button
          onClick={onDiagnose}
          disabled={diagnosing}
          className='px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors'
        >
          {diagnosing ? '诊断中...' : '开始诊断'}
        </button>
      </div>

      {/* JAR 刷新消息 */}
      {jarRefreshMsg && (
        <div
          className={`mb-4 p-3 rounded-lg ${
            jarRefreshMsg.startsWith('✓')
              ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300'
              : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
          }`}
        >
          {jarRefreshMsg}
        </div>
      )}

      {diagnosisResult && (
        <div className='space-y-4'>
          {diagnosisResult.error ? (
            <div className='p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg'>
              <p className='text-red-700 dark:text-red-300'>
                {diagnosisResult.error}
              </p>
            </div>
          ) : (
            <>
              {/* 基本信息 */}
              <div className='p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-700'>
                <h3 className='font-semibold text-green-900 dark:text-green-300 mb-3'>
                  ✓ 基本信息
                </h3>
                <div className='grid grid-cols-2 gap-2 text-sm'>
                  <div className='text-gray-600 dark:text-gray-400'>状态码:</div>
                  <div className='text-gray-900 dark:text-gray-100 font-medium'>
                    {diagnosisResult.status || 'N/A'}
                  </div>

                  <div className='text-gray-600 dark:text-gray-400'>
                    Content-Type:
                  </div>
                  <div className='text-gray-900 dark:text-gray-100 font-mono text-xs'>
                    {diagnosisResult.contentType || 'N/A'}
                  </div>

                  <div className='text-gray-600 dark:text-gray-400'>JSON解析:</div>
                  <div
                    className={
                      diagnosisResult.hasJson
                        ? 'text-green-600 dark:text-green-400 font-medium'
                        : 'text-red-600 dark:text-red-400 font-medium'
                    }
                  >
                    {diagnosisResult.hasJson ? '✓ 成功' : '✗ 失败'}
                  </div>

                  {diagnosisResult.receivedToken && (
                    <>
                      <div className='text-gray-600 dark:text-gray-400'>
                        接收到的Token:
                      </div>
                      <div className='text-gray-900 dark:text-gray-100 font-mono text-xs'>
                        {diagnosisResult.receivedToken}
                      </div>
                    </>
                  )}

                  <div className='text-gray-600 dark:text-gray-400'>
                    配置大小:
                  </div>
                  <div className='text-gray-900 dark:text-gray-100 font-medium'>
                    {diagnosisResult.size
                      ? `${diagnosisResult.size.toLocaleString()} 字节`
                      : 'N/A'}
                  </div>
                </div>
              </div>

              {/* Spider JAR 状态 */}
              <div className='p-4 bg-gray-50 dark:bg-gray-700 rounded-lg'>
                <h3 className='font-semibold text-gray-900 dark:text-white mb-2'>
                  Spider JAR:
                </h3>
                <div className='font-mono text-xs text-gray-600 dark:text-gray-300 break-all mb-2'>
                  {diagnosisResult.spider}
                </div>
                <div className='flex flex-wrap gap-2 text-xs'>
                  {diagnosisResult.spiderPrivate === false && (
                    <span className='px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded'>
                      ✓ 公网地址
                    </span>
                  )}
                  {diagnosisResult.spiderReachable !== undefined &&
                    (diagnosisResult.spiderReachable ? (
                      <span className='px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded'>
                        ✓ 可访问{' '}
                        {diagnosisResult.spiderStatus &&
                          `(${diagnosisResult.spiderStatus})`}
                      </span>
                    ) : (
                      <span className='px-2 py-1 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded'>
                        ✗ 不可访问{' '}
                        {diagnosisResult.spiderStatus &&
                          `(${diagnosisResult.spiderStatus})`}
                      </span>
                    ))}
                  {diagnosisResult.spiderSizeKB !== undefined && (
                    <span
                      className={`px-2 py-1 rounded ${
                        diagnosisResult.spiderSizeKB < 50
                          ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300'
                          : 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                      }`}
                    >
                      {diagnosisResult.spiderSizeKB < 50 ? '⚠' : '✓'}{' '}
                      {diagnosisResult.spiderSizeKB}KB
                    </span>
                  )}
                </div>
                {diagnosisResult.spiderLastModified && (
                  <p className='text-xs text-gray-500 dark:text-gray-400 mt-2'>
                    最后修改:{' '}
                    {new Date(diagnosisResult.spiderLastModified).toLocaleString(
                      'zh-CN',
                    )}
                  </p>
                )}
              </div>

              {/* Spider Jar 状态 */}
              <div className='p-4 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-lg border border-blue-200 dark:border-blue-700'>
                <h3 className='font-semibold text-blue-900 dark:text-blue-300 mb-3 flex items-center gap-2'>
                  <Shield className='w-4 h-4' />
                  Spider JAR 状态
                </h3>
                <div className='grid grid-cols-2 gap-3 text-sm'>
                  <div>
                    <div className='text-blue-600 dark:text-blue-400 text-xs mb-1'>
                      来源
                    </div>
                    <div className='text-gray-900 dark:text-gray-100 font-mono text-xs break-all'>
                      {diagnosisResult.spider_url || 'unknown'}
                    </div>
                  </div>
                  <div>
                    <div className='text-blue-600 dark:text-blue-400 text-xs mb-1'>
                      MD5
                    </div>
                    <div className='text-gray-900 dark:text-gray-100 font-mono text-xs break-all'>
                      {diagnosisResult.spider_md5 || 'unknown'}
                    </div>
                  </div>
                  <div>
                    <div className='text-blue-600 dark:text-blue-400 text-xs mb-1'>
                      缓存状态
                    </div>
                    <div
                      className={`font-medium ${
                        diagnosisResult.spider_cached
                          ? 'text-green-600 dark:text-green-400'
                          : 'text-yellow-600 dark:text-yellow-400'
                      }`}
                    >
                      {diagnosisResult.spider_cached
                        ? '✓ 已缓存'
                        : '⚡ 实时下载'}
                    </div>
                  </div>
                  <div>
                    <div className='text-blue-600 dark:text-blue-400 text-xs mb-1'>
                      文件大小
                    </div>
                    <div className='text-gray-900 dark:text-gray-100 font-medium'>
                      {diagnosisResult.spider_real_size
                        ? `${Math.round(
                            diagnosisResult.spider_real_size / 1024,
                          )}KB`
                        : 'unknown'}
                    </div>
                  </div>
                  <div>
                    <div className='text-blue-600 dark:text-blue-400 text-xs mb-1'>
                      尝试次数
                    </div>
                    <div
                      className={`font-medium ${
                        diagnosisResult.spider_tried &&
                        diagnosisResult.spider_tried > 2
                          ? 'text-yellow-600 dark:text-yellow-400'
                          : 'text-green-600 dark:text-green-400'
                      }`}
                    >
                      {diagnosisResult.spider_tried || 0} 次
                    </div>
                  </div>
                  <div>
                    <div className='text-blue-600 dark:text-blue-400 text-xs mb-1'>
                      获取状态
                    </div>
                    <div
                      className={`font-medium ${
                        diagnosisResult.spider_success
                          ? 'text-green-600 dark:text-green-400'
                          : 'text-red-600 dark:text-red-400'
                      }`}
                    >
                      {diagnosisResult.spider_success
                        ? '✓ 成功'
                        : '✗ 降级 (fallback)'}
                    </div>
                  </div>
                </div>

                {/* 智能建议 */}
                {diagnosisResult.spider_success === false && (
                  <div className='mt-3 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-lg'>
                    <p className='text-sm text-yellow-800 dark:text-yellow-300 font-medium mb-1'>
                      ⚠️ JAR 获取建议
                    </p>
                    <ul className='text-xs text-yellow-700 dark:text-yellow-400 space-y-1'>
                      <li>
                        • 所有远程源均不可用，正在使用内置备用 JAR
                      </li>
                      <li>• 建议检查网络连接或点击"刷新 JAR"重试</li>
                    </ul>
                  </div>
                )}

                {diagnosisResult.spider_success &&
                  diagnosisResult.spider_tried &&
                  diagnosisResult.spider_tried > 2 && (
                    <div className='mt-3 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg'>
                      <p className='text-sm text-blue-800 dark:text-blue-300 font-medium mb-1'>
                        💡 优化建议
                      </p>
                      <ul className='text-xs text-blue-700 dark:text-blue-400 space-y-1'>
                        <li>
                          • 多个源失败后才成功，建议检查网络稳定性
                        </li>
                        {diagnosisResult.spider_url?.includes('github') && (
                          <li>
                            • GitHub 源访问可能受限，建议配置代理
                          </li>
                        )}
                      </ul>
                    </div>
                  )}
              </div>

              {/* 配置统计 */}
              {(diagnosisResult.sitesCount !== undefined ||
                diagnosisResult.livesCount !== undefined) && (
                <div className='p-4 bg-gray-50 dark:bg-gray-700 rounded-lg'>
                  <h3 className='font-semibold text-gray-900 dark:text-white mb-2'>
                    配置统计:
                  </h3>
                  <div className='grid grid-cols-2 gap-2 text-sm text-gray-600 dark:text-gray-300'>
                    {diagnosisResult.sitesCount !== undefined && (
                      <>
                        <div>影视源:</div>
                        <div className='text-gray-900 dark:text-gray-100 font-medium'>
                          {diagnosisResult.sitesCount}
                        </div>
                      </>
                    )}
                    {diagnosisResult.livesCount !== undefined && (
                      <>
                        <div>直播源:</div>
                        <div className='text-gray-900 dark:text-gray-100 font-medium'>
                          {diagnosisResult.livesCount}
                        </div>
                      </>
                    )}
                    {diagnosisResult.parsesCount !== undefined && (
                      <>
                        <div>解析源:</div>
                        <div className='text-gray-900 dark:text-gray-100 font-medium'>
                          {diagnosisResult.parsesCount}
                        </div>
                      </>
                    )}
                    {diagnosisResult.privateApis !== undefined && (
                      <>
                        <div>私网API:</div>
                        <div
                          className={
                            diagnosisResult.privateApis > 0
                              ? 'text-yellow-600 dark:text-yellow-400 font-medium'
                              : 'text-green-600 dark:text-green-400 font-medium'
                          }
                        >
                          {diagnosisResult.privateApis}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* 备用代理 */}
              {diagnosisResult.spider_backup && (
                <div className='p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg'>
                  <h3 className='font-semibold text-blue-900 dark:text-blue-300 mb-2'>
                    备用代理:
                  </h3>
                  <p className='font-mono text-xs text-blue-700 dark:text-blue-300 break-all'>
                    {diagnosisResult.spider_backup}
                  </p>
                </div>
              )}

              {/* 候选列表 */}
              {diagnosisResult.spider_candidates &&
                diagnosisResult.spider_candidates.length > 0 && (
                  <div className='p-4 bg-gray-50 dark:bg-gray-700 rounded-lg'>
                    <h3 className='font-semibold text-gray-900 dark:text-white mb-2'>
                      候选列表:
                    </h3>
                    <div className='space-y-1'>
                      {diagnosisResult.spider_candidates.map(
                        (candidate, idx) => (
                          <div
                            key={idx}
                            className='font-mono text-xs text-gray-600 dark:text-gray-400 break-all'
                          >
                            {idx + 1}. {candidate}
                          </div>
                        ),
                      )}
                    </div>
                  </div>
                )}

              {/* 问题列表 */}
              {diagnosisResult.issues &&
                diagnosisResult.issues.length > 0 && (
                  <div className='p-4 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-700 rounded-lg'>
                    <h3 className='font-semibold text-orange-800 dark:text-orange-300 mb-2'>
                      发现问题:
                    </h3>
                    <ul className='text-sm text-orange-700 dark:text-orange-300 space-y-1'>
                      {diagnosisResult.issues.map((issue, idx) => (
                        <li key={idx}>• {issue}</li>
                      ))}
                    </ul>
                  </div>
                )}
            </>
          )}
        </div>
      )}

      {!diagnosisResult && !diagnosing && (
        <p className='text-sm text-gray-500 dark:text-gray-400 text-center py-4'>
          点击"开始诊断"检查配置健康状态
        </p>
      )}
    </div>
  );
}
