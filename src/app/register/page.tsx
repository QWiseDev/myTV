/* eslint-disable @typescript-eslint/no-explicit-any */

'use client';

import {
  AlertCircle,
  CheckCircle,
  Lock,
  Shield,
  User,
  UserPlus,
} from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

import { useSite } from '@/components/SiteProvider';

function RegisterPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [shouldShowRegister, setShouldShowRegister] = useState(false);
  const [registrationDisabled, setRegistrationDisabled] = useState(false);
  const [disabledReason, setDisabledReason] = useState('');
  const [bingWallpaper, setBingWallpaper] = useState<string>('');

  const { siteName } = useSite();

  // 获取 Bing 每日壁纸（通过代理 API）
  useEffect(() => {
    const fetchBingWallpaper = async () => {
      try {
        const response = await fetch('/api/bing-wallpaper');
        const data = await response.json();
        if (data.url) {
          setBingWallpaper(data.url);
        }
      } catch (error) {
        /* 忽略错误 */
      }
    };

    fetchBingWallpaper();
  }, []);

  // 检查注册是否可用
  useEffect(() => {
    const checkRegistrationAvailable = async () => {
      try {
        // 用空数据检测，这样不会创建用户但能得到正确的错误信息
        const res = await fetch('/api/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: '',
            password: '',
            confirmPassword: '',
          }),
        });

        const data = await res.json();

        // 如果是localStorage模式，跳转登录
        if (data.error === 'localStorage 模式不支持用户注册') {
          router.replace('/login');
          return;
        }

        // 如果是管理员关闭了注册
        if (data.error === '管理员已关闭用户注册功能') {
          setRegistrationDisabled(true);
          setDisabledReason('管理员已关闭用户注册功能');
          setShouldShowRegister(true);
          return;
        }

        // 其他情况显示注册表单（包括用户名已存在等正常的验证错误）
        setShouldShowRegister(true);
      } catch (error) {
        // 网络错误也显示注册页面
        setShouldShowRegister(true);
      }
    };

    checkRegistrationAvailable();
  }, [router]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!username || !password || !confirmPassword) {
      setError('请填写完整信息');
      return;
    }

    if (password !== confirmPassword) {
      setError('两次输入的密码不一致');
      return;
    }

    try {
      setLoading(true);
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          password,
          confirmPassword,
        }),
      });

      if (res.ok) {
        await res.json(); // 读取响应但不使用
        // 显示成功消息，稍等一下再跳转
        setError(null);
        setSuccess('注册成功！正在跳转...');
        // 给用户一个成功提示，然后再跳转
        setTimeout(() => {
          const redirect = searchParams.get('redirect') || '/';
          router.replace(redirect);
        }, 1500); // 1.5秒后跳转，让用户看到成功消息
      } else {
        const data = await res.json();
        setError(data.error ?? '注册失败');
      }
    } catch (error) {
      setError('网络错误，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  if (!shouldShowRegister) {
    return <div>Loading...</div>;
  }

  // 如果注册被禁用，显示提示页面
  if (registrationDisabled) {
    return (
      <div className='relative min-h-screen flex items-center justify-center px-4 overflow-hidden'>
        {/* Bing 每日壁纸背景 */}
        {bingWallpaper && (
          <div
            className='absolute inset-0 bg-cover bg-center bg-no-repeat transition-opacity duration-1000 animate-ken-burns'
            style={{ backgroundImage: `url(${bingWallpaper})` }}
          />
        )}

        {/* 渐变叠加层 */}
        <div className='absolute inset-0 bg-gradient-to-br from-purple-600/40 via-blue-600/30 to-pink-500/40 dark:from-purple-900/50 dark:via-blue-900/40 dark:to-pink-900/50' />
        <div className='absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/30' />

        <div className='relative z-10 w-full max-w-md rounded-3xl bg-gradient-to-br from-white/95 via-white/85 to-white/75 dark:from-zinc-900/95 dark:via-zinc-900/85 dark:to-zinc-900/75 backdrop-blur-2xl shadow-[0_20px_80px_rgba(0,0,0,0.3)] dark:shadow-[0_20px_80px_rgba(0,0,0,0.6)] p-10 border border-white/50 dark:border-zinc-700/50 animate-fade-in hover:shadow-[0_25px_100px_rgba(0,0,0,0.4)] transition-shadow duration-500'>
          {/* 装饰性光效 */}
          <div className='absolute -top-20 -left-20 w-40 h-40 bg-gradient-to-br from-yellow-400/30 to-orange-400/30 rounded-full blur-3xl animate-pulse' />
          <div
            className='absolute -bottom-20 -right-20 w-40 h-40 bg-gradient-to-br from-blue-400/30 to-purple-400/30 rounded-full blur-3xl animate-pulse'
            style={{ animationDelay: '1s' }}
          />

          <div className='text-center mb-8'>
            <div className='inline-flex items-center justify-center w-16 h-16 mb-4 rounded-2xl bg-gradient-to-br from-yellow-500 to-orange-600 shadow-lg shadow-yellow-500/50 dark:shadow-yellow-500/30'>
              <AlertCircle className='w-8 h-8 text-white' />
            </div>
            <h1 className='text-transparent bg-clip-text bg-gradient-to-r from-yellow-600 via-orange-600 to-red-600 dark:from-yellow-400 dark:via-orange-400 dark:to-red-400 tracking-tight text-4xl font-extrabold mb-2 drop-shadow-sm'>
              {siteName}
            </h1>
          </div>
          <div className='text-center space-y-6'>
            <h2 className='text-xl font-semibold text-gray-800 dark:text-gray-200'>
              注册功能暂不可用
            </h2>
            <div className='p-4 rounded-xl bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800/50'>
              <p className='text-gray-700 dark:text-gray-300 text-sm leading-relaxed'>
                {disabledReason || '管理员已关闭用户注册功能'}
              </p>
            </div>
            <p className='text-gray-500 dark:text-gray-500 text-xs'>
              如需注册账户，请联系网站管理员
            </p>
            <button
              onClick={() => router.push('/login')}
              className='group relative inline-flex w-full justify-center items-center gap-2 rounded-xl bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 py-3.5 text-base font-semibold text-white shadow-lg shadow-green-500/30 transition-all duration-300 hover:shadow-xl hover:shadow-green-500/40 hover:-translate-y-0.5 overflow-hidden'
            >
              <span className='absolute inset-0 w-full h-full bg-gradient-to-r from-white/0 via-white/20 to-white/0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000' />
              返回登录 →
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className='relative min-h-screen flex items-center justify-center px-4 overflow-hidden bg-[#0d0d0d]'>
      {/* Bing 每日壁纸背景 */}
      {bingWallpaper && (
        <div
          className='absolute inset-0 bg-cover bg-center bg-no-repeat opacity-40 transition-opacity duration-1000 animate-ken-burns'
          style={{ backgroundImage: `url(${bingWallpaper})` }}
        />
      )}

      {/* 暗色叠加层 */}
      <div className='absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(0,190,6,0.10),transparent_32rem),linear-gradient(180deg,rgba(13,13,13,0.72)_0%,rgba(13,13,13,0.9)_100%)]' />

      <div className='relative z-10 w-full max-w-md rounded-2xl border border-[#2e2e2e] bg-[#161616]/92 backdrop-blur-xl shadow-[0_20px_80px_rgba(0,0,0,0.55)] p-8 sm:p-10 animate-fade-in'>
        {/* 标题区域 */}
        <div className='text-center mb-8'>
          <div className='inline-flex items-center justify-center w-12 h-12 mb-4 rounded-lg bg-[#00be06]/15'>
            <span className='h-3.5 w-3.5 rounded-full bg-[#00be06]' />
          </div>
          <h1 className='text-3xl font-bold text-[#f5f5f5] mb-2'>{siteName}</h1>
          <p className='text-sm text-[#a8a8a8]'>创建您的新账户</p>
        </div>

        <form onSubmit={handleSubmit} className='space-y-5'>
          <div className='group'>
            <label
              htmlFor='username'
              className='block text-sm font-medium text-[#d9d9d9] mb-2'
            >
              用户名
            </label>
            <div className='relative'>
              <div className='absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none'>
                <User className='h-5 w-5 text-[#8c8c8c] transition-colors group-focus-within:text-[#00be06]' />
              </div>
              <input
                id='username'
                type='text'
                autoComplete='username'
                className='block w-full rounded-lg border border-[#3a3a3a] bg-[#2a2a2a] py-3.5 pl-12 pr-4 text-[#f5f5f5] outline-none transition-colors duration-200 placeholder:text-[#8c8c8c] focus:border-[#00be06] focus:ring-2 focus:ring-[#00be06]/20 sm:text-base'
                placeholder='3-20位字母数字下划线'
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
          </div>

          <div className='group'>
            <label
              htmlFor='password'
              className='block text-sm font-medium text-[#d9d9d9] mb-2'
            >
              密码
            </label>
            <div className='relative'>
              <div className='absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none'>
                <Lock className='h-5 w-5 text-[#8c8c8c] transition-colors group-focus-within:text-[#00be06]' />
              </div>
              <input
                id='password'
                type='password'
                autoComplete='new-password'
                className='block w-full rounded-lg border border-[#3a3a3a] bg-[#2a2a2a] py-3.5 pl-12 pr-4 text-[#f5f5f5] outline-none transition-colors duration-200 placeholder:text-[#8c8c8c] focus:border-[#00be06] focus:ring-2 focus:ring-[#00be06]/20 sm:text-base'
                placeholder='至少6位字符'
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          <div className='group'>
            <label
              htmlFor='confirmPassword'
              className='block text-sm font-medium text-[#d9d9d9] mb-2'
            >
              确认密码
            </label>
            <div className='relative'>
              <div className='absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none'>
                <Shield className='h-5 w-5 text-[#8c8c8c] transition-colors group-focus-within:text-[#00be06]' />
              </div>
              <input
                id='confirmPassword'
                type='password'
                autoComplete='new-password'
                className='block w-full rounded-lg border border-[#3a3a3a] bg-[#2a2a2a] py-3.5 pl-12 pr-4 text-[#f5f5f5] outline-none transition-colors duration-200 placeholder:text-[#8c8c8c] focus:border-[#00be06] focus:ring-2 focus:ring-[#00be06]/20 sm:text-base'
                placeholder='再次输入密码'
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
          </div>

          {error && (
            <div className='flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30 animate-slide-down'>
              <AlertCircle className='h-4 w-4 text-red-400 flex-shrink-0' />
              <p className='text-sm text-red-400'>{error}</p>
            </div>
          )}

          {success && (
            <div className='flex items-center gap-2 p-3 rounded-lg bg-[#00be06]/10 border border-[#00be06]/30 animate-slide-down'>
              <CheckCircle className='h-4 w-4 text-[#00be06] flex-shrink-0' />
              <p className='text-sm text-[#4fd06a]'>{success}</p>
            </div>
          )}

          <button
            type='submit'
            disabled={
              !username || !password || !confirmPassword || loading || !!success
            }
            className='inline-flex w-full justify-center items-center gap-2 rounded-lg bg-[#00be06] py-3.5 text-base font-semibold text-white transition-colors duration-200 hover:bg-[#00a304] disabled:cursor-not-allowed disabled:opacity-50'
          >
            <UserPlus className='h-5 w-5' />
            {loading
              ? '注册中...'
              : success
              ? '注册成功，正在跳转...'
              : '立即注册'}
          </button>

          <div className='pt-5 border-t border-[#2e2e2e]'>
            <p className='text-center text-[#a8a8a8] text-sm mb-3'>
              已有账户？
            </p>
            <a
              href='/login'
              className='flex items-center justify-center gap-2 w-full px-6 py-2.5 rounded-lg border border-[#3a3a3a] text-[#f5f5f5] text-sm font-medium hover:border-[#00be06] hover:text-[#00be06] transition-colors'
            >
              <Lock className='w-4 h-4' />
              <span>立即登录</span>
              <span className='inline-block transition-transform group-hover:translate-x-1'>
                →
              </span>
            </a>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <RegisterPageClient />
    </Suspense>
  );
}
