/* eslint-disable @typescript-eslint/no-explicit-any */

'use client';

import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Loader2,
  Maximize2,
  Minimize2,
  Play,
  RotateCw,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';


interface VideoItem {
  id: string;
  url: string;
  timestamp: number;
}

interface Category {
  id: string;
  name: string;
  apiUrl: string;
}

const createVideoId = () =>
  `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

// 栏目配置
const CATEGORIES: Category[] = [
  {
    id: 'featured',
    name: '精选',
    apiUrl: 'http://api.yujn.cn/api/zzxjj.php?type=video',
  },
  {
    id: 'selfie',
    name: '自拍',
    apiUrl: 'https://api.yujn.cn/api/duilian.php?type=video',
  },
  {
    id: 'recommend',
    name: '推荐',
    apiUrl: 'https://api.yujn.cn/api/xjj.php?type=video',
  },
  {
    id: 'female',
    name: '女大',
    apiUrl: 'https://api.yujn.cn/api/nvda.php?type=video',
  },
  {
    id: 'suspenders',
    name: '吊带',
    apiUrl: 'http://api.yujn.cn/api/diaodai.php?type=video',
  },
  {
    id: 'pure',
    name: '清纯',
    apiUrl: 'http://api.yujn.cn/api/qingchun.php?type=video',
  },
  {
    id: 'schoolgirl',
    name: '女高',
    apiUrl: 'http://api.yujn.cn/api/nvgao.php?type=video',
  },
  {
    id: 'sweet',
    name: '甜妹',
    apiUrl: 'http://api.yujn.cn/api/tianmei.php?type=video',
  },
  {
    id: 'jade',
    name: '玉足',
    apiUrl: 'http://api.yujn.cn/api/jpmt.php?type=video',
  },
  {
    id: 'black',
    name: '黑丝',
    apiUrl: 'http://api.yujn.cn/api/heisis.php?type=video',
  },
  {
    id: 'white',
    name: '白丝',
    apiUrl: 'http://api.yujn.cn/api/baisis.php?type=video',
  },
  {
    id: 'cosplay',
    name: 'cosplay',
    apiUrl: 'https://api.yujn.cn/api/manzhan.php?type=video',
  },
];

// 播放器池配置 - 简化配置，减少复杂度
const PLAYER_POOL_SIZE = 1; // 简化为单个播放器
const PRELOAD_COUNT = 3; // 预加载视频数量

// 播放器实例接口
interface PlayerInstance {
  id: number;
  videoId: string | null;
  url: string | null;
}

// 播放器实例组件
interface VideoPlayerProps {
  playerId: number;
  videoId: string | null;
  url: string | null;
  isActive: boolean;
  muted: boolean;
  onEnded?: () => void;
  onError?: () => void;
  onClick?: () => void;
}

const VideoPlayer: React.FC<VideoPlayerProps> = ({
  playerId,
  videoId,
  url,
  isActive,
  muted,
  onEnded,
  onError,
  onClick,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const prevUrlRef = useRef<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const element = videoRef.current;
    if (!element || !url) return;

    // URL变化时重新加载
    if (prevUrlRef.current !== url) {
      setIsLoaded(false);
      element.src = url;
      element.load();
      prevUrlRef.current = url;
    }

    if (isActive && isLoaded) {
      element.currentTime = 0;
      element.play().catch((error) => {
        console.log('视频播放失败:', error);
        // 静默处理播放失败
      });
    } else {
      element.pause();
    }
  }, [url, isActive, isLoaded]);

  // 视频加载完成处理
  const handleLoadedData = useCallback(() => {
    setIsLoaded(true);
    if (isActive && videoRef.current) {
      videoRef.current.play().catch((error) => {
        console.log('视频播放失败:', error);
      });
    }
  }, [isActive]);

  // 视频加载错误处理
  const handleError = useCallback(() => {
    console.log('视频加载错误，播放器ID:', playerId, '视频ID:', videoId);
    setIsLoaded(false);
    if (onError && isActive) {
      onError();
    }
  }, [onError, isActive, playerId, videoId]);

  if (!url) return null;

  return (
    <video
      ref={videoRef}
      className='absolute inset-0 w-full h-full object-contain'
      playsInline
      muted={muted}
      preload='auto'
      onLoadedData={handleLoadedData}
      onEnded={onEnded}
      onClick={onClick}
      onError={handleError}
      data-player-id={playerId}
      data-video-id={videoId}
      style={{
        opacity: isActive && isLoaded ? 1 : 0,
        transition: 'opacity 0.3s',
        zIndex: isActive ? 10 : 1,
        display: isActive && isLoaded ? 'block' : 'none',
      }}
    />
  );
};

export default function ShortVideoPage() {
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedCategory, setSelectedCategory] = useState<string>('featured');
  const [autoPlay, setAutoPlay] = useState(true);
  const [muted, setMuted] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [controlsCollapsed, setControlsCollapsed] = useState(false);
  const [showSwipeHint, setShowSwipeHint] = useState(true);
  const [showKeyboardHint, setShowKeyboardHint] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const touchStartY = useRef<number>(0);
  const isTransitioning = useRef(false);
  const isFetchingRef = useRef(false);
  const lastSwipeTime = useRef<number>(0);

  const currentVideo = videos[currentIndex];

  
  const handleVideoClick = useCallback(() => {
    const videoElement = containerRef.current?.querySelector('video') as HTMLVideoElement;
    if (videoElement) {
      if (videoElement.paused) {
        videoElement.play().catch(() => {
          console.log('视频播放失败');
        });
      } else {
        videoElement.pause();
      }
    }
  }, []);

  // 全屏/退出全屏
  const toggleFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        // 进入全屏
        await containerRef.current?.requestFullscreen();
      } else {
        // 退出全屏
        await document.exitFullscreen();
      }
    } catch (err) {
      console.error('全屏操作失败:', err);
    }
  }, []);

  // 监听全屏状态变化
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  // 禁用页面滚动，提供沉浸体验
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  // 页面卸载时清理视频资源，防止内存泄漏
  useEffect(() => {
    const cleanupVideos = () => {
      const videoElements =
        containerRef.current?.querySelectorAll('video') || [];
      videoElements.forEach((video) => {
        const videoEl = video as HTMLVideoElement;
        videoEl.src = ''; // 清空视频源
        videoEl.load(); // 调用load()来释放资源
      });
    };

    // 页面卸载前清理
    const handleBeforeUnload = () => {
      cleanupVideos();
    };

    // 组件卸载时清理
    return () => {
      cleanupVideos();
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  // 自动隐藏移动端滑动提示
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowSwipeHint(false);
    }, 3000); // 3秒后自动隐藏

    return () => clearTimeout(timer);
  }, []);

  // 自动隐藏PC端键盘提示
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowKeyboardHint(false);
    }, 3000); // 3秒后自动隐藏

    return () => clearTimeout(timer);
  }, []);

  const fetchVideoUrl = useCallback(
    async (category?: string) => {
      if (isFetchingRef.current) return null;

      isFetchingRef.current = true;
      setError(null);

      try {
        const currentCategory = category || selectedCategory;
        const categoryData = CATEGORIES.find((c) => c.id === currentCategory);

        if (!categoryData) {
          throw new Error('无效的栏目');
        }

        const response = await fetch('/api/shortvideo/fetch', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ apiUrl: categoryData.apiUrl }),
        });

        let data;
        try {
          const responseText = await response.text();

          // 检查是否是HTML错误页面
          if (
            responseText.trim().startsWith('<!DOCTYPE') ||
            responseText.trim().startsWith('<html')
          ) {
            throw new Error('API返回了错误页面，请稍后重试');
          }

          // 尝试解析JSON
          data = JSON.parse(responseText);
        } catch (parseError) {
          if (parseError instanceof SyntaxError) {
            throw new Error('API响应格式错误，请稍后重试');
          } else {
            throw parseError;
          }
        }

        if (!response.ok || !data?.success || !data?.url) {
          throw new Error(data?.message || data?.error || '获取视频失败');
        }

        return {
          id: createVideoId(),
          url: data.url,
          timestamp: data.timestamp ?? Date.now(),
        };
      } catch (err) {
        setError(err instanceof Error ? err.message : '网络错误');
        return null;
      } finally {
        isFetchingRef.current = false;
      }
    },
    [selectedCategory]
  );

  // 初始化加载和栏目切换
  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      // 重置获取状态
      isFetchingRef.current = false;
      const video = await fetchVideoUrl(selectedCategory);
      if (video && !cancelled) {
        setVideos([video]);
        setCurrentIndex(0);
      }
    };
    init();
    return () => {
      cancelled = true;
    };
    // 只依赖 selectedCategory，避免循环依赖
  }, [selectedCategory]);

  // 预加载视频
  useEffect(() => {
    if (!videos.length) return;

    const remainingVideos = videos.length - currentIndex - 1;
    if (remainingVideos >= PRELOAD_COUNT || isFetchingRef.current) return;

    const preload = async () => {
      const video = await fetchVideoUrl();
      if (video) {
        setVideos((prev) => [...prev, video]);
      }
    };
    preload();
  }, [videos.length, currentIndex, fetchVideoUrl]);

  const goToNext = useCallback(() => {
    if (isTransitioning.current || currentIndex >= videos.length - 1) return;
    isTransitioning.current = true;
    setCurrentIndex((prev) => prev + 1);
    setTimeout(() => {
      isTransitioning.current = false;
    }, 300);
  }, [currentIndex, videos.length]);

  const goToPrevious = useCallback(() => {
    if (isTransitioning.current || currentIndex <= 0) return;
    isTransitioning.current = true;
    setCurrentIndex((prev) => prev - 1);
    setTimeout(() => {
      isTransitioning.current = false;
    }, 300);
  }, [currentIndex]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      const diff = touchStartY.current - e.changedTouches[0].clientY;
      const now = Date.now();

      if (now - lastSwipeTime.current < 300 || Math.abs(diff) < 50) return;

      setShowSwipeHint(false);
      lastSwipeTime.current = now;

      diff > 0 ? goToNext() : goToPrevious();
    },
    [goToNext, goToPrevious]
  );

  const handleWheel = useCallback(
    (e: WheelEvent) => {
      const now = Date.now();
      if (now - lastSwipeTime.current < 300) return;
      e.preventDefault();
      lastSwipeTime.current = now;
      e.deltaY > 0 ? goToNext() : goToPrevious();
    },
    [goToNext, goToPrevious]
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const now = Date.now();
      if (now - lastSwipeTime.current < 300) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        lastSwipeTime.current = now;
        goToNext();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        lastSwipeTime.current = now;
        goToPrevious();
      } else if (e.key === ' ') {
        e.preventDefault();
        handleVideoClick();
      }
    },
    [goToNext, goToPrevious, handleVideoClick]
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener('wheel', handleWheel, { passive: false });
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      container.removeEventListener('wheel', handleWheel);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleWheel, handleKeyDown]);

  const handleRetry = useCallback(async () => {
    const video = await fetchVideoUrl();
    if (!video) return;

    if (!videos.length) {
      setVideos([video]);
      setCurrentIndex(0);
    } else {
      setVideos((prev) => {
        const updated = [...prev];
        updated[currentIndex] = video;
        return updated;
      });
    }
  }, [fetchVideoUrl, videos.length, currentIndex]);

  // 处理视频加载错误，自动跳过失效视频
  const handleVideoError = useCallback(async () => {
    console.log('视频加载失败，尝试获取新视频并自动跳过');

    // 静默获取新视频，不设置全局错误状态
    try {
      const newVideo = await fetchVideoUrl();
      if (!newVideo) return;

      setVideos((prev) => {
        const updated = [...prev];
        if (updated.length > currentIndex) {
          updated[currentIndex] = newVideo;
        }
        return updated;
      });

      // 如果是自动播放模式，自动跳到下一个视频
      if (autoPlay) {
        setTimeout(() => {
          goToNext();
        }, 500); // 延迟500ms跳过，给新视频一点加载时间
      }
    } catch (error) {
      console.log('自动获取新视频失败:', error);
      // 即使获取新视频失败，也继续播放下一个
      if (autoPlay) {
        setTimeout(() => {
          goToNext();
        }, 500);
      }
    }
  }, [fetchVideoUrl, currentIndex, autoPlay, goToNext]);

  const handleCategoryChange = useCallback(
    async (categoryId: string) => {
      setSelectedCategory(categoryId);
      setVideos([]);
      setCurrentIndex(0);
      setError(null);
      isFetchingRef.current = false; // 重置获取状态

      // 立即获取第一个视频
      try {
        const video = await fetchVideoUrl(categoryId);
        if (video) {
          setVideos([video]);
          setCurrentIndex(0);
        }
      } catch (error) {
        console.error('栏目切换获取视频失败:', error);
      }
    },
    [fetchVideoUrl]
  );

  return (
    <div className='min-h-screen bg-black'>
      {/* 自定义Header - 精致化缩小版本 */}
      <div className='fixed top-0 left-0 right-0 z-50 bg-white/30 backdrop-blur-2xl border-b border-gray-200/40 shadow-xl dark:bg-gray-900/60 dark:border-gray-700/40 transition-all duration-300'>
        <div className='container mx-auto px-4 h-16 flex items-center justify-between'>
          <div className='flex items-center gap-2'>
            <a href="/" className='text-lg font-semibold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent dark:from-blue-400 dark:to-purple-400 hover:opacity-80 transition-opacity'>
              卡拉米影视
            </a>
          </div>
          <nav className='hidden md:flex items-center gap-4'>
            <a href='/' className='text-sm text-gray-700 hover:text-blue-600 dark:text-gray-300 dark:hover:text-blue-400 transition-colors'>首页</a>
            <a href='/shortvideo' className='text-sm text-blue-600 dark:text-blue-400 font-medium'>短视频</a>
            <a href='/movie' className='text-sm text-gray-700 hover:text-blue-600 dark:text-gray-300 dark:hover:text-blue-400 transition-colors'>电影</a>
            <a href='/tv' className='text-sm text-gray-700 hover:text-blue-600 dark:text-gray-300 dark:hover:text-blue-400 transition-colors'>剧集</a>
          </nav>
        </div>
      </div>

      <div
        ref={containerRef}
        className='fixed inset-0 bg-black text-white overflow-hidden'
        style={{
          paddingTop: '4rem', // 64px for header height + space to avoid overlap
          height: '100vh',
          boxSizing: 'border-box',
        }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
      {/* 左侧栏目选择菜单 */}
      <div
        className='absolute left-0 top-0 bottom-0 z-20 bg-black/60 backdrop-blur-md w-14 md:w-16 items-center gap-1.5 overflow-y-auto scrollbar-hide'
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-start',
          alignItems: 'center',
          paddingTop: '5rem', // 避开头部导航栏 (4rem + 1rem extra for better alignment)
        }}
      >
        {CATEGORIES.map((category) => (
          <button
            key={category.id}
            data-category-id={category.id}
            onClick={() => handleCategoryChange(category.id)}
            className={`w-10 h-10 md:w-12 md:h-12 rounded-full text-xs font-medium transition-all duration-300 flex items-center justify-center text-center ${
              selectedCategory === category.id
                ? 'bg-white/20 text-white shadow-lg scale-105'
                : 'bg-white/10 text-white/70 hover:bg-white/15 hover:text-white hover:scale-100'
            }`}
            title={category.name}
          >
            <span className='truncate px-0.5'>{category.name}</span>
          </button>
        ))}
      </div>

      {/* 合并的全局样式 */}
      <style jsx global>{`
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }

  
        /* PC端左侧栏目栏样式优化 */
        @media (min-width: 640px) {
          .pc-category-button {
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          }

          .pc-category-button:hover {
            transform: translateX(2px) scale(1.05);
          }

          .pc-category-button.active {
            background: rgba(255, 255, 255, 0.2);
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
            transform: translateX(2px) scale(1.05);
          }
        }

        /* 在短视频页面隐藏移动端底部导航和禁用滚动 */
        @media (max-width: 768px) {
          body {
            overflow: hidden;
          }
        }
      `}</style>

      {/* 视频区 - 简化的播放器，考虑左侧栏目空间 */}
      <div className='relative w-full h-full flex items-center justify-center overflow-hidden bg-black ml-14 md:ml-16'>
        {/* 只渲染当前视频播放器 */}
        {currentVideo && currentVideo.url && (
          <video
            key={currentVideo.id}
            src={currentVideo.url}
            className='w-full h-full object-contain'
            playsInline
            muted={muted}
            autoPlay={autoPlay}
            controls={false}
            onClick={handleVideoClick}
            onEnded={() => autoPlay && goToNext()}
            onError={handleVideoError}
            preload='auto'
            style={{
              maxHeight: '100vh',
              maxWidth: 'calc(100% - 4rem)', /* 减去左侧栏目宽度 */
            }}
          />
        )}

        {!videos.length && (
          <div className='absolute inset-0 flex flex-col items-center justify-center gap-4'>
            <Loader2 className='w-10 h-10 animate-spin' />
            <p className='text-sm text-white/70'>正在加载短视频...</p>
          </div>
        )}

        {/* 视频加载错误时的占位 */}
        {videos.length > 0 && (!currentVideo || !currentVideo.url) && (
          <div className='absolute inset-0 flex flex-col items-center justify-center gap-4'>
            <p className='text-sm text-white/70'>视频加载中...</p>
          </div>
        )}
      </div>

      {/* 控制按钮组 - 收起时隐藏 */}
      <div
        className={`absolute right-3 bottom-20 md:bottom-12 flex flex-col gap-2 md:gap-3 z-20 transition-all duration-300 ${
          controlsCollapsed
            ? 'opacity-0 invisible translate-x-16 pointer-events-none'
            : 'opacity-100 visible translate-x-0 pointer-events-auto'
        }`}
      >
        <button
          onClick={() => setMuted((prev) => !prev)}
          className={`group relative w-8 h-8 md:w-10 md:h-10 rounded-full backdrop-blur-sm transition-all duration-300 ${
            muted
              ? 'bg-white/10 hover:bg-white/15'
              : 'bg-green-500/60 hover:bg-green-500/80'
          }`}
          title={muted ? '点击开启声音' : '点击关闭声音'}
        >
          {muted ? (
            <VolumeX className='w-4 h-4 md:w-5 md:h-5 text-white absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2' />
          ) : (
            <Volume2 className='w-4 h-4 md:w-5 md:h-5 text-white absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2' />
          )}
          <div className='absolute right-full mr-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none'>
            <div className='bg-black/70 text-white text-xs px-1.5 py-1 rounded-md whitespace-nowrap'>
              {muted ? '静音' : '声音已开'}
            </div>
          </div>
        </button>

        <button
          onClick={toggleFullscreen}
          className='group relative w-8 h-8 md:w-10 md:h-10 rounded-full backdrop-blur-sm transition-all duration-300 bg-white/10 hover:bg-white/15'
          title={isFullscreen ? '退出全屏' : '进入全屏'}
        >
          {isFullscreen ? (
            <Minimize2 className='w-4 h-4 md:w-5 md:h-5 text-white absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2' />
          ) : (
            <Maximize2 className='w-4 h-4 md:w-5 md:h-5 text-white absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2' />
          )}
          <div className='absolute right-full mr-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none'>
            <div className='bg-black/70 text-white text-xs px-1.5 py-1 rounded-md whitespace-nowrap'>
              {isFullscreen ? '退出全屏' : '进入全屏'}
            </div>
          </div>
        </button>

        <button
          onClick={() => setAutoPlay((prev) => !prev)}
          className={`group relative w-8 h-8 md:w-10 md:h-10 rounded-full backdrop-blur-sm transition-all duration-300 ${
            autoPlay
              ? 'bg-green-500/60 hover:bg-green-500/80'
              : 'bg-white/10 hover:bg-white/15'
          }`}
          title={autoPlay ? '自动连播：开启' : '自动连播：关闭'}
        >
          {autoPlay ? (
            <Play className='w-4 h-4 md:w-5 md:h-5 text-white absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2' />
          ) : (
            <RotateCw className='w-4 h-4 md:w-5 md:h-5 text-white absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2' />
          )}
          <div className='absolute right-full mr-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none'>
            <div className='bg-black/70 text-white text-xs px-1.5 py-1 rounded-md whitespace-nowrap'>
              {autoPlay ? '自动播放下一个' : '单个视频循环'}
            </div>
          </div>
        </button>

        <div className='bg-white/10 backdrop-blur-sm rounded-full px-2 py-1 md:px-2.5 md:py-1.5'>
          <p className='text-white text-xs font-medium'>
            {videos.length
              ? `${Math.min(currentIndex + 1, videos.length)}/${videos.length}`
              : '0/0'}
          </p>
        </div>

        {/* 收起按钮 - 工具栏最下面（只在展开状态显示） */}
        <button
          onClick={() => setControlsCollapsed((prev) => !prev)}
          className={`md:hidden group w-10 h-10 rounded-full backdrop-blur-sm transition-all duration-300 bg-white/10 hover:bg-white/15 ${
            controlsCollapsed
              ? 'opacity-0 invisible pointer-events-none'
              : 'opacity-100 visible'
          }`}
          title={controlsCollapsed ? '展开控制面板' : '收起控制面板'}
        >
          <ArrowRight className='w-5 h-5 text-white absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2' />
        </button>
      </div>

      {/* 展开按钮 - 吸附在屏幕边缘的小箭头 */}
      <button
        onClick={() => setControlsCollapsed((prev) => !prev)}
        className={`md:hidden group absolute right-0 z-30 transition-all duration-300 ${
          controlsCollapsed
            ? 'translate-x-0 opacity-100 visible'
            : '-translate-x-full opacity-0 invisible pointer-events-none'
        }`}
        style={{
          bottom: '9rem', // 144px, 调整位置对应新的工具栏高度
        }}
        title={controlsCollapsed ? '展开控制面板' : '收起控制面板'}
      >
        <div className='w-7 h-7 bg-white/10 backdrop-blur-sm hover:bg-white/15 rounded-l-lg flex items-center justify-center shadow-lg ml-0.5'>
          <ArrowLeft className='w-3.5 h-3.5 text-white' />
        </div>
      </button>

      {/* 移动端滑动提示 - 只在showSwipeHint为true时显示，3秒后自动隐藏 */}
      <div
        className={`md:hidden absolute bottom-36 left-4 right-4 z-20 flex items-center justify-center transition-opacity duration-500 ${
          showSwipeHint ? 'opacity-100' : 'opacity-0 invisible'
        }`}
      >
        <div className='flex items-center gap-2 bg-white/10 backdrop-blur-md text-white/70 px-4 py-2 rounded-full text-xs'>
          <ArrowUp className='w-3 h-3' />
          <span>上下滑动切换，点击右下角按钮全屏</span>
          <ArrowDown className='w-3 h-3' />
        </div>
      </div>

      {/* PC端提示 - 移至右上角避免遮挡视频，3秒后自动隐藏 */}
      <div
        className={`hidden md:block absolute top-4 right-4 z-20 transition-opacity duration-500 ${
          showKeyboardHint ? 'opacity-100' : 'opacity-0 invisible'
        }`}
      >
        <div className='bg-black/40 backdrop-blur-md text-white/60 px-3 py-2 rounded-lg text-xs max-w-sm'>
          使用 ↑↓ 键或滚轮切换视频，空格键暂停/播放，点击全屏按钮进入全屏
        </div>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className='absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm z-40 px-6'>
          <div className='w-full max-w-sm bg-white/10 border border-white/20 rounded-2xl p-6 text-center space-y-4'>
            <p className='text-sm leading-relaxed text-white/90'>{error}</p>
            <button
              onClick={handleRetry}
              className='w-full px-4 py-2 bg-white/20 hover:bg-white/30 text-white rounded-lg transition-colors'
            >
              重试
            </button>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
