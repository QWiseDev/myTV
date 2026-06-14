import { Heart } from 'lucide-react';

interface FavoriteButtonProps {
  favorited: boolean;
  onClick: () => void;
}

const FavoriteIcon = ({ filled }: { filled: boolean }) => {
  if (filled) {
    return (
      <svg
        className='h-7 w-7'
        viewBox='0 0 24 24'
        xmlns='http://www.w3.org/2000/svg'
      >
        <path
          d='M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z'
          fill='#ef4444'
          stroke='#ef4444'
          strokeWidth='2'
          strokeLinecap='round'
          strokeLinejoin='round'
        />
      </svg>
    );
  }
  return (
    <Heart className='h-7 w-7 stroke-[1] text-gray-600 dark:text-gray-300' />
  );
};

export default function FavoriteButton({ favorited, onClick }: FavoriteButtonProps) {
  return (
    <button
      onClick={onClick}
      className='flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 rounded-lg shadow hover:shadow-md transition-all duration-200 border border-gray-200 dark:border-gray-700'
      aria-label={favorited ? '取消收藏' : '收藏'}
    >
      <FavoriteIcon filled={favorited} />
      <span className='text-sm font-medium text-gray-700 dark:text-gray-300'>
        {favorited ? '已收藏' : '收藏'}
      </span>
    </button>
  );
}
