'use client';

import { useCallback, useEffect, useState } from 'react';

import { Feedback } from '@/lib/admin.types';

import { buttonStyles, showError, useAlertModal } from './adminShared';

interface FeedbackPanelProps {
  role: 'owner' | 'admin' | null;
}

const FeedbackPanel = ({ role }: FeedbackPanelProps) => {
  const { alertModal, showAlert } = useAlertModal();
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // 获取留言列表
  const fetchFeedbacks = useCallback(async () => {
    try {
      const res = await fetch('/api/feedback');
      if (res.ok) {
        const data = await res.json();
        setFeedbacks(data.feedbacks || []);
      }
    } catch (error) {
      console.error('获取留言失败', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (role) {
      fetchFeedbacks();
    }
  }, [role, fetchFeedbacks]);

  // 删除留言
  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/feedback?id=${id}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        setFeedbacks((prev) => prev.filter((f) => f.id !== id));
        showAlert({
          type: 'success',
          title: '删除成功',
          message: '留言已删除',
          timer: 2000,
        });
      } else {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || '删除失败');
      }
    } catch (error) {
      showError(error instanceof Error ? error.message : '删除失败', showAlert);
    } finally {
      setDeletingId(null);
    }
  };

  // 标记为已读
  const handleMarkRead = async (id: string, read: boolean) => {
    try {
      const res = await fetch('/api/feedback', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, read }),
      });

      if (res.ok) {
        setFeedbacks((prev) =>
          prev.map((f) => (f.id === id ? { ...f, read } : f))
        );
      }
    } catch (error) {
      console.error('更新状态失败', error);
    }
  };

  // 格式化时间
  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (!role) return null;

  const unreadCount = feedbacks.filter((f) => !f.read).length;

  return (
    <div className='space-y-4'>
      <div className='flex items-center justify-between'>
        <h4 className='text-sm font-medium text-gray-700 dark:text-gray-300'>
          用户留言
          {unreadCount > 0 && (
            <span className='ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'>
              {unreadCount} 条未读
            </span>
          )}
        </h4>
        <button
          onClick={fetchFeedbacks}
          className={buttonStyles.secondary}
          disabled={loading}
        >
          刷新
        </button>
      </div>

      {loading ? (
        <div className='flex justify-center items-center py-8'>
          <div className='animate-spin rounded-full h-6 w-6 border-2 border-blue-300 border-t-blue-600'></div>
        </div>
      ) : feedbacks.length === 0 ? (
        <div className='text-center py-8 text-gray-500 dark:text-gray-400'>
          暂无留言
        </div>
      ) : (
        <div className='space-y-3 max-h-[400px] overflow-y-auto'>
          {feedbacks
            .sort((a, b) => b.createdAt - a.createdAt)
            .map((feedback) => (
              <div
                key={feedback.id}
                className={`p-4 rounded-lg border transition-all ${
                  feedback.read
                    ? 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700'
                    : 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-700'
                }`}
              >
                <div className='flex items-start justify-between gap-4'>
                  <div className='flex-1 min-w-0'>
                    <div className='flex items-center gap-2 mb-2'>
                      <span className='font-medium text-gray-900 dark:text-gray-100'>
                        {feedback.username || '匿名用户'}
                      </span>
                      <span className='text-xs text-gray-500 dark:text-gray-400'>
                        {formatTime(feedback.createdAt)}
                      </span>
                      {!feedback.read && (
                        <span className='inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-800 dark:text-blue-100'>
                          新
                        </span>
                      )}
                    </div>
                    <p className='text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words'>
                      {feedback.content}
                    </p>
                  </div>
                  <div className='flex items-center gap-2 flex-shrink-0'>
                    {!feedback.read && (
                      <button
                        onClick={() => handleMarkRead(feedback.id, true)}
                        className='text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300'
                      >
                        标记已读
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(feedback.id)}
                      disabled={deletingId === feedback.id}
                      className='text-xs text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 disabled:opacity-50'
                    >
                      {deletingId === feedback.id ? '删除中...' : '删除'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
        </div>
      )}

      {/* Alert Modal */}
      {alertModal && (
        <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/50'>
          <div
            className={`p-4 rounded-lg ${
              alertModal.type === 'error'
                ? 'bg-red-50 dark:bg-red-900/50'
                : 'bg-green-50 dark:bg-green-900/50'
            }`}
          >
            <p className='font-medium'>{alertModal.title}</p>
            <p className='text-sm mt-1'>{alertModal.message}</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default FeedbackPanel;
