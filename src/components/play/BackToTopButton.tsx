import { ChevronUp } from 'lucide-react';

interface BackToTopButtonProps {
  show: boolean;
  onClick: () => void;
}

export default function BackToTopButton({ show, onClick }: BackToTopButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`fixed bottom-6 right-6 z-[500] w-12 h-12 rounded-full shadow-lg backdrop-blur-sm transition-all duration-300 ease-in-out flex items-center justify-center group relative overflow-hidden ${
        show
          ? 'opacity-100 translate-y-0 pointer-events-auto'
          : 'opacity-0 translate-y-4 pointer-events-none'
      }`}
      style={{
        position: 'fixed',
        right: '1.5rem',
        bottom: '1.5rem',
        left: 'auto',
      }}
      aria-label='返回顶部'
    >
      <div className='absolute inset-0 bg-gradient-to-r from-green-500 via-emerald-500 to-teal-500 group-hover:from-green-600 group-hover:via-emerald-600 group-hover:to-teal-600 transition-all duration-300'></div>
      <div className='absolute inset-0 bg-gradient-to-r from-green-400 to-emerald-400 opacity-0 group-hover:opacity-50 blur-md transition-all duration-300'></div>
      <div className='absolute inset-0 rounded-full border-2 border-white/30 animate-ping group-hover:opacity-0 transition-opacity duration-300'></div>
      <ChevronUp className='w-6 h-6 text-white relative z-10 transition-all duration-300 group-hover:scale-110 group-hover:-translate-y-1' />
    </button>
  );
}
