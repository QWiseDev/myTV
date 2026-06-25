/* eslint-disable @typescript-eslint/no-explicit-any */

'use client';

import {
  AlertCircle,
  CheckCircle,
  Lock,
  MessageSquare,
  Send,
  User,
  UserPlus,
  X,
} from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

import { CURRENT_VERSION } from '@/lib/version';

import { useSite } from '@/components/SiteProvider';
import { ThemeToggle } from '@/components/ThemeToggle';

// 版本显示组件
function VersionDisplay() {
  return (
    <div className='absolute bottom-4 left-1/2 transform -translate-x-1/2 flex items-center gap-2 text-xs text-[#5e5d59] dark:text-[#b7b1a8]'>
      <span className='font-mono'>v{CURRENT_VERSION}</span>
    </div>
  );
}

function LoginPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [shouldAskUsername, setShouldAskUsername] = useState(false);

  // Telegram Magic Link 状态
  const [telegramLoading, setTelegramLoading] = useState(false);
  const [telegramDeepLink, setTelegramDeepLink] = useState('');
  const [telegramEnabled, setTelegramEnabled] = useState(false);
  const [telegramUsername, setTelegramUsername] = useState('');

  // 留言功能状态
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [feedbackContent, setFeedbackContent] = useState('');
  const [feedbackUsername, setFeedbackUsername] = useState('');
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedbackSuccess, setFeedbackSuccess] = useState(false);

  const { siteName } = useSite();

  // 在客户端挂载后设置配置
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const storageType = (window as any).RUNTIME_CONFIG?.STORAGE_TYPE;
      setShouldAskUsername(storageType && storageType !== 'localstorage');
    }
  }, []);

  // 获取 Telegram Magic Link 配置
  useEffect(() => {
    const fetchTelegramConfig = async () => {
      try {
        const response = await fetch('/api/server-config');
        const data = await response.json();
        if (data.TelegramAuthConfig?.enabled) {
          setTelegramEnabled(true);
        }
      } catch (error) { /* 忽略错误 */ }
    };

    fetchTelegramConfig();
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    if (!password || (shouldAskUsername && !username)) return;

    try {
      setLoading(true);
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password,
          ...(shouldAskUsername ? { username } : {}),
        }),
      });

      if (res.ok) {
        // 记录登入时间
        try {
          await fetch('/api/user/my-stats', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ loginTime: Date.now() }),
          });
        } catch (error) {
          // 登入时间记录失败不影响正常登录流程
        }

        const redirect = searchParams.get('redirect') || '/';
        router.replace(redirect);
      } else if (res.status === 401) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? '密码错误');
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? '服务器错误');
      }
    } catch (error) {
      setError('网络错误，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  // 生成 Telegram 登录链接
  const handleTelegramLogin = async () => {
    setError(null);

    // 验证 Telegram 用户名
    if (!telegramUsername || telegramUsername.trim() === '') {
      setError('请输入您的 Telegram 用户名');
      return;
    }

    setTelegramLoading(true);

    try {
      const res = await fetch('/api/telegram/send-magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telegramUsername: telegramUsername.trim() }),
      });

      const data = await res.json();

      if (res.ok && data.deepLink) {
        setTelegramDeepLink(data.deepLink);
        // 自动打开 Telegram
        window.open(data.deepLink, '_blank');
      } else {
        setError(data.error || '生成链接失败，请重试');
      }
    } catch (error) {
      console.error('[Frontend] Error:', error);
      setError('网络错误，请稍后重试');
    } finally {
      setTelegramLoading(false);
    }
  };

  // 提交留言
  const handleFeedbackSubmit = async () => {
    if (!feedbackContent.trim()) return;

    setFeedbackLoading(true);
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: feedbackUsername.trim() || undefined,
          content: feedbackContent.trim(),
        }),
      });

      if (res.ok) {
        setFeedbackSuccess(true);
        setFeedbackContent('');
        setFeedbackUsername('');
        setTimeout(() => {
          setShowFeedbackModal(false);
          setFeedbackSuccess(false);
        }, 2000);
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? '留言提交失败');
      }
    } catch {
      setError('网络错误，请稍后重试');
    } finally {
      setFeedbackLoading(false);
    }
  };

  return (
    <div className='relative min-h-screen flex items-center justify-center px-4 overflow-hidden bg-[#faf9f5] text-[#141413] dark:bg-[#191817] dark:text-[#f8f6f0]'>
      <div className='absolute inset-0 bg-[radial-gradient(circle_at_18%_12%,rgba(217,119,87,0.16),transparent_28rem),linear-gradient(180deg,#faf9f5_0%,#f5f3eb_55%,#ebe7dd_100%)] dark:bg-[radial-gradient(circle_at_18%_12%,rgba(224,154,122,0.14),transparent_28rem),linear-gradient(180deg,#191817_0%,#201f1d_55%,#171615_100%)]' />

      <div className='absolute top-4 right-4 z-20'>
        <ThemeToggle />
      </div>
      <div className='relative z-10 w-full max-w-md rounded-lg border border-[#e8e6dc] bg-white/86 p-8 shadow-[0_24px_70px_rgba(48,48,46,0.12)] backdrop-blur-xl animate-fade-in dark:border-[#3d3934] dark:bg-[#24221f]/88 dark:shadow-[0_24px_70px_rgba(0,0,0,0.32)] sm:p-10'>
        {/* 标题区域 */}
        <div className='text-center mb-8'>
          <div className='mb-5 inline-flex h-12 w-12 items-center justify-center rounded-md border border-[#d8c0b4] bg-[#ead8cf] dark:border-[#6a5044] dark:bg-[#4a332a]'>
            <span className='h-3 w-3 rounded-full bg-[#d97757] dark:bg-[#e09a7a]' />
          </div>
          <h1 className='mb-2 font-display text-4xl font-semibold tracking-normal text-[#141413] dark:text-[#f8f6f0]'>
            {siteName}
          </h1>
          <p className='text-sm font-medium text-[#5e5d59] dark:text-[#b7b1a8]'>
            欢迎回来，请登录您的账户
          </p>
        </div>

        <form onSubmit={handleSubmit} className='space-y-6'>
          {shouldAskUsername && (
            <div className='group'>
              <label
                htmlFor='username'
                className='block text-sm font-medium text-[#30302e] dark:text-[#d9d3c9] mb-2'
              >
                用户名
              </label>
              <div className='relative'>
                <div className='absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none'>
                  <User className='h-5 w-5 text-[#8b867d] transition-colors group-focus-within:text-[#b85c38] dark:text-[#9a9388] dark:group-focus-within:text-[#f0b195]' />
                </div>
                <input
                  id='username'
                  type='text'
                  autoComplete='username'
                  className='block w-full rounded-md border border-[#d8d3c7] bg-[#faf9f5]/80 py-3.5 pl-12 pr-4 text-[#141413] shadow-sm outline-none transition-all duration-200 placeholder:text-[#8b867d] hover:border-[#cbbfaf] focus:border-[#b85c38] focus:ring-2 focus:ring-[#ead8cf] dark:border-[#4a463f] dark:bg-[#302d29]/80 dark:text-[#f8f6f0] dark:placeholder:text-[#9a9388] dark:hover:border-[#6a6358] dark:focus:border-[#e09a7a] dark:focus:ring-[#4a332a] sm:text-base'
                  placeholder='请输入用户名'
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>
            </div>
          )}

          <div className='group'>
            <label
              htmlFor='password'
              className='block text-sm font-medium text-[#30302e] dark:text-[#d9d3c9] mb-2'
            >
              密码
            </label>
            <div className='relative'>
              <div className='absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none'>
                <Lock className='h-5 w-5 text-[#8b867d] transition-colors group-focus-within:text-[#b85c38] dark:text-[#9a9388] dark:group-focus-within:text-[#f0b195]' />
              </div>
              <input
                id='password'
                type='password'
                autoComplete='current-password'
                className='block w-full rounded-md border border-[#d8d3c7] bg-[#faf9f5]/80 py-3.5 pl-12 pr-4 text-[#141413] shadow-sm outline-none transition-all duration-200 placeholder:text-[#8b867d] hover:border-[#cbbfaf] focus:border-[#b85c38] focus:ring-2 focus:ring-[#ead8cf] dark:border-[#4a463f] dark:bg-[#302d29]/80 dark:text-[#f8f6f0] dark:placeholder:text-[#9a9388] dark:hover:border-[#6a6358] dark:focus:border-[#e09a7a] dark:focus:ring-[#4a332a] sm:text-base'
                placeholder='请输入访问密码'
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          {error && (
            <div className='flex items-center gap-2 p-3 rounded-md bg-[#f8e7df] dark:bg-[#4a2c24] border border-[#e5b9a8] dark:border-[#7a4a3c] animate-slide-down'>
              <AlertCircle className='h-4 w-4 text-[#b85c38] dark:text-[#f0b195] flex-shrink-0' />
              <p className='text-sm text-[#8f4329] dark:text-[#f0b195]'>
                {error}
              </p>
            </div>
          )}

          {/* 登录按钮 */}
          <button
            type='submit'
            disabled={!password || loading || (shouldAskUsername && !username)}
            className='group relative inline-flex w-full justify-center items-center gap-2 rounded-md border border-[#b85c38]/30 bg-[#d97757] py-3.5 text-base font-semibold text-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#b85c38] hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:bg-[#d97757] dark:border-[#f0b195]/30 dark:bg-[#e09a7a] dark:text-[#141413] dark:hover:bg-[#f0b195]'
          >
            <Lock className='h-5 w-5' />
            {loading ? '登录中...' : '立即登录'}
          </button>

          {/* 注册链接 - 仅在非 localStorage 模式下显示 */}
          {shouldAskUsername && (
            <div className='mt-6 pt-6 border-t border-[#e8e6dc] dark:border-[#3d3934]'>
              <p className='text-center text-[#5e5d59] dark:text-[#b7b1a8] text-sm mb-3'>
                还没有账户？
              </p>
              <a
                href='/register'
                className='group flex items-center justify-center gap-2 w-full px-6 py-2.5 rounded-md bg-[#f0eee6] dark:bg-[#302d29] border border-[#d8d3c7] dark:border-[#4a463f] text-[#8f4329] dark:text-[#f0b195] text-sm font-semibold hover:border-[#d97757] transition-all duration-200 hover:shadow-sm'
              >
                <UserPlus className='w-4 h-4' />
                <span>立即注册</span>
                <span className='inline-block transition-transform group-hover:translate-x-1'>
                  →
                </span>
              </a>
            </div>
          )}
        </form>

        {/* Telegram Magic Link 登录 */}
        {telegramEnabled && (
          <div className='mt-6 pt-6 border-t border-[#e8e6dc] dark:border-[#3d3934]'>
            <p className='text-center text-[#5e5d59] dark:text-[#b7b1a8] text-sm mb-4'>
              或使用 Telegram 登录
            </p>

            {/* Telegram 用户名输入 */}
            <div className='mb-4'>
              <label className='block text-sm font-medium text-[#30302e] dark:text-[#d9d3c9] mb-2'>
                Telegram 用户名
              </label>
              <div className='relative'>
                <div className='absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none'>
                  <Send className='h-5 w-5 text-[#8b867d] dark:text-[#9a9388]' />
                </div>
                <input
                  type='text'
                  value={telegramUsername}
                  onChange={(e) => setTelegramUsername(e.target.value)}
                  placeholder='输入您的 Telegram 用户名'
                  className='block w-full rounded-md border border-[#d8d3c7] bg-[#faf9f5]/80 py-3 pl-10 pr-3 text-[#141413] shadow-sm outline-none transition-all placeholder:text-[#8b867d] focus:border-[#b85c38] focus:ring-2 focus:ring-[#ead8cf] dark:border-[#4a463f] dark:bg-[#302d29]/80 dark:text-[#f8f6f0] dark:placeholder:text-[#9a9388] dark:focus:border-[#e09a7a] dark:focus:ring-[#4a332a]'
                  disabled={telegramLoading}
                />
              </div>
              <p className='mt-2 text-xs text-[#5e5d59] dark:text-[#b7b1a8]'>
                输入您的 Telegram 用户名（不含 @）
              </p>
            </div>

            <button
              onClick={handleTelegramLogin}
              disabled={telegramLoading || !telegramUsername.trim()}
              className='group relative inline-flex w-full justify-center items-center gap-2 rounded-md border border-[#d8d3c7] bg-[#141413] py-3.5 text-base font-semibold text-[#faf9f5] shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#30302e] hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 dark:border-[#4a463f] dark:bg-[#f8f6f0] dark:text-[#141413] dark:hover:bg-[#d9d3c9]'
            >
              <Send className='h-5 w-5' />
              {telegramLoading ? '正在打开 Telegram...' : '通过 Telegram 登录'}
            </button>

            {telegramDeepLink && (
              <div className='mt-4 p-4 rounded-md bg-[#f0eee6] dark:bg-[#302d29] border border-[#d8d3c7] dark:border-[#4a463f]'>
                <p className='text-sm text-[#30302e] dark:text-[#d9d3c9] mb-2'>
                  已在新标签页打开 Telegram
                </p>
                <p className='text-xs text-[#5e5d59] dark:text-[#b7b1a8]'>
                  如果没有自动打开，请点击{' '}
                  <a
                    href={telegramDeepLink}
                    target='_blank'
                    rel='noopener noreferrer'
                    className='underline font-semibold text-[#8f4329] dark:text-[#f0b195]'
                  >
                    这里
                  </a>
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 版本信息显示 */}
      <VersionDisplay />

      {/* 留言按钮 */}
      <button
        onClick={() => setShowFeedbackModal(true)}
        className='fixed bottom-4 right-4 z-20 flex items-center gap-2 px-4 py-2 rounded-md border border-[#e8e6dc] bg-white/90 dark:bg-[#24221f]/90 dark:border-[#3d3934] backdrop-blur-sm shadow-sm hover:shadow-md transition-all duration-200 text-[#30302e] dark:text-[#d9d3c9] hover:-translate-y-0.5'
      >
        <MessageSquare className='w-4 h-4' />
        <span className='text-sm font-medium'>留言反馈</span>
      </button>

      {/* 留言弹窗 */}
      {showFeedbackModal && (
        <div className='fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#141413]/45 backdrop-blur-sm animate-fade-in'>
          <div className='relative w-full max-w-md rounded-lg border border-[#e8e6dc] bg-white p-6 shadow-[0_24px_70px_rgba(48,48,46,0.18)] animate-slide-up dark:border-[#3d3934] dark:bg-[#24221f] dark:shadow-[0_24px_70px_rgba(0,0,0,0.42)]'>
            <button
              onClick={() => setShowFeedbackModal(false)}
              className='absolute top-4 right-4 p-1 rounded-md hover:bg-[#f0eee6] dark:hover:bg-[#302d29] transition-colors'
            >
              <X className='w-5 h-5 text-[#5e5d59] dark:text-[#b7b1a8]' />
            </button>

            <div className='text-center mb-6'>
              <div className='inline-flex items-center justify-center w-12 h-12 mb-3 rounded-md border border-[#d8c0b4] bg-[#ead8cf] dark:border-[#6a5044] dark:bg-[#4a332a]'>
                <MessageSquare className='w-6 h-6 text-[#b85c38] dark:text-[#f0b195]' />
              </div>
              <h2 className='font-display text-xl font-semibold text-[#141413] dark:text-[#f8f6f0]'>
                留言反馈
              </h2>
              <p className='text-sm text-[#5e5d59] dark:text-[#b7b1a8] mt-1'>
                有问题或建议？请留言告诉我们
              </p>
            </div>

            {feedbackSuccess ? (
              <div className='flex flex-col items-center py-8'>
                <CheckCircle className='w-16 h-16 text-[#b85c38] dark:text-[#f0b195] mb-4' />
                <p className='text-lg font-medium text-[#141413] dark:text-[#f8f6f0]'>
                  留言提交成功！
                </p>
                <p className='text-sm text-[#5e5d59] dark:text-[#b7b1a8] mt-1'>
                  感谢您的反馈
                </p>
              </div>
            ) : (
              <div className='space-y-4'>
                <div>
                  <label className='block text-sm font-medium text-[#30302e] dark:text-[#d9d3c9] mb-1'>
                    用户名（可选）
                  </label>
                  <input
                    type='text'
                    value={feedbackUsername}
                    onChange={(e) => setFeedbackUsername(e.target.value)}
                    placeholder='输入您的用户名方便我们回复'
                    className='w-full px-4 py-2.5 rounded-md border border-[#d8d3c7] dark:border-[#4a463f] bg-[#faf9f5] dark:bg-[#302d29] text-[#141413] dark:text-[#f8f6f0] placeholder:text-[#8b867d] dark:placeholder:text-[#9a9388] focus:ring-2 focus:ring-[#ead8cf] dark:focus:ring-[#4a332a] focus:border-[#b85c38] dark:focus:border-[#e09a7a] outline-none transition-all'
                  />
                </div>
                <div>
                  <label className='block text-sm font-medium text-[#30302e] dark:text-[#d9d3c9] mb-1'>
                    留言内容 *
                  </label>
                  <textarea
                    value={feedbackContent}
                    onChange={(e) => setFeedbackContent(e.target.value)}
                    placeholder='请输入您的留言内容...'
                    rows={4}
                    maxLength={500}
                    className='w-full px-4 py-2.5 rounded-md border border-[#d8d3c7] dark:border-[#4a463f] bg-[#faf9f5] dark:bg-[#302d29] text-[#141413] dark:text-[#f8f6f0] placeholder:text-[#8b867d] dark:placeholder:text-[#9a9388] focus:ring-2 focus:ring-[#ead8cf] dark:focus:ring-[#4a332a] focus:border-[#b85c38] dark:focus:border-[#e09a7a] outline-none transition-all resize-none'
                  />
                  <p className='text-xs text-[#8b867d] dark:text-[#9a9388] text-right mt-1'>
                    {feedbackContent.length}/500
                  </p>
                </div>
                <button
                  onClick={handleFeedbackSubmit}
                  disabled={feedbackLoading || !feedbackContent.trim()}
                  className='w-full flex items-center justify-center gap-2 py-3 rounded-md border border-[#b85c38]/30 bg-[#d97757] hover:bg-[#b85c38] text-white font-semibold shadow-sm transition-all duration-200 hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed dark:border-[#f0b195]/30 dark:bg-[#e09a7a] dark:text-[#141413] dark:hover:bg-[#f0b195]'
                >
                  <Send className='w-4 h-4' />
                  {feedbackLoading ? '提交中...' : '提交留言'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <LoginPageClient />
    </Suspense>
  );
}
