'use client';

import { HOME_SECTION_ACTION_CLASS } from '@/lib/constants/home';

interface HomeSectionLoadFeedbackProps {
  title: string;
  hasData: boolean;
  loading: boolean;
  loadError: boolean;
  onRetry: () => void | Promise<void>;
}

export default function HomeSectionLoadFeedback({
  title,
  hasData,
  loading,
  loadError,
  onRetry,
}: HomeSectionLoadFeedbackProps) {
  const showRefreshStatus = hasData && (loadError || loading);
  const showEmptyFailure = loadError && !hasData && !loading;

  if (!showRefreshStatus && !showEmptyFailure) return null;

  const handleRetry = () => {
    if (loading) return;
    void onRetry();
  };

  if (showRefreshStatus) {
    return (
      <div
        className='mb-3 flex items-center justify-between gap-3 text-sm text-red-500 dark:text-red-400'
        role={loadError ? 'alert' : 'status'}
      >
        <span>
          {loading
            ? '正在重试，当前显示已有内容'
            : '刷新失败，当前显示已有内容'}
        </span>
        <button
          type='button'
          className={`${HOME_SECTION_ACTION_CLASS} shrink-0 disabled:cursor-not-allowed disabled:opacity-60`}
          onClick={handleRetry}
          disabled={loading}
          aria-label={`重试加载${title}`}
        >
          {loading ? '重试中' : '重试'}
        </button>
      </div>
    );
  }

  return (
    <div
      className='flex flex-col items-center justify-center gap-3 py-12 text-center text-sm text-red-500 dark:text-red-400'
      role='alert'
    >
      <span>{title}加载失败，请稍后重试</span>
      <button
        type='button'
        className={`${HOME_SECTION_ACTION_CLASS} disabled:cursor-not-allowed disabled:opacity-60`}
        onClick={handleRetry}
        disabled={loading}
        aria-label={`重试加载${title}`}
      >
        重试
      </button>
    </div>
  );
}
