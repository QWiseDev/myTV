'use client';

import {
  ChevronDown,
  ExternalLink,
  MessageSquare,
  RotateCcw,
} from 'lucide-react';
import { memo } from 'react';

import { useDoubanComments } from '@/hooks/useDoubanComments';

import CommentItem from './CommentItem';

interface CommentSectionProps {
  videoDoubanId?: string | number;
}

/**
 * 评论区组件 - 独立拆分以优化性能
 * 使用 React.memo 防止不必要的重新渲染
 */
const CommentSection = memo(function CommentSection({
  videoDoubanId,
}: CommentSectionProps) {
  const { comments, loading, error, hasMore, loadMore } = useDoubanComments(
    String(videoDoubanId || ''),
  );
  if (!videoDoubanId || String(videoDoubanId) === '0') return null;

  return (
    <div className='mt-6 border-t border-gray-200 dark:border-gray-700 pt-6'>
      <h3 className='text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4 flex items-center gap-2'>
        <MessageSquare size={18} aria-hidden />
        <span>豆瓣短评</span>
      </h3>
      <div className='space-y-4'>
        {comments.map((comment) => (
          <CommentItem
            key={
              comment.id ||
              JSON.stringify([comment.user_id, comment.time, comment.content])
            }
            comment={comment}
          />
        ))}
      </div>
      {!loading && !error && comments.length === 0 && (
        <p className='py-6 text-center text-sm text-gray-500'>暂无短评</p>
      )}
      {loading && (
        <p role='status' className='py-4 text-center text-sm text-gray-500'>
          加载中...
        </p>
      )}
      {error && (
        <p role='alert' className='mt-4 text-sm text-red-500'>
          {error}
        </p>
      )}
      {(hasMore || error) && (
        <button
          type='button'
          disabled={loading}
          onClick={() => void loadMore()}
          className='mx-auto mt-4 flex items-center gap-2 rounded-md px-3 py-2 text-sm text-green-600 hover:bg-green-50 disabled:opacity-50 dark:hover:bg-green-950'
        >
          {error ? <RotateCcw size={16} /> : <ChevronDown size={16} />}
          {error ? '重试' : '加载更多'}
        </button>
      )}

      {/* 查看更多链接 */}
      {videoDoubanId && (
        <div className='mt-4 text-center'>
          <a
            href={`https://movie.douban.com/subject/${videoDoubanId}/comments?status=P`}
            target='_blank'
            rel='noopener noreferrer'
            className='inline-flex items-center gap-1 text-sm text-blue-600 dark:text-blue-400 hover:underline'
          >
            在豆瓣查看
            <ExternalLink size={14} />
          </a>
        </div>
      )}
    </div>
  );
});

export default CommentSection;
