/* eslint-disable @typescript-eslint/no-explicit-any, no-console, @typescript-eslint/no-non-null-assertion,react-hooks/exhaustive-deps,@typescript-eslint/no-empty-function */

'use client';

import {
  Activity,
  Brain,
  ChevronDown,
  ChevronUp,
  Database,
  FileText,
  FolderOpen,
  MessageSquare,
  Settings,
  TestTube,
  Tv,
  Users,
  Video,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import {
  type ReactNode,
  Suspense,
  useCallback,
  useEffect,
  useState,
} from 'react';
import { createPortal } from 'react-dom';

import { AdminConfig, AdminConfigResult } from '@/lib/admin.types';

import PageLayout from '@/components/PageLayout';

import {
  AlertModal,
  buttonStyles,
  showError,
  showSuccess,
  useAlertModal,
  useLoadingState,
} from './_components/adminShared';

// 可折叠标签组件
interface CollapsibleTabProps {
  title: string;
  icon?: ReactNode;
  isExpanded: boolean;
  onToggle: () => void;
  children: ReactNode;
}

const CollapsibleTab = ({
  title,
  icon,
  isExpanded,
  onToggle,
  children,
}: CollapsibleTabProps) => {
  return (
    <div className='rounded-xl shadow-sm mb-4 overflow-hidden bg-white/80 backdrop-blur-md dark:bg-gray-800/50 dark:ring-1 dark:ring-gray-700'>
      <button
        onClick={onToggle}
        className='w-full px-6 py-4 flex items-center justify-between bg-gray-50/70 dark:bg-gray-800/60 hover:bg-gray-100/80 dark:hover:bg-gray-700/60 transition-colors'
      >
        <div className='flex items-center gap-3'>
          {icon}
          <h3 className='text-lg font-medium text-gray-900 dark:text-gray-100'>
            {title}
          </h3>
        </div>
        <div className='text-gray-500 dark:text-gray-400'>
          {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
        </div>
      </button>

      {isExpanded && <div className='px-6 py-4'>{children}</div>}
    </div>
  );
};

const SectionSkeleton = () => (
  <div className='rounded-xl border border-dashed border-gray-200 dark:border-gray-700 bg-white/60 dark:bg-gray-800/40 p-6 text-center text-sm text-gray-500 dark:text-gray-400'>
    <div className='animate-pulse'>模块加载中...</div>
  </div>
);

const UserConfigPanel = dynamic(() => import('./_components/UserConfigPanel'), {
  loading: () => <SectionSkeleton />,
  ssr: false,
});

const VideoSourceConfigPanel = dynamic(
  () => import('./_components/VideoSourceConfigPanel'),
  { loading: () => <SectionSkeleton />, ssr: false }
);

const CategoryConfigPanel = dynamic(
  () => import('./_components/CategoryConfigPanel'),
  { loading: () => <SectionSkeleton />, ssr: false }
);

const ConfigFilePanel = dynamic(() => import('./_components/ConfigFilePanel'), {
  loading: () => <SectionSkeleton />,
  ssr: false,
});

const SiteConfigPanel = dynamic(() => import('./_components/SiteConfigPanel'), {
  loading: () => <SectionSkeleton />,
  ssr: false,
});

const LiveSourceConfigPanel = dynamic(
  () => import('./_components/LiveSourceConfigPanel'),
  { loading: () => <SectionSkeleton />, ssr: false }
);

const NetDiskConfigPanel = dynamic(
  () => import('./_components/NetDiskConfigPanel'),
  { loading: () => <SectionSkeleton />, ssr: false }
);

const AIRecommendConfigPanel = dynamic(
  () => import('@/components/AIRecommendConfig'),
  { loading: () => <SectionSkeleton />, ssr: false }
);

const CacheManagerPanel = dynamic(() => import('@/components/CacheManager'), {
  loading: () => <SectionSkeleton />,
  ssr: false,
});

const DataMigrationPanel = dynamic(() => import('@/components/DataMigration'), {
  loading: () => <SectionSkeleton />,
  ssr: false,
});

const SourceTestModule = dynamic(
  () => import('@/components/SourceTestModule'),
  { loading: () => <SectionSkeleton />, ssr: false }
);

const TelegramAuthConfigPanel = dynamic(
  () =>
    import('@/components/TelegramAuthConfig').then(
      (mod) => mod.TelegramAuthConfig
    ),
  { loading: () => <SectionSkeleton />, ssr: false }
);

const TVBoxSecurityConfigPanel = dynamic(
  () => import('@/components/TVBoxSecurityConfig'),
  { loading: () => <SectionSkeleton />, ssr: false }
);

const YouTubeConfigPanel = dynamic(() => import('@/components/YouTubeConfig'), {
  loading: () => <SectionSkeleton />,
  ssr: false,
});

const DanmuConfigPanel = dynamic(() => import('@/components/DanmuConfig'), {
  loading: () => <SectionSkeleton />,
  ssr: false,
});

const AccessLogViewer = dynamic(() => import('@/components/AccessLogViewer'), {
  loading: () => <SectionSkeleton />,
  ssr: false,
});

const FeedbackPanel = dynamic(() => import('./_components/FeedbackPanel'), {
  loading: () => <SectionSkeleton />,
  ssr: false,
});

// 用户配置组件
function AdminPageClient() {
  const { alertModal, showAlert, hideAlert } = useAlertModal();
  const { isLoading, withLoading } = useLoadingState();
  const [config, setConfig] = useState<AdminConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState<'owner' | 'admin' | null>(null);
  const [showResetConfigModal, setShowResetConfigModal] = useState(false);
  const [expandedTabs, setExpandedTabs] = useState<{ [key: string]: boolean }>({
    userConfig: false,
    videoSource: false,
    sourceTest: false,
    liveSource: false,
    siteConfig: false,
    categoryConfig: false,
    netdiskConfig: false,
    aiRecommendConfig: false,
    youtubeConfig: false,
    danmuConfig: false,
    tvboxSecurityConfig: false,
    telegramAuthConfig: false,
    configFile: false,
    cacheManager: false,
    dataMigration: false,
    accessLogs: false,
    feedbackPanel: false,
  });

  // 获取管理员配置
  // showLoading 用于控制是否在请求期间显示整体加载骨架。
  const fetchConfig = useCallback(async (showLoading = false) => {
    try {
      if (showLoading) {
        setLoading(true);
      }

      const response = await fetch(`/api/admin/config`);

      if (!response.ok) {
        const data = (await response.json()) as any;
        throw new Error(`获取配置失败: ${data.error}`);
      }

      const data = (await response.json()) as AdminConfigResult;
      setConfig(data.Config);
      setRole(data.Role);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '获取配置失败';
      showError(msg, showAlert);
      setError(msg);
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    // 首次加载时显示骨架
    fetchConfig(true);
  }, [fetchConfig]);

  // 切换标签展开状态
  const toggleTab = (tabKey: string) => {
    setExpandedTabs((prev) => ({
      ...prev,
      [tabKey]: !prev[tabKey],
    }));
  };

  // 新增: 重置配置处理函数
  const handleResetConfig = () => {
    setShowResetConfigModal(true);
  };

  const handleConfirmResetConfig = async () => {
    await withLoading('resetConfig', async () => {
      try {
        const response = await fetch(`/api/admin/reset`);
        if (!response.ok) {
          throw new Error(`重置失败: ${response.status}`);
        }
        showSuccess('重置成功，请刷新页面！', showAlert);
        await fetchConfig();
        setShowResetConfigModal(false);
      } catch (err) {
        showError(err instanceof Error ? err.message : '重置失败', showAlert);
        throw err;
      }
    });
  };

  if (loading) {
    return (
      <PageLayout activePath='/admin'>
        <div className='px-2 sm:px-10 py-4 sm:py-8'>
          <div className='max-w-[95%] mx-auto'>
            <h1 className='text-2xl font-bold text-gray-900 dark:text-gray-100 mb-8'>
              管理员设置
            </h1>
            <div className='space-y-6'>
              {Array.from({ length: 3 }).map((_, index) => (
                <div
                  key={index}
                  className='relative h-24 bg-gradient-to-r from-gray-100 via-gray-200 to-gray-100 dark:from-gray-800 dark:via-gray-700 dark:to-gray-800 rounded-xl overflow-hidden'
                >
                  <div className='absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/20 to-transparent'></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </PageLayout>
    );
  }

  if (error) {
    // 错误已通过弹窗展示，此处直接返回空
    return null;
  }

  return (
    <PageLayout activePath='/admin'>
      <div className='px-2 sm:px-10 py-4 sm:py-8'>
        <div className='max-w-[95%] mx-auto'>
          {/* 标题 + 重置配置按钮 */}
          <div className='flex items-center gap-2 mb-8'>
            <h1 className='text-2xl font-bold text-gray-900 dark:text-gray-100'>
              管理员设置
            </h1>
            {config && role === 'owner' && (
              <button
                onClick={handleResetConfig}
                className={`px-3 py-1 text-xs rounded-md transition-colors ${buttonStyles.dangerSmall}`}
              >
                重置配置
              </button>
            )}
          </div>

          {/* 配置文件标签 - 仅站长可见 */}
          {role === 'owner' && (
            <CollapsibleTab
              title='配置文件'
              icon={
                <FileText
                  size={20}
                  className='text-gray-600 dark:text-gray-400'
                />
              }
              isExpanded={expandedTabs.configFile}
              onToggle={() => toggleTab('configFile')}
            >
              <ConfigFilePanel config={config} refreshConfig={fetchConfig} />
            </CollapsibleTab>
          )}

          {/* 站点配置标签 */}
          <CollapsibleTab
            title='站点配置'
            icon={
              <Settings
                size={20}
                className='text-gray-600 dark:text-gray-400'
              />
            }
            isExpanded={expandedTabs.siteConfig}
            onToggle={() => toggleTab('siteConfig')}
          >
            <SiteConfigPanel config={config} refreshConfig={fetchConfig} />
          </CollapsibleTab>

          <div className='space-y-4'>
            {/* 用户配置标签 */}
            <CollapsibleTab
              title='用户配置'
              icon={
                <Users size={20} className='text-gray-600 dark:text-gray-400' />
              }
              isExpanded={expandedTabs.userConfig}
              onToggle={() => toggleTab('userConfig')}
            >
              <UserConfigPanel
                config={config}
                role={role}
                refreshConfig={fetchConfig}
              />
            </CollapsibleTab>

            {/* 视频源配置标签 */}
            <CollapsibleTab
              title='视频源配置'
              icon={
                <Video size={20} className='text-gray-600 dark:text-gray-400' />
              }
              isExpanded={expandedTabs.videoSource}
              onToggle={() => toggleTab('videoSource')}
            >
              <VideoSourceConfigPanel
                config={config}
                refreshConfig={fetchConfig}
              />
            </CollapsibleTab>

            {/* 源检测标签 */}
            <CollapsibleTab
              title='源检测'
              icon={
                <TestTube
                  size={20}
                  className='text-gray-600 dark:text-gray-400'
                />
              }
              isExpanded={expandedTabs.sourceTest}
              onToggle={() => toggleTab('sourceTest')}
            >
              <SourceTestModule />
            </CollapsibleTab>

            {/* 直播源配置标签 */}
            <CollapsibleTab
              title='直播源配置'
              icon={
                <Tv size={20} className='text-gray-600 dark:text-gray-400' />
              }
              isExpanded={expandedTabs.liveSource}
              onToggle={() => toggleTab('liveSource')}
            >
              <LiveSourceConfigPanel
                config={config}
                refreshConfig={fetchConfig}
              />
            </CollapsibleTab>

            {/* 分类配置标签 */}
            <CollapsibleTab
              title='分类配置'
              icon={
                <FolderOpen
                  size={20}
                  className='text-gray-600 dark:text-gray-400'
                />
              }
              isExpanded={expandedTabs.categoryConfig}
              onToggle={() => toggleTab('categoryConfig')}
            >
              <CategoryConfigPanel
                config={config}
                refreshConfig={fetchConfig}
              />
            </CollapsibleTab>

            {/* 网盘搜索配置标签 */}
            <CollapsibleTab
              title='网盘搜索配置'
              icon={
                <Database
                  size={20}
                  className='text-gray-600 dark:text-gray-400'
                />
              }
              isExpanded={expandedTabs.netdiskConfig}
              onToggle={() => toggleTab('netdiskConfig')}
            >
              <NetDiskConfigPanel config={config} refreshConfig={fetchConfig} />
            </CollapsibleTab>

            {/* AI推荐配置标签 */}
            <CollapsibleTab
              title='AI推荐配置'
              icon={
                <Brain size={20} className='text-gray-600 dark:text-gray-400' />
              }
              isExpanded={expandedTabs.aiRecommendConfig}
              onToggle={() => toggleTab('aiRecommendConfig')}
            >
              <AIRecommendConfigPanel
                config={config}
                refreshConfig={fetchConfig}
              />
            </CollapsibleTab>

            {/* YouTube配置标签 */}
            <CollapsibleTab
              title='YouTube配置'
              icon={
                <Video size={20} className='text-gray-600 dark:text-gray-400' />
              }
              isExpanded={expandedTabs.youtubeConfig}
              onToggle={() => toggleTab('youtubeConfig')}
            >
              <YouTubeConfigPanel config={config} refreshConfig={fetchConfig} />
            </CollapsibleTab>

            {/* 弹幕配置标签 */}
            <CollapsibleTab
              title='弹幕配置'
              icon={
                <MessageSquare
                  size={20}
                  className='text-gray-600 dark:text-gray-400'
                />
              }
              isExpanded={expandedTabs.danmuConfig}
              onToggle={() => toggleTab('danmuConfig')}
            >
              <DanmuConfigPanel config={config} refreshConfig={fetchConfig} />
            </CollapsibleTab>

            {/* TVBox安全配置标签 */}
            <CollapsibleTab
              title='TVBox安全配置'
              icon={
                <Settings
                  size={20}
                  className='text-gray-600 dark:text-gray-400'
                />
              }
              isExpanded={expandedTabs.tvboxSecurityConfig}
              onToggle={() => toggleTab('tvboxSecurityConfig')}
            >
              <TVBoxSecurityConfigPanel
                config={config}
                refreshConfig={fetchConfig}
              />
            </CollapsibleTab>

            {/* Telegram 登录配置 - 仅站长可见 */}
            {role === 'owner' && (
              <CollapsibleTab
                title='Telegram 登录配置'
                icon={
                  <svg
                    viewBox='0 0 24 24'
                    width='20'
                    height='20'
                    className='text-blue-500 dark:text-blue-400'
                    fill='currentColor'
                  >
                    <path d='M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69.01-.03.01-.14-.07-.2-.08-.06-.19-.04-.27-.02-.12.03-1.99 1.27-5.62 3.72-.53.36-1.01.54-1.44.53-.47-.01-1.38-.27-2.05-.49-.82-.27-1.47-.42-1.42-.88.03-.24.37-.48 1.02-.73 4-1.74 6.68-2.88 8.03-3.44 3.82-1.58 4.61-1.85 5.13-1.86.11 0 .37.03.54.17.14.11.18.26.2.37.02.08.03.29.01.45z' />
                  </svg>
                }
                isExpanded={expandedTabs.telegramAuthConfig}
                onToggle={() => toggleTab('telegramAuthConfig')}
              >
                <TelegramAuthConfigPanel
                  config={
                    config?.TelegramAuthConfig || {
                      enabled: false,
                      botToken: '',
                      botUsername: '',
                      autoRegister: true,
                      buttonSize: 'large',
                      showAvatar: true,
                      requestWriteAccess: false,
                    }
                  }
                  onSave={async (newConfig) => {
                    if (!config) return;
                    await fetch('/api/admin/config', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        ...config,
                        TelegramAuthConfig: newConfig,
                      }),
                    });
                    await fetchConfig();
                  }}
                />
              </CollapsibleTab>
            )}

            {/* 缓存管理标签 - 仅站长可见 */}
            {role === 'owner' && (
              <CollapsibleTab
                title='缓存管理'
                icon={
                  <Database
                    size={20}
                    className='text-gray-600 dark:text-gray-400'
                  />
                }
                isExpanded={expandedTabs.cacheManager}
                onToggle={() => toggleTab('cacheManager')}
              >
                <CacheManagerPanel />
              </CollapsibleTab>
            )}

            {/* 数据迁移标签 - 仅站长可见 */}
            {role === 'owner' && (
              <CollapsibleTab
                title='数据迁移'
                icon={
                  <Database
                    size={20}
                    className='text-gray-600 dark:text-gray-400'
                  />
                }
                isExpanded={expandedTabs.dataMigration}
                onToggle={() => toggleTab('dataMigration')}
              >
                <DataMigrationPanel onRefreshConfig={fetchConfig} />
              </CollapsibleTab>
            )}

            {/* 访问日志面板 */}
            {role === 'owner' && (
              <CollapsibleTab
                title='访问日志'
                icon={
                  <Activity
                    size={20}
                    className='text-gray-600 dark:text-gray-400'
                  />
                }
                isExpanded={expandedTabs.accessLogs}
                onToggle={() => toggleTab('accessLogs')}
              >
                <AccessLogViewer />
              </CollapsibleTab>
            )}

            {/* 用户留言面板 */}
            <CollapsibleTab
              title='用户留言'
              icon={
                <MessageSquare
                  size={20}
                  className='text-gray-600 dark:text-gray-400'
                />
              }
              isExpanded={expandedTabs.feedbackPanel}
              onToggle={() => toggleTab('feedbackPanel')}
            >
              <FeedbackPanel role={role} />
            </CollapsibleTab>
          </div>
        </div>
      </div>

      {/* 通用弹窗组件 */}
      <AlertModal
        isOpen={alertModal.isOpen}
        onClose={hideAlert}
        type={alertModal.type}
        title={alertModal.title}
        message={alertModal.message}
        timer={alertModal.timer}
        showConfirm={alertModal.showConfirm}
      />

      {/* 重置配置确认弹窗 */}
      {showResetConfigModal &&
        createPortal(
          <div
            className='fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4'
            onClick={() => setShowResetConfigModal(false)}
          >
            <div
              className='bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full'
              onClick={(e) => e.stopPropagation()}
            >
              <div className='p-6'>
                <div className='flex items-center justify-between mb-6'>
                  <h3 className='text-xl font-semibold text-gray-900 dark:text-gray-100'>
                    确认重置配置
                  </h3>
                  <button
                    onClick={() => setShowResetConfigModal(false)}
                    className='text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors'
                  >
                    <svg
                      className='w-6 h-6'
                      fill='none'
                      stroke='currentColor'
                      viewBox='0 0 24 24'
                    >
                      <path
                        strokeLinecap='round'
                        strokeLinejoin='round'
                        strokeWidth={2}
                        d='M6 18L18 6M6 6l12 12'
                      />
                    </svg>
                  </button>
                </div>

                <div className='mb-6'>
                  <div className='bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 mb-4'>
                    <div className='flex items-center space-x-2 mb-2'>
                      <svg
                        className='w-5 h-5 text-yellow-600 dark:text-yellow-400'
                        fill='none'
                        stroke='currentColor'
                        viewBox='0 0 24 24'
                      >
                        <path
                          strokeLinecap='round'
                          strokeLinejoin='round'
                          strokeWidth={2}
                          d='M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z'
                        />
                      </svg>
                      <span className='text-sm font-medium text-yellow-800 dark:text-yellow-300'>
                        ⚠️ 危险操作警告
                      </span>
                    </div>
                    <p className='text-sm text-yellow-700 dark:text-yellow-400'>
                      此操作将重置用户封禁和管理员设置、自定义视频源，站点配置将重置为默认值，是否继续？
                    </p>
                  </div>
                </div>

                {/* 操作按钮 */}
                <div className='flex justify-end space-x-3'>
                  <button
                    onClick={() => setShowResetConfigModal(false)}
                    className={`px-6 py-2.5 text-sm font-medium ${buttonStyles.secondary}`}
                  >
                    取消
                  </button>
                  <button
                    onClick={handleConfirmResetConfig}
                    disabled={isLoading('resetConfig')}
                    className={`px-6 py-2.5 text-sm font-medium ${
                      isLoading('resetConfig')
                        ? buttonStyles.disabled
                        : buttonStyles.danger
                    }`}
                  >
                    {isLoading('resetConfig') ? '重置中...' : '确认重置'}
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </PageLayout>
  );
}

export default function AdminPage() {
  return (
    <Suspense>
      <AdminPageClient />
    </Suspense>
  );
}
