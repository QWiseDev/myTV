'use client';

import {
  AlertCircle,
  CheckCircle,
  Lock,
  Shield,
  User,
  UserPlus,
  X,
} from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import { OPEN_LOGIN_MODAL_EVENT } from '@/lib/login-modal';

type AuthTab = 'login' | 'register';

/**
 * 全局登录弹窗（爱奇艺式）：站内触发登录时弹出，不跳转页面。
 * 登录/注册成功后整页刷新，让 SSR 登录态与客户端缓存一并重建。
 */
export default function LoginModal() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<AuthTab>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const usernameInputRef = useRef<HTMLInputElement>(null);

  // 登录页/注册页自身已有完整表单，弹窗不需要再叠加
  const shouldRender =
    isOpen && pathname !== '/login' && pathname !== '/register';

  const closeModal = useCallback(() => {
    setIsOpen(false);
    setError(null);
    setSuccess(null);
    setUsername('');
    setPassword('');
    setConfirmPassword('');
    setLoading(false);
  }, []);

  useEffect(() => {
    const handleOpenEvent = () => {
      setError(null);
      setSuccess(null);
      setUsername('');
      setPassword('');
      setConfirmPassword('');
      setActiveTab('login');
      setIsOpen(true);
    };

    window.addEventListener(
      OPEN_LOGIN_MODAL_EVENT,
      handleOpenEvent as EventListener,
    );
    return () => {
      window.removeEventListener(
        OPEN_LOGIN_MODAL_EVENT,
        handleOpenEvent as EventListener,
      );
    };
  }, []);

  // 打开时锁定页面滚动并聚焦用户名输入框
  useEffect(() => {
    if (!shouldRender) return undefined;

    usernameInputRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeModal();
      }
    };
    document.addEventListener('keydown', handleKeyDown);

    const body = document.body;
    const html = document.documentElement;
    const originalBodyOverflow = body.style.overflow;
    const originalHtmlOverflow = html.style.overflow;
    body.style.overflow = 'hidden';
    html.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      body.style.overflow = originalBodyOverflow;
      html.style.overflow = originalHtmlOverflow;
    };
  }, [closeModal, shouldRender]);

  // 登录/注册成功后整页刷新：SSR 登录态与客户端缓存一并重建
  const handleAuthSuccess = (message?: string) => {
    if (message) {
      setSuccess(message);
      setTimeout(() => {
        window.location.reload();
      }, 1200);
    } else {
      window.location.reload();
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    if (!password || !username || loading) return;

    try {
      setLoading(true);
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, username }),
      });

      if (res.ok) {
        // 记录登入时间（与 SessionTracker 共用节流键，避免刷新后重复记录）
        try {
          localStorage.setItem('lastRecordedLogin', Date.now().toString());
          await fetch('/api/user/my-stats', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ loginTime: Date.now() }),
          });
        } catch (error) {
          // 登入时间记录失败不影响正常登录流程
        }
        handleAuthSuccess();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(
          data.error ?? (res.status === 401 ? '密码错误' : '服务器错误'),
        );
        setLoading(false);
      }
    } catch (error) {
      setError('网络错误，请稍后重试');
      setLoading(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!username || !password || !confirmPassword || loading) return;

    if (password !== confirmPassword) {
      setError('两次输入的密码不一致');
      return;
    }

    try {
      setLoading(true);
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, confirmPassword }),
      });

      if (res.ok) {
        // 注册接口成功后已自动登录（服务端直接下发认证 cookie）
        localStorage.setItem('lastRecordedLogin', Date.now().toString());
        handleAuthSuccess('注册成功，已自动登录');
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? '注册失败');
        setLoading(false);
      }
    } catch (error) {
      setError('网络错误，请稍后重试');
      setLoading(false);
    }
  };

  if (!shouldRender) return null;

  const inputClassName =
    'block w-full rounded-lg border border-[#3a3a3a]/80 bg-[#2a2a2a]/60 py-3 pl-12 pr-4 text-[#f5f5f5] outline-none transition-colors duration-200 placeholder:text-[#8c8c8c] focus:border-[#00be06] focus:ring-2 focus:ring-[#00be06]/20 sm:text-base';

  return (
    <div
      className='fixed inset-0 z-[1000] flex items-center justify-center p-4 pb-24 bg-black/70 backdrop-blur-sm animate-fade-in'
      onClick={closeModal}
      role='presentation'
    >
      <div
        className='relative w-full max-w-md rounded-2xl border border-[#2e2e2e]/80 bg-[#161616]/75 p-8 shadow-[0_24px_70px_rgba(0,0,0,0.5)] backdrop-blur-2xl animate-scaleIn'
        onClick={(e) => e.stopPropagation()}
        role='dialog'
        aria-modal='true'
        aria-label={activeTab === 'login' ? '登录' : '注册'}
      >
        {/* 关闭按钮 */}
        <button
          onClick={closeModal}
          className='absolute top-4 right-4 p-1 rounded-md hover:bg-[#2a2a2a]/70 transition-colors'
          aria-label='关闭登录弹窗'
        >
          <X className='w-5 h-5 text-[#a8a8a8]' />
        </button>

        {/* 登录/注册 Tab（爱奇艺式弹窗双标签） */}
        <div className='mb-5 flex border-b border-[#2e2e2e]/80'>
          <button
            type='button'
            onClick={() => {
              setActiveTab('login');
              setError(null);
              setSuccess(null);
            }}
            className={`flex-1 pb-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === 'login'
                ? 'border-[#00be06] text-[#00be06]'
                : 'border-transparent text-[#a8a8a8] hover:text-[#f5f5f5]'
            }`}
          >
            登录
          </button>
          <button
            type='button'
            onClick={() => {
              setActiveTab('register');
              setError(null);
              setSuccess(null);
            }}
            className={`flex-1 pb-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === 'register'
                ? 'border-[#00be06] text-[#00be06]'
                : 'border-transparent text-[#a8a8a8] hover:text-[#f5f5f5]'
            }`}
          >
            注册
          </button>
        </div>

        {activeTab === 'login' ? (
          <form onSubmit={handleLoginSubmit} className='space-y-4'>
            <div className='relative'>
              <div className='pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4'>
                <User className='h-5 w-5 text-[#8c8c8c]' />
              </div>
              <input
                ref={usernameInputRef}
                type='text'
                autoComplete='username'
                className={inputClassName}
                placeholder='请输入用户名'
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
            <div className='relative'>
              <div className='pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4'>
                <Lock className='h-5 w-5 text-[#8c8c8c]' />
              </div>
              <input
                type='password'
                autoComplete='current-password'
                className={inputClassName}
                placeholder='请输入密码'
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            {error && (
              <div className='flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 animate-slide-down'>
                <AlertCircle className='h-4 w-4 flex-shrink-0 text-red-400' />
                <p className='text-sm text-red-400'>{error}</p>
              </div>
            )}

            <button
              type='submit'
              disabled={!password || loading || !username}
              className='inline-flex w-full justify-center items-center gap-2 rounded-lg bg-[#00be06] py-3 text-base font-semibold text-white transition-colors duration-200 hover:bg-[#00a304] disabled:cursor-not-allowed disabled:opacity-50'
            >
              <Lock className='h-5 w-5' />
              {loading ? '登录中...' : '立即登录'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleRegisterSubmit} className='space-y-4'>
            <div className='relative'>
              <div className='pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4'>
                <User className='h-5 w-5 text-[#8c8c8c]' />
              </div>
              <input
                type='text'
                autoComplete='username'
                className={inputClassName}
                placeholder='3-20位字母数字下划线'
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
            <div className='relative'>
              <div className='pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4'>
                <Lock className='h-5 w-5 text-[#8c8c8c]' />
              </div>
              <input
                type='password'
                autoComplete='new-password'
                className={inputClassName}
                placeholder='至少8位字符'
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div className='relative'>
              <div className='pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4'>
                <Shield className='h-5 w-5 text-[#8c8c8c]' />
              </div>
              <input
                type='password'
                autoComplete='new-password'
                className={inputClassName}
                placeholder='再次输入密码'
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>

            {error && (
              <div className='flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 animate-slide-down'>
                <AlertCircle className='h-4 w-4 flex-shrink-0 text-red-400' />
                <p className='text-sm text-red-400'>{error}</p>
              </div>
            )}

            {success && (
              <div className='flex items-center gap-2 rounded-lg border border-[#00be06]/30 bg-[#00be06]/10 p-3 animate-slide-down'>
                <CheckCircle className='h-4 w-4 flex-shrink-0 text-[#00be06]' />
                <p className='text-sm text-[#4fd06a]'>{success}</p>
              </div>
            )}

            <button
              type='submit'
              disabled={
                !username ||
                !password ||
                !confirmPassword ||
                loading ||
                !!success
              }
              className='inline-flex w-full justify-center items-center gap-2 rounded-lg bg-[#00be06] py-3 text-base font-semibold text-white transition-colors duration-200 hover:bg-[#00a304] disabled:cursor-not-allowed disabled:opacity-50'
            >
              <UserPlus className='h-5 w-5' />
              {loading
                ? '注册中...'
                : success
                  ? '注册成功，正在跳转...'
                  : '立即注册'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
