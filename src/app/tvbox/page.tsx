'use client';

import {
  Activity,
  AlertTriangle,
  Heart,
  Search,
  Shield,
  ShieldOff,
  Tv,
  Wrench,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import PageLayout from '@/components/PageLayout';

import { BasicDiagnosticPanel } from './_components/BasicDiagnosticPanel';
import { DeepDiagnosticPanel } from './_components/DeepDiagnosticPanel';
import { JarFixPanel } from './_components/JarFixPanel';
import { SmartHealthPanel } from './_components/SmartHealthPanel';
import type { SecurityConfig, Source } from './_components/types';
import { useTvboxConfigUrl } from './hooks/useTvboxConfigUrl';
import { useTvboxDiagnostics } from './hooks/useTvboxDiagnostics';

export default function TVBoxConfigPage() {
  const router = useRouter();
  const [securityConfig, setSecurityConfig] = useState<SecurityConfig | null>(
    null
  );
  const [siteName, setSiteName] = useState('卡拉米影视');
  const [loading, setLoading] = useState(true);

  // 🔑 新增：用户专属配置状态
  const [userToken, setUserToken] = useState('');
  const [userEnabledSources, setUserEnabledSources] = useState<string[]>([]);
  const [allSources, setAllSources] = useState<Source[]>([]);

  // Tab状态
  const [activeTab, setActiveTab] = useState<
    'basic' | 'smart-health' | 'jar-fix' | 'deep-diagnostic'
  >('basic');

  // 访问权限状态
  const [accessStatus, setAccessStatus] = useState<
    'checking' | 'authorized' | 'unauthorized'
  >('checking');

  const {
    copied,
    format,
    setFormat,
    configMode,
    setConfigMode,
    getConfigUrl,
    handleCopy,
  } = useTvboxConfigUrl(securityConfig, userToken);

  const {
    diagnosing,
    diagnosisResult,
    refreshingJar,
    jarRefreshMsg,
    handleDiagnose,
    handleRefreshJar,
    smartHealthResult,
    smartHealthLoading,
    handleSmartHealthCheck,
    jarFixResult,
    jarFixLoading,
    handleJarFix,
    deepDiagnosticResult,
    deepDiagnosticLoading,
    handleDeepDiagnostic,
  } = useTvboxDiagnostics(securityConfig);

  // 获取安全配置（使用普通用户可访问的接口）
  const fetchSecurityConfig = useCallback(async () => {
    try {
      const response = await fetch('/api/tvbox-config');
      if (response.ok) {
        const data = await response.json();
        setSecurityConfig(data.securityConfig || null);
        setSiteName(data.siteName || '卡拉米影视');
        // 🔑 新增：设置用户专属配置
        setUserToken(data.userToken || '');
        setUserEnabledSources(data.userEnabledSources || []);
        setAllSources(data.allSources || []);
      }
    } catch (error) {
      console.error('获取安全配置失败:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const verifyAccess = async () => {
      try {
        const response = await fetch('/api/admin/role', {
          method: 'GET',
          cache: 'no-store',
        });

        if (!response.ok) {
          throw new Error('forbidden');
        }

        if (!cancelled) {
          setAccessStatus('authorized');
        }
      } catch (error) {
        if (!cancelled) {
          setAccessStatus('unauthorized');
          setLoading(false);
        }
      }
    };

    verifyAccess();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (accessStatus !== 'authorized') {
      return;
    }
    fetchSecurityConfig();
  }, [accessStatus, fetchSecurityConfig]);

  if (accessStatus === 'checking') {
    return (
      <PageLayout activePath='/tvbox'>
        <div className='flex items-center justify-center min-h-[60vh] px-4'>
          <div className='text-sm text-gray-500 dark:text-gray-400'>
            正在校验访问权限...
          </div>
        </div>
      </PageLayout>
    );
  }

  if (accessStatus === 'unauthorized') {
    return (
      <PageLayout activePath='/tvbox'>
        <div className='flex items-center justify-center min-h-[60vh] px-4'>
          <div className='max-w-md w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg p-8 text-center space-y-4'>
            <div className='flex items-center justify-center w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-xl mx-auto'>
              <ShieldOff className='w-6 h-6 text-red-600 dark:text-red-400' />
            </div>
            <h2 className='text-xl font-semibold text-gray-900 dark:text-gray-100'>
              无访问权限
            </h2>
            <p className='text-sm text-gray-600 dark:text-gray-400 leading-6'>
              TVBox 配置仅向管理员开放，请联系站长或管理员开启访问权限。
            </p>
            <button
              onClick={() => router.replace('/')}
              className='inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors'
            >
              返回首页
            </button>
          </div>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout activePath='/tvbox'>
      <div className='max-w-4xl mx-auto p-4 md:p-6'>
        {/* 页面标题 */}
        <div className='mb-8'>
          <div className='flex items-center gap-3 mb-4'>
            <div className='flex items-center justify-center w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-xl'>
              <Tv className='w-6 h-6 text-blue-600 dark:text-blue-400' />
            </div>
            <div>
              <h1 className='text-2xl md:text-3xl font-bold text-gray-900 dark:text-white'>
                TVBox 配置
              </h1>
              <p className='text-gray-600 dark:text-gray-400'>
                将 {siteName} 的视频源导入到 TVBox 应用中使用
              </p>
            </div>
          </div>
        </div>

        {/* 用户专属配置提示 */}
        {!loading && userToken && (
          <div className='mb-6'>
            <div className='bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-4'>
              <div className='flex items-start gap-3'>
                <Shield className='w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5' />
                <div className='flex-1'>
                  <h3 className='font-semibold text-blue-800 dark:text-blue-200 mb-1'>
                    🔑 您的专属TVBox配置
                  </h3>
                  <div className='text-sm text-blue-700 dark:text-blue-300 space-y-1'>
                    <p>• 此配置链接仅供您个人使用，请勿分享给他人</p>
                    {userEnabledSources.length > 0 ? (
                      <p>
                        • 源限制：您可以访问 {userEnabledSources.length}{' '}
                        个指定源
                      </p>
                    ) : (
                      <p>
                        • 源权限：您可以访问所有可用源（{allSources.length} 个）
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 安全状态提示 */}
        {!loading && securityConfig && !userToken && (
          <div className='mb-6'>
            {securityConfig.enableAuth ||
            securityConfig.enableIpWhitelist ||
            securityConfig.enableRateLimit ? (
              <div className='bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-lg p-4'>
                <div className='flex items-start gap-3'>
                  <Shield className='w-5 h-5 text-green-600 dark:text-green-400 mt-0.5' />
                  <div>
                    <h3 className='font-semibold text-green-800 dark:text-green-200 mb-1'>
                      🔒 已启用安全配置
                    </h3>
                    <div className='text-sm text-green-700 dark:text-green-300 space-y-1'>
                      {securityConfig.enableAuth && (
                        <p>• Token验证：已启用（URL已自动包含token）</p>
                      )}
                      {securityConfig.enableIpWhitelist && (
                        <p>
                          • IP白名单：已启用（限制{' '}
                          {securityConfig.allowedIPs.length} 个IP访问）
                        </p>
                      )}
                      {securityConfig.enableRateLimit && (
                        <p>
                          • 频率限制：每分钟最多 {securityConfig.rateLimit}{' '}
                          次请求
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className='bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-lg p-4'>
                <div className='flex items-start gap-3'>
                  <AlertTriangle className='w-5 h-5 text-yellow-600 dark:text-yellow-400 mt-0.5' />
                  <div>
                    <h3 className='font-semibold text-yellow-800 dark:text-yellow-200 mb-1'>
                      ⚠️ 安全提醒
                    </h3>
                    <p className='text-sm text-yellow-700 dark:text-yellow-300'>
                      当前未启用任何安全配置，任何人都可以访问您的TVBox配置。建议在管理后台启用安全选项。
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 配置链接卡片 */}
        <div className='bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 mb-6 border border-gray-200 dark:border-gray-700'>
          <h2 className='text-xl font-semibold mb-4 text-gray-900 dark:text-white'>
            🔗 配置链接
          </h2>

          <div className='mb-4'>
            <label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2'>
              格式类型
            </label>
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value as 'json' | 'base64')}
              className='w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
            >
              <option value='json'>JSON 格式（推荐）</option>
              <option value='base64'>Base64 格式</option>
            </select>
            <p className='text-xs text-gray-500 dark:text-gray-400 mt-1'>
              {format === 'json'
                ? '标准 JSON 配置，TVBox 主流分支支持'
                : 'Base64 编码配置，适合特殊环境'}
            </p>
          </div>

          <div className='mb-4'>
            <label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2'>
              配置模式
            </label>
            <div className='grid grid-cols-2 sm:grid-cols-4 gap-3'>
              <label className='flex items-center cursor-pointer p-3 border border-gray-300 dark:border-gray-600 rounded-lg hover:border-blue-500 dark:hover:border-blue-400 transition-colors'>
                <input
                  type='radio'
                  name='configMode'
                  value='standard'
                  checked={configMode === 'standard'}
                  onChange={(e) =>
                    setConfigMode(
                      e.target.value as
                        | 'standard'
                        | 'safe'
                        | 'fast'
                        | 'yingshicang'
                    )
                  }
                  className='mr-2 w-4 h-4 text-blue-600 focus:ring-blue-500'
                />
                <div className='text-sm'>
                  <span className='font-medium text-gray-900 dark:text-white block'>
                    标准
                  </span>
                  <span className='text-xs text-gray-500 dark:text-gray-400'>
                    日常使用
                  </span>
                </div>
              </label>
              <label className='flex items-center cursor-pointer p-3 border border-gray-300 dark:border-gray-600 rounded-lg hover:border-blue-500 dark:hover:border-blue-400 transition-colors'>
                <input
                  type='radio'
                  name='configMode'
                  value='safe'
                  checked={configMode === 'safe'}
                  onChange={(e) =>
                    setConfigMode(
                      e.target.value as
                        | 'standard'
                        | 'safe'
                        | 'fast'
                        | 'yingshicang'
                    )
                  }
                  className='mr-2 w-4 h-4 text-blue-600 focus:ring-blue-500'
                />
                <div className='text-sm'>
                  <span className='font-medium text-gray-900 dark:text-white block'>
                    精简
                  </span>
                  <span className='text-xs text-gray-500 dark:text-gray-400'>
                    兼容性
                  </span>
                </div>
              </label>
              <label className='flex items-center cursor-pointer p-3 border border-gray-300 dark:border-gray-600 rounded-lg hover:border-green-500 dark:hover:border-green-400 transition-colors'>
                <input
                  type='radio'
                  name='configMode'
                  value='fast'
                  checked={configMode === 'fast'}
                  onChange={(e) =>
                    setConfigMode(
                      e.target.value as
                        | 'standard'
                        | 'safe'
                        | 'fast'
                        | 'yingshicang'
                    )
                  }
                  className='mr-2 w-4 h-4 text-green-600 focus:ring-green-500'
                />
                <div className='text-sm'>
                  <span className='font-medium text-gray-900 dark:text-white block'>
                    快速
                  </span>
                  <span className='text-xs text-gray-500 dark:text-gray-400'>
                    频繁换源
                  </span>
                </div>
              </label>
              <label className='flex items-center cursor-pointer p-3 border border-gray-300 dark:border-gray-600 rounded-lg hover:border-purple-500 dark:hover:border-purple-400 transition-colors'>
                <input
                  type='radio'
                  name='configMode'
                  value='yingshicang'
                  checked={configMode === 'yingshicang'}
                  onChange={(e) =>
                    setConfigMode(
                      e.target.value as
                        | 'standard'
                        | 'safe'
                        | 'fast'
                        | 'yingshicang'
                    )
                  }
                  className='mr-2 w-4 h-4 text-purple-600 focus:ring-purple-500'
                />
                <div className='text-sm'>
                  <span className='font-medium text-gray-900 dark:text-white block'>
                    影视仓
                  </span>
                  <span className='text-xs text-gray-500 dark:text-gray-400'>
                    专用优化
                  </span>
                </div>
              </label>
            </div>
            <p className='text-xs text-gray-500 dark:text-gray-400 mt-2'>
              {configMode === 'standard'
                ? '📊 包含 IJK 优化、DoH DNS、广告过滤，适合日常使用'
                : configMode === 'safe'
                ? '🔒 仅核心配置，TVBox 兼容性问题时使用'
                : configMode === 'fast'
                ? '⚡ 优化切换速度，移除超时配置，减少卡顿和 SSL 错误'
                : '🎬 专为影视仓优化，包含播放规则和兼容性修复'}
            </p>
          </div>

          <div className='flex items-center space-x-2'>
            <input
              type='text'
              readOnly
              value={getConfigUrl()}
              className='flex-1 p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white font-mono text-sm focus:outline-none'
            />
            <button
              onClick={handleCopy}
              className={`px-6 py-3 rounded-lg font-medium transition-all duration-200 ${
                copied
                  ? 'bg-green-500 hover:bg-green-600 text-white'
                  : 'bg-blue-500 hover:bg-blue-600 text-white'
              } transform hover:scale-105`}
            >
              {copied ? '✓ 已复制' : '复制'}
            </button>
          </div>
        </div>

        {/* 配置诊断 - 多标签页 */}
        <div className='mb-6 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700'>
          {/* 标签页头部 */}
          <div className='border-b border-gray-200 dark:border-gray-700'>
            <div className='flex items-center justify-between p-4 pb-0'>
              <div className='flex items-center gap-2 mb-4'>
                <Activity className='w-5 h-5 text-blue-600 dark:text-blue-400' />
                <h2 className='text-xl font-semibold text-gray-900 dark:text-white'>
                  🔍 配置诊断
                </h2>
              </div>
              <button
                onClick={handleRefreshJar}
                disabled={refreshingJar}
                className='px-4 py-2 mb-4 bg-green-500 hover:bg-green-600 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors text-sm'
              >
                {refreshingJar ? '刷新中...' : '🔄 刷新 JAR'}
              </button>
            </div>

            {/* 标签导航 */}
            <div className='flex gap-2 px-4'>
              <button
                onClick={() => setActiveTab('basic')}
                className={`px-4 py-2 font-medium transition-colors border-b-2 ${
                  activeTab === 'basic'
                    ? 'text-blue-600 dark:text-blue-400 border-blue-600 dark:border-blue-400'
                    : 'text-gray-500 dark:text-gray-400 border-transparent hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                基础诊断
              </button>
              <button
                onClick={() => setActiveTab('smart-health')}
                className={`px-4 py-2 font-medium transition-colors border-b-2 flex items-center gap-2 ${
                  activeTab === 'smart-health'
                    ? 'text-blue-600 dark:text-blue-400 border-blue-600 dark:border-blue-400'
                    : 'text-gray-500 dark:text-gray-400 border-transparent hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                <Heart className='w-4 h-4' />
                智能健康
              </button>
              <button
                onClick={() => setActiveTab('jar-fix')}
                className={`px-4 py-2 font-medium transition-colors border-b-2 flex items-center gap-2 ${
                  activeTab === 'jar-fix'
                    ? 'text-blue-600 dark:text-blue-400 border-blue-600 dark:border-blue-400'
                    : 'text-gray-500 dark:text-gray-400 border-transparent hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                <Wrench className='w-4 h-4' />
                源修复
              </button>
              <button
                onClick={() => setActiveTab('deep-diagnostic')}
                className={`px-4 py-2 font-medium transition-colors border-b-2 flex items-center gap-2 ${
                  activeTab === 'deep-diagnostic'
                    ? 'text-blue-600 dark:text-blue-400 border-blue-600 dark:border-blue-400'
                    : 'text-gray-500 dark:text-gray-400 border-transparent hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                <Search className='w-4 h-4' />
                深度诊断
              </button>
            </div>
          </div>

          {/* 标签页内容 */}
          <div className='p-6'>
            {/* 基础诊断标签页 */}
            {activeTab === 'basic' && (
              <BasicDiagnosticPanel
                result={diagnosisResult}
                loading={diagnosing}
                jarRefreshMsg={jarRefreshMsg}
                onDiagnose={handleDiagnose}
              />
            )}

            {/* 智能健康检查标签页 */}
            {activeTab === 'smart-health' && (
              <SmartHealthPanel
                result={smartHealthResult}
                loading={smartHealthLoading}
                onCheck={handleSmartHealthCheck}
              />
            )}

            {/* JAR源修复标签页 */}
            {activeTab === 'jar-fix' && (
              <JarFixPanel
                result={jarFixResult}
                loading={jarFixLoading}
                onRun={handleJarFix}
              />
            )}

            {/* 深度诊断标签页 */}
            {activeTab === 'deep-diagnostic' && (
              <DeepDiagnosticPanel
                result={deepDiagnosticResult}
                loading={deepDiagnosticLoading}
                onRun={handleDeepDiagnostic}
              />
            )}
          </div>
        </div>

        {/* 快速开始 */}
        <div className='bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 mb-6 border border-gray-200 dark:border-gray-700'>
          <h2 className='text-xl font-semibold mb-4 text-gray-900 dark:text-white'>
            📋 快速开始
          </h2>
          <ol className='text-sm text-gray-600 dark:text-gray-400 space-y-2 list-decimal list-inside'>
            <li>复制上方配置链接</li>
            <li>打开 TVBox → 设置 → 配置地址</li>
            <li>粘贴链接并确认导入</li>
            <li>等待配置加载完成即可使用</li>
          </ol>
        </div>

        {/* 核心特性 */}
        <div className='bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-xl p-6 mb-6 border border-blue-200 dark:border-blue-700'>
          <h2 className='text-xl font-semibold mb-4 text-gray-900 dark:text-white'>
            ✨ 核心特性
          </h2>
          <div className='grid md:grid-cols-2 gap-4 text-sm'>
            <div className='space-y-2'>
              <h3 className='font-semibold text-gray-900 dark:text-white flex items-center gap-2'>
                <Shield className='w-4 h-4 text-blue-600 dark:text-blue-400' />
                智能 Spider 管理
              </h3>
              <ul className='text-gray-600 dark:text-gray-400 space-y-1 ml-6'>
                <li>• 自动探测多源（国内CDN + GitHub）</li>
                <li>• 智能重试 + 失败源记录</li>
                <li>• 动态缓存（成功 4h / 失败 10min）</li>
                <li>• JAR 文件验证 + 真实 MD5</li>
              </ul>
            </div>
            <div className='space-y-2'>
              <h3 className='font-semibold text-gray-900 dark:text-white flex items-center gap-2'>
                <Heart className='w-4 h-4 text-blue-600 dark:text-blue-400' />
                智能诊断系统
              </h3>
              <ul className='text-gray-600 dark:text-gray-400 space-y-1 ml-6'>
                <li>• 网络环境智能检测</li>
                <li>• JAR 源健康评分</li>
                <li>• 文件头验证 + MD5 校验</li>
                <li>• 个性化优化建议</li>
              </ul>
            </div>
          </div>
        </div>

        {/* 常见问题 */}
        <div className='bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 border border-gray-200 dark:border-gray-700'>
          <h2 className='text-xl font-semibold mb-4 text-gray-900 dark:text-white'>
            ❓ 常见问题
          </h2>
          <div className='space-y-4 text-sm'>
            <div>
              <h3 className='font-semibold text-gray-900 dark:text-white mb-1'>
                Q: Spider JAR 加载失败怎么办？
              </h3>
              <p className='text-gray-600 dark:text-gray-400'>
                A:
                依次使用"智能健康"→"源修复"→"深度诊断"，系统会自动检测问题并给出解决方案
              </p>
            </div>
            <div>
              <h3 className='font-semibold text-gray-900 dark:text-white mb-1'>
                Q: 各个诊断功能有什么区别？
              </h3>
              <p className='text-gray-600 dark:text-gray-400'>
                A:
                基础诊断看配置信息、智能健康看整体状态、源修复给优化建议、深度诊断含文件验证和MD5校验
              </p>
            </div>
            <div>
              <h3 className='font-semibold text-gray-900 dark:text-white mb-1'>
                Q: 源切换卡顿怎么办？
              </h3>
              <p className='text-gray-600 dark:text-gray-400'>
                A: 使用快速模式（移除超时配置，优化切换速度）
              </p>
            </div>
            <div>
              <h3 className='font-semibold text-gray-900 dark:text-white mb-1'>
                Q: TVBox 报错或不兼容？
              </h3>
              <p className='text-gray-600 dark:text-gray-400'>
                A: 切换到精简模式（仅核心配置，提高兼容性）
              </p>
            </div>
            <div>
              <h3 className='font-semibold text-gray-900 dark:text-white mb-1'>
                Q: 如何更新配置？
              </h3>
              <p className='text-gray-600 dark:text-gray-400'>
                A: TVBox → 设置 → 配置地址 → 刷新，配置即时生效
              </p>
            </div>
            {securityConfig?.enableAuth && (
              <div>
                <h3 className='font-semibold text-gray-900 dark:text-white mb-1'>
                  Q: Token 认证相关？
                </h3>
                <p className='text-gray-600 dark:text-gray-400'>
                  A: 配置链接已自动包含 Token，请勿泄露给他人
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
