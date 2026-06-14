'use client';

import { X } from 'lucide-react';

interface AnnouncementModalProps {
  announcement: string;
  isOpen: boolean;
  onClose: (announcement: string) => void;
}

/**
 * 公告弹窗组件 - 用于显示系统公告和提示信息
 */
export default function AnnouncementModal({
  announcement,
  isOpen,
  onClose,
}: AnnouncementModalProps) {
  if (!announcement || !isOpen) {
    return null;
  }

  const handleClose = () => {
    onClose(announcement);
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm dark:bg-black/70 p-4 transition-opacity duration-300 ${
        isOpen ? '' : 'opacity-0 pointer-events-none'
      }`}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          handleClose();
        }
      }}
      style={{
        touchAction: 'none',
      }}
    >
      <div
        className='w-full max-w-md rounded-xl bg-white p-6 shadow-xl dark:bg-gray-900 transform transition-all duration-300 hover:shadow-2xl'
        style={{
          touchAction: 'auto',
        }}
      >
        <div className='flex justify-between items-start mb-4'>
          <h3 className='text-2xl font-bold tracking-tight text-gray-800 dark:text-white border-b border-green-500 pb-1'>
            提示
          </h3>
          <button
            onClick={handleClose}
            className='text-gray-400 hover:text-gray-500 dark:text-gray-500 dark:hover:text-white transition-colors p-1'
            aria-label='关闭提示'
          >
            <X className='w-5 h-5' />
          </button>
        </div>
        <div className='mb-6'>
          <div className='relative overflow-hidden rounded-lg mb-4 bg-green-50 dark:bg-green-900/20'>
            <div className='absolute inset-y-0 left-0 w-1.5 bg-green-500 dark:bg-green-400'></div>
            <p className='ml-4 text-gray-600 dark:text-gray-300 leading-relaxed'>
              {announcement}
            </p>
          </div>
        </div>
        <button
          onClick={handleClose}
          className='w-full rounded-lg bg-gradient-to-r from-green-600 to-green-700 px-4 py-3 text-white font-medium shadow-md hover:shadow-lg hover:from-green-700 hover:to-green-800 dark:from-green-600 dark:to-green-700 dark:hover:from-green-700 dark:hover:to-green-800 transition-all duration-300 transform hover:-translate-y-0.5'
        >
          我知道了
        </button>
      </div>
    </div>
  );
}
