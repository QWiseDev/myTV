/* eslint-disable @typescript-eslint/ban-ts-comment, @typescript-eslint/no-explicit-any, react-hooks/exhaustive-deps, no-console, @next/next/no-img-element */

'use client';

import { Radio } from 'lucide-react';
import { Suspense, useEffect, useRef, useState } from 'react';

import { debounce } from '@/lib/channel-search';
import {
  deleteFavorite,
  generateStorageKey,
  isFavorited as checkIsFavorited,
  saveFavorite,
  subscribeToDataUpdates,
} from '@/lib/db.client';
import { cleanEpgData } from '@/lib/live-epg';
import { m3u8Loader } from '@/lib/live-hls';

import PageLayout from '@/components/PageLayout';

import { setupArtplayerGlobals } from '@/app/play/utils/artplayerConfig';

import { ChannelInfoPanel } from './_components/ChannelInfoPanel';
import { ChannelSidebar } from './_components/ChannelSidebar';
import type { LiveChannel, LiveSource } from './hooks/useLiveSources';
import { useLiveSources } from './hooks/useLiveSources';


// 扩展 HTMLVideoElement 类型以支持 hls 属性
declare global {
  interface HTMLVideoElement {
    hls?: any;
  }
}

function LivePageClient() {
  // -----------------------------------------------------------------------------
  // 状态变量（State）
  // -----------------------------------------------------------------------------
  const [error, setError] = useState<string | null>(null);

  // 播放器相关
  const [unsupportedType, setUnsupportedType] = useState<string | null>(null);

  // 切换直播源状态
  const [isSwitchingSource, setIsSwitchingSource] = useState(false);

  // 刷新相关状态
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('live-auto-refresh-enabled');
      return saved ? JSON.parse(saved) : false;
    }
    return false;
  });
  const [autoRefreshInterval, setAutoRefreshInterval] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('live-auto-refresh-interval');
      return saved ? parseInt(saved) : 30; // 默认30分钟
    }
    return 30;
  });
  const autoRefreshTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 分组相关
  const [selectedGroup, setSelectedGroup] = useState<string>('');

  // Tab 切换
  const [activeTab, setActiveTab] = useState<'channels' | 'sources'>(
    'channels'
  );

  // 频道列表收起状态
  const [isChannelListCollapsed, setIsChannelListCollapsed] = useState(false);

  // 搜索相关状态
  const [searchQuery, setSearchQuery] = useState('');
  const [currentSourceSearchResults, setCurrentSourceSearchResults] = useState<
    LiveChannel[]
  >([]);

  // 收藏状态
  const [favorited, setFavorited] = useState(false);
  const favoritedRef = useRef(false);

  // 播放器引用
  const artPlayerRef = useRef<any>(null);
  const artRef = useRef<HTMLDivElement | null>(null);

  // 分组标签滚动相关
  const groupContainerRef = useRef<HTMLDivElement>(null);
  const groupButtonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const channelListRef = useRef<HTMLDivElement>(null);

  // -----------------------------------------------------------------------------
  // DOM 辅助函数（依赖页面持有的 refs 与页面状态，作为回调注入数据层 hook）
  // -----------------------------------------------------------------------------

  // 滚动到指定频道位置的函数
  const scrollToChannel = (channel: LiveChannel) => {
    if (!channelListRef.current) return;

    // 使用 data 属性来查找频道元素
    const targetElement = channelListRef.current.querySelector(
      `[data-channel-id="${channel.id}"]`
    ) as HTMLButtonElement;

    if (targetElement) {
      // 计算滚动位置，使频道居中显示
      const container = channelListRef.current;
      const containerRect = container.getBoundingClientRect();
      const elementRect = targetElement.getBoundingClientRect();

      // 计算目标滚动位置
      const scrollTop =
        container.scrollTop +
        (elementRect.top - containerRect.top) -
        containerRect.height / 2 +
        elementRect.height / 2;

      // 平滑滚动到目标位置
      container.scrollTo({
        top: Math.max(0, scrollTop),
        behavior: 'smooth',
      });
    }
  };

  // 模拟点击分组的函数
  const simulateGroupClick = (group: string, retryCount = 0) => {
    if (!groupContainerRef.current) {
      if (retryCount < 10) {
        setTimeout(() => {
          simulateGroupClick(group, retryCount + 1);
        }, 200);
        return;
      } else {
        return;
      }
    }

    // 直接通过 data-group 属性查找目标按钮
    const targetButton = groupContainerRef.current.querySelector(
      `[data-group="${group}"]`
    ) as HTMLButtonElement;

    if (targetButton) {
      // 手动设置分组状态，确保状态一致性
      setSelectedGroup(group);

      // 触发点击事件
      (targetButton as HTMLButtonElement).click();
    }
  };

  // -----------------------------------------------------------------------------
  // 数据层（直播源 / 频道 / 分组 / EPG 的拉取函数与相关状态）
  // -----------------------------------------------------------------------------
  const {
    loading,
    loadingStage,
    loadingMessage,
    liveSources,
    currentSource,
    setCurrentSource,
    currentSourceRef,
    currentChannels,
    currentChannel,
    setCurrentChannel,
    currentChannelRef,
    groupedChannels,
    filteredChannels,
    setFilteredChannels,
    videoUrl,
    setVideoUrl,
    isVideoLoading,
    setIsVideoLoading,
    epgData,
    setEpgData,
    isEpgLoading,
    setIsEpgLoading,
    isRefreshingSource,
    refreshLiveSources,
    fetchChannels,
  } = useLiveSources({ scrollToChannel, simulateGroupClick, setActiveTab });

  // 设置自动刷新
  const setupAutoRefresh = () => {
    // 清除现有定时器
    if (autoRefreshTimerRef.current) {
      clearInterval(autoRefreshTimerRef.current);
      autoRefreshTimerRef.current = null;
    }

    if (autoRefreshEnabled) {
      const intervalMs = autoRefreshInterval * 60 * 1000; // 转换为毫秒
      autoRefreshTimerRef.current = setInterval(() => {
        refreshLiveSources();
      }, intervalMs);

    }
  };

  // 切换直播源
  const handleSourceChange = async (source: LiveSource) => {
    try {
      // 设置切换状态，锁住频道切换器
      setIsSwitchingSource(true);

      // 首先销毁当前播放器
      cleanupPlayer();

      // 重置不支持的类型状态
      setUnsupportedType(null);

      // 清空节目单信息
      setEpgData(null);

      setCurrentSource(source);
      await fetchChannels(source);
    } catch (err) {
      console.error('切换直播源失败:', err);
      // 不设置错误，保持当前状态
    } finally {
      // 切换完成，解锁频道切换器
      setIsSwitchingSource(false);
      // 自动切换到频道 tab
      setActiveTab('channels');
    }
  };

  // 切换频道
  const handleChannelChange = async (channel: LiveChannel) => {
    // 如果正在切换直播源，则禁用频道切换
    if (isSwitchingSource) return;

    // 首先销毁当前播放器
    cleanupPlayer();

    // 重置不支持的类型状态
    setUnsupportedType(null);

    // 重置错误计数器
    hlsErrorCounters.keyLoadErrorCount = 0;
    hlsErrorCounters.lastErrorTime = 0;

    setCurrentChannel(channel);
    setVideoUrl(channel.url);

    // 自动滚动到选中的频道位置
    setTimeout(() => {
      scrollToChannel(channel);
    }, 100);

    // 获取节目单信息
    if (channel.tvgId && currentSource) {
      try {
        setIsEpgLoading(true); // 开始加载 EPG 数据
        const response = await fetch(
          `/api/live/epg?source=${currentSource.key}&tvgId=${channel.tvgId}`
        );
        if (response.ok) {
          const result = await response.json();
          if (result.success) {
            // 清洗EPG数据，去除重叠的节目
            const cleanedData = {
              ...result.data,
              programs: cleanEpgData(result.data.programs),
            };
            setEpgData(cleanedData);
          }
        }
      } catch (error) {
        console.error('获取节目单信息失败:', error);
      } finally {
        setIsEpgLoading(false); // 无论成功失败都结束加载状态
      }
    } else {
      // 如果没有 tvgId 或 currentSource，清空 EPG 数据
      setEpgData(null);
      setIsEpgLoading(false);
    }
  };

  // 清理播放器资源的统一函数
  const cleanupPlayer = () => {
    // 重置不支持的类型状态
    setUnsupportedType(null);

    if (artPlayerRef.current) {
      try {
        // 先暂停播放
        if (artPlayerRef.current.video) {
          artPlayerRef.current.video.pause();
          artPlayerRef.current.video.src = '';
          artPlayerRef.current.video.load();
        }

        // 销毁 HLS 实例
        if (artPlayerRef.current.video && artPlayerRef.current.video.hls) {
          artPlayerRef.current.video.hls.destroy();
          artPlayerRef.current.video.hls = null;
        }

        // 销毁 FLV 实例 - 增强清理逻辑
        if (artPlayerRef.current.video && artPlayerRef.current.video.flv) {
          try {
            // 先停止加载
            if (artPlayerRef.current.video.flv.unload) {
              artPlayerRef.current.video.flv.unload();
            }
            // 销毁播放器
            artPlayerRef.current.video.flv.destroy();
            // 确保引用被清空
            artPlayerRef.current.video.flv = null;
          } catch (flvError) {
            console.warn('FLV实例销毁时出错:', flvError);
            // 强制清空引用
            artPlayerRef.current.video.flv = null;
          }
        }

        // 移除所有事件监听器
        artPlayerRef.current.off('ready');
        artPlayerRef.current.off('loadstart');
        artPlayerRef.current.off('loadeddata');
        artPlayerRef.current.off('canplay');
        artPlayerRef.current.off('waiting');
        artPlayerRef.current.off('error');

        // 销毁 ArtPlayer 实例
        artPlayerRef.current.destroy();
        artPlayerRef.current = null;
      } catch (err) {
        console.warn('清理播放器资源时出错:', err);
        artPlayerRef.current = null;
      }
    }
  };

  // 确保视频源正确设置
  const ensureVideoSource = (video: HTMLVideoElement | null, url: string) => {
    if (!video || !url) return;
    const sources = Array.from(video.getElementsByTagName('source'));
    const existed = sources.some((s) => s.src === url);
    if (!existed) {
      // 移除旧的 source，保持唯一
      sources.forEach((s) => s.remove());
      const sourceEl = document.createElement('source');
      sourceEl.src = url;
      video.appendChild(sourceEl);
    }

    // 始终允许远程播放（AirPlay / Cast）
    video.disableRemotePlayback = false;
    // 如果曾经有禁用属性，移除之
    if (video.hasAttribute('disableRemotePlayback')) {
      video.removeAttribute('disableRemotePlayback');
    }
  };

  // 切换分组
  const handleGroupChange = (group: string) => {
    // 如果正在切换直播源，则禁用分组切换
    if (isSwitchingSource) return;

    setSelectedGroup(group);
    const filtered = currentChannels.filter(
      (channel) => channel.group === group
    );
    setFilteredChannels(filtered);

    // 如果当前选中的频道在新的分组中，自动滚动到该频道位置
    if (
      currentChannel &&
      filtered.some((channel) => channel.id === currentChannel.id)
    ) {
      setTimeout(() => {
        scrollToChannel(currentChannel);
      }, 100);
    } else {
      // 否则滚动到频道列表顶端
      if (channelListRef.current) {
        channelListRef.current.scrollTo({
          top: 0,
          behavior: 'smooth',
        });
      }
    }
  };

  // 简化的搜索频道（只在当前源内搜索）
  const searchCurrentSourceChannels = (query: string) => {
    if (!query.trim()) {
      setCurrentSourceSearchResults([]);
      return;
    }

    const normalizedQuery = query.toLowerCase();
    const results = currentChannels.filter(
      (channel) =>
        channel.name.toLowerCase().includes(normalizedQuery) ||
        channel.group.toLowerCase().includes(normalizedQuery)
    );
    setCurrentSourceSearchResults(results);
  };

  // 防抖搜索
  const debouncedSearch = debounce(searchCurrentSourceChannels, 300);

  // 处理搜索输入
  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
    debouncedSearch(query);
  };

  // 切换收藏
  const handleToggleFavorite = async () => {
    if (!currentSourceRef.current || !currentChannelRef.current) return;

    try {
      const currentFavorited = favoritedRef.current;
      const newFavorited = !currentFavorited;

      // 立即更新状态
      setFavorited(newFavorited);
      favoritedRef.current = newFavorited;

      // 异步执行收藏操作
      try {
        if (newFavorited) {
          // 如果未收藏，添加收藏
          await saveFavorite(
            `live_${currentSourceRef.current.key}`,
            `live_${currentChannelRef.current.id}`,
            {
              title: currentChannelRef.current.name,
              source_name: currentSourceRef.current.name,
              year: '',
              cover: `/api/proxy/logo?url=${encodeURIComponent(
                currentChannelRef.current.logo
              )}&source=${currentSourceRef.current.key}`,
              total_episodes: 1,
              save_time: Date.now(),
              search_title: '',
              origin: 'live',
            }
          );
        } else {
          // 如果已收藏，删除收藏
          await deleteFavorite(
            `live_${currentSourceRef.current.key}`,
            `live_${currentChannelRef.current.id}`
          );
        }
      } catch (err) {
        console.error('收藏操作失败:', err);
        // 如果操作失败，回滚状态
        setFavorited(currentFavorited);
        favoritedRef.current = currentFavorited;
      }
    } catch (err) {
      console.error('切换收藏失败:', err);
    }
  };

  // 检查收藏状态
  useEffect(() => {
    if (!currentSource || !currentChannel) return;
    (async () => {
      try {
        const fav = await checkIsFavorited(
          `live_${currentSource.key}`,
          `live_${currentChannel.id}`
        );
        setFavorited(fav);
        favoritedRef.current = fav;
      } catch (err) {
        console.error('检查收藏状态失败:', err);
      }
    })();
  }, [currentSource, currentChannel]);

  // 监听收藏数据更新事件
  useEffect(() => {
    if (!currentSource || !currentChannel) return;

    const unsubscribe = subscribeToDataUpdates(
      'favoritesUpdated',
      (favorites: Record<string, any>) => {
        const key = generateStorageKey(
          `live_${currentSource.key}`,
          `live_${currentChannel.id}`
        );
        const isFav = !!favorites[key];
        setFavorited(isFav);
        favoritedRef.current = isFav;
      }
    );

    return unsubscribe;
  }, [currentSource, currentChannel]);

  // 监听自动刷新设置变化
  useEffect(() => {
    setupAutoRefresh();

    // 清理函数
    return () => {
      if (autoRefreshTimerRef.current) {
        clearInterval(autoRefreshTimerRef.current);
        autoRefreshTimerRef.current = null;
      }
    };
  }, [autoRefreshEnabled, autoRefreshInterval]);

  // 保存自动刷新配置到localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(
        'live-auto-refresh-enabled',
        JSON.stringify(autoRefreshEnabled)
      );
    }
  }, [autoRefreshEnabled]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(
        'live-auto-refresh-interval',
        autoRefreshInterval.toString()
      );
    }
  }, [autoRefreshInterval]);

  // 当分组切换时，将激活的分组标签滚动到视口中间
  useEffect(() => {
    if (!selectedGroup || !groupContainerRef.current) return;

    const groupKeys = Object.keys(groupedChannels);
    const groupIndex = groupKeys.indexOf(selectedGroup);
    if (groupIndex === -1) return;

    const btn = groupButtonRefs.current[groupIndex];
    const container = groupContainerRef.current;
    if (btn && container) {
      // 手动计算滚动位置，只滚动分组标签容器
      const containerRect = container.getBoundingClientRect();
      const btnRect = btn.getBoundingClientRect();
      const scrollLeft = container.scrollLeft;

      // 计算按钮相对于容器的位置
      const btnLeft = btnRect.left - containerRect.left + scrollLeft;
      const btnWidth = btnRect.width;
      const containerWidth = containerRect.width;

      // 计算目标滚动位置，使按钮居中
      const targetScrollLeft = btnLeft - (containerWidth - btnWidth) / 2;

      // 平滑滚动到目标位置
      container.scrollTo({
        left: targetScrollLeft,
        behavior: 'smooth',
      });
    }
  }, [selectedGroup, groupedChannels]);

  // 错误重试状态管理：keyLoadError 计数容器。
  // 每次渲染新建容器，保持原有"let 变量按渲染隔离"的闭包语义；
  // 阈值常量与恢复状态机已原样移至 @/lib/live-hls。
  const hlsErrorCounters = { keyLoadErrorCount: 0, lastErrorTime: 0 };

  // 播放器初始化
  useEffect(() => {
    // 异步初始化播放器，避免SSR问题
    const initPlayer = async () => {
      if (!videoUrl || !artRef.current || !currentChannel) {
        return;
      }


      // 销毁之前的播放器实例并创建新的
      if (artPlayerRef.current) {
        cleanupPlayer();
      }

      // 根据hls.js源码设计，直接让hls.js处理各种媒体类型和错误
      // 不需要预检查，hls.js会在加载时自动检测和处理

      // 重置不支持的类型
      setUnsupportedType(null);

      const targetUrl = `/api/proxy/m3u8?url=${encodeURIComponent(
        videoUrl
      )}&moontv-source=${currentSourceRef.current?.key || ''}`;

      try {
        // 直接使用动态导入，避免竞态条件
        const [{ default: Artplayer }, { default: Hls }, hlsRuntime] =
          await Promise.all([
            import('artplayer'),
            import('hls.js'),
            import('@/app/play/utils/hlsConfig'),
          ]);

        setupArtplayerGlobals(Artplayer);

        artPlayerRef.current = new Artplayer({
          container: artRef.current,
          url: targetUrl,
          poster: currentChannel.logo,
          volume: 0.7,
          muted: false,
          autoplay: true,
          pip: true,
          screenshot: false,
          setting: false,
          loop: false,
          fullscreen: true,
          fullscreenWeb: true,
          mutex: true,
          playsInline: true,
          theme: '#22c55e',
          lang: 'zh-cn',
          customType: {
            m3u8: (video: HTMLVideoElement, url: string) => {
              m3u8Loader(video, url, Hls, hlsRuntime, {
                // 与原实现一致：每次 load 时实时读取当前直播源 key
                getSourceKey: () => currentSourceRef.current?.key || '',
                errorCounters: hlsErrorCounters,
                callbacks: {
                  onUnsupportedType: setUnsupportedType,
                  onVideoLoadingChange: setIsVideoLoading,
                },
              });
            },
          },
        });

        // 监听播放器事件
        artPlayerRef.current.on('ready', () => {
          setError(null);
          setIsVideoLoading(false);
        });

        artPlayerRef.current.on('loadstart', () => {
          setIsVideoLoading(true);
        });

        artPlayerRef.current.on('loadeddata', () => {
          setIsVideoLoading(false);
        });

        artPlayerRef.current.on('canplay', () => {
          setIsVideoLoading(false);
        });

        artPlayerRef.current.on('waiting', () => {
          setIsVideoLoading(true);
        });

        artPlayerRef.current.on('error', (err: any) => {
          console.error('播放器错误:', err);
        });

        if (artPlayerRef.current?.video) {
          ensureVideoSource(
            artPlayerRef.current.video as HTMLVideoElement,
            targetUrl
          );
        }
      } catch (err) {
        console.error('创建播放器失败:', err);
        // 不设置错误，只记录日志
      }
    }; // 结束 initPlayer 函数

    // 直接调用 initPlayer（现在内部使用动态导入）
    initPlayer();
  }, [videoUrl, currentChannel, loading]);

  // 清理播放器资源
  useEffect(() => {
    return () => {
      cleanupPlayer();
    };
  }, []);

  // 页面卸载时的额外清理
  useEffect(() => {
    const handleBeforeUnload = () => {
      cleanupPlayer();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      cleanupPlayer();
    };
  }, []);

  // 全局快捷键处理
  useEffect(() => {
    const handleKeyboardShortcuts = (e: KeyboardEvent) => {
      // 忽略输入框中的按键事件
      if (
        (e.target as HTMLElement).tagName === 'INPUT' ||
        (e.target as HTMLElement).tagName === 'TEXTAREA'
      )
        return;

      // 上箭头 = 音量+
      if (e.key === 'ArrowUp') {
        if (artPlayerRef.current && artPlayerRef.current.volume < 1) {
          artPlayerRef.current.volume =
            Math.round((artPlayerRef.current.volume + 0.1) * 10) / 10;
          artPlayerRef.current.notice.show = `音量: ${Math.round(
            artPlayerRef.current.volume * 100
          )}`;
          e.preventDefault();
        }
      }

      // 下箭头 = 音量-
      if (e.key === 'ArrowDown') {
        if (artPlayerRef.current && artPlayerRef.current.volume > 0) {
          artPlayerRef.current.volume =
            Math.round((artPlayerRef.current.volume - 0.1) * 10) / 10;
          artPlayerRef.current.notice.show = `音量: ${Math.round(
            artPlayerRef.current.volume * 100
          )}`;
          e.preventDefault();
        }
      }

      // 空格 = 播放/暂停
      if (e.key === ' ') {
        if (artPlayerRef.current) {
          artPlayerRef.current.toggle();
          e.preventDefault();
        }
      }

      // f 键 = 切换全屏
      if (e.key === 'f' || e.key === 'F') {
        if (artPlayerRef.current) {
          artPlayerRef.current.fullscreen = !artPlayerRef.current.fullscreen;
          e.preventDefault();
        }
      }
    };

    document.addEventListener('keydown', handleKeyboardShortcuts);
    return () => {
      document.removeEventListener('keydown', handleKeyboardShortcuts);
    };
  }, []);

  if (loading) {
    return (
      <PageLayout activePath='/live'>
        <div className='flex items-center justify-center min-h-screen bg-transparent'>
          <div className='text-center max-w-md mx-auto px-6'>
            {/* 动画直播图标 */}
            <div className='relative mb-8'>
              <div className='relative mx-auto w-24 h-24 bg-gradient-to-r from-green-500 to-emerald-600 rounded-2xl shadow-2xl flex items-center justify-center transform hover:scale-105 transition-transform duration-300'>
                <div className='text-white text-4xl'>📺</div>
                {/* 旋转光环 */}
                <div className='absolute -inset-2 bg-gradient-to-r from-green-500 to-emerald-600 rounded-2xl opacity-20 animate-spin'></div>
              </div>

              {/* 浮动粒子效果 */}
              <div className='absolute top-0 left-0 w-full h-full pointer-events-none'>
                <div className='absolute top-2 left-2 w-2 h-2 bg-green-400 rounded-full animate-bounce'></div>
                <div
                  className='absolute top-4 right-4 w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce'
                  style={{ animationDelay: '0.5s' }}
                ></div>
                <div
                  className='absolute bottom-3 left-6 w-1 h-1 bg-lime-400 rounded-full animate-bounce'
                  style={{ animationDelay: '1s' }}
                ></div>
              </div>
            </div>

            {/* 进度指示器 */}
            <div className='mb-6 w-80 mx-auto'>
              <div className='flex justify-center space-x-2 mb-4'>
                <div
                  className={`w-3 h-3 rounded-full transition-all duration-500 ${
                    loadingStage === 'loading'
                      ? 'bg-green-500 scale-125'
                      : 'bg-green-500'
                  }`}
                ></div>
                <div
                  className={`w-3 h-3 rounded-full transition-all duration-500 ${
                    loadingStage === 'fetching'
                      ? 'bg-green-500 scale-125'
                      : 'bg-green-500'
                  }`}
                ></div>
                <div
                  className={`w-3 h-3 rounded-full transition-all duration-500 ${
                    loadingStage === 'ready'
                      ? 'bg-green-500 scale-125'
                      : 'bg-gray-300'
                  }`}
                ></div>
              </div>

              {/* 进度条 */}
              <div className='w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden'>
                <div
                  className='h-full bg-gradient-to-r from-green-500 to-emerald-600 rounded-full transition-all duration-1000 ease-out'
                  style={{
                    width:
                      loadingStage === 'loading'
                        ? '33%'
                        : loadingStage === 'fetching'
                        ? '66%'
                        : '100%',
                  }}
                ></div>
              </div>
            </div>

            {/* 加载消息 */}
            <div className='space-y-2'>
              <p className='text-xl font-semibold text-gray-800 dark:text-gray-200 animate-pulse'>
                {loadingMessage}
              </p>
            </div>
          </div>
        </div>
      </PageLayout>
    );
  }

  if (error) {
    return (
      <PageLayout activePath='/live'>
        <div className='flex items-center justify-center min-h-screen bg-transparent'>
          <div className='text-center max-w-md mx-auto px-6'>
            {/* 错误图标 */}
            <div className='relative mb-8'>
              <div className='relative mx-auto w-24 h-24 bg-gradient-to-r from-red-500 to-orange-500 rounded-2xl shadow-2xl flex items-center justify-center transform hover:scale-105 transition-transform duration-300'>
                <div className='text-white text-4xl'>😵</div>
                {/* 脉冲效果 */}
                <div className='absolute -inset-2 bg-gradient-to-r from-red-500 to-orange-500 rounded-2xl opacity-20 animate-pulse'></div>
              </div>
            </div>

            {/* 错误信息 */}
            <div className='space-y-4 mb-8'>
              <h2 className='text-2xl font-bold text-gray-800 dark:text-gray-200'>
                哎呀，出现了一些问题
              </h2>
              <div className='bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4'>
                <p className='text-red-600 dark:text-red-400 font-medium'>
                  {error}
                </p>
              </div>
              <p className='text-sm text-gray-500 dark:text-gray-400'>
                请检查网络连接或尝试刷新页面
              </p>
            </div>

            {/* 操作按钮 */}
            <div className='space-y-3'>
              <button
                onClick={() => window.location.reload()}
                className='w-full px-6 py-3 bg-gradient-to-r from-blue-500 to-cyan-600 text-white rounded-xl font-medium hover:from-blue-600 hover:to-cyan-700 transform hover:scale-105 transition-all duration-200 shadow-lg hover:shadow-xl'
              >
                🔄 重新尝试
              </button>
            </div>
          </div>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout activePath='/live'>
      <div className='flex flex-col gap-3 py-4 px-5 lg:px-[3rem] 2xl:px-20'>
        {/* 第一行：页面标题 */}
        <div className='py-1'>
          <h1 className='text-xl font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2 max-w-[80%]'>
            <Radio className='w-5 h-5 text-blue-500 flex-shrink-0' />
            <div className='min-w-0 flex-1'>
              <div className='truncate'>
                {currentSource?.name}
                {currentSource && currentChannel && (
                  <span className='text-gray-500 dark:text-gray-400'>
                    {` > ${currentChannel.name}`}
                  </span>
                )}
                {currentSource && !currentChannel && (
                  <span className='text-gray-500 dark:text-gray-400'>
                    {` > ${currentSource.name}`}
                  </span>
                )}
              </div>
            </div>
          </h1>
        </div>

        {/* 第二行：播放器和频道列表 */}
        <div className='space-y-2'>
          {/* 折叠控制 - 仅在 lg 及以上屏幕显示 */}
          <div className='hidden lg:flex justify-end'>
            <button
              onClick={() => setIsChannelListCollapsed(!isChannelListCollapsed)}
              className='group relative flex items-center space-x-1.5 px-3 py-1.5 rounded-full bg-white/80 hover:bg-white dark:bg-gray-800/80 dark:hover:bg-gray-800 backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50 shadow-sm hover:shadow-md transition-all duration-200'
              title={isChannelListCollapsed ? '显示频道列表' : '隐藏频道列表'}
            >
              <svg
                className={`w-3.5 h-3.5 text-gray-500 dark:text-gray-400 transition-transform duration-200 ${
                  isChannelListCollapsed ? 'rotate-180' : 'rotate-0'
                }`}
                fill='none'
                stroke='currentColor'
                viewBox='0 0 24 24'
              >
                <path
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  strokeWidth='2'
                  d='M9 5l7 7-7 7'
                />
              </svg>
              <span className='text-xs font-medium text-gray-600 dark:text-gray-300'>
                {isChannelListCollapsed ? '显示' : '隐藏'}
              </span>

              {/* 精致的状态指示点 */}
              <div
                className={`absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full transition-all duration-200 ${
                  isChannelListCollapsed
                    ? 'bg-orange-400 animate-pulse'
                    : 'bg-green-400'
                }`}
              ></div>
            </button>
          </div>

          <div
            className={`grid gap-4 lg:h-[500px] xl:h-[650px] 2xl:h-[750px] transition-all duration-300 ease-in-out ${
              isChannelListCollapsed
                ? 'grid-cols-1'
                : 'grid-cols-1 md:grid-cols-4'
            }`}
          >
            {/* 播放器 */}
            <div
              className={`h-full transition-all duration-300 ease-in-out ${
                isChannelListCollapsed ? 'col-span-1' : 'md:col-span-3'
              }`}
            >
              <div className='relative w-full h-[300px] lg:h-full'>
                <div
                  ref={artRef}
                  className='bg-black w-full h-full rounded-xl overflow-hidden shadow-lg border border-white/0 dark:border-white/30'
                ></div>

                {/* 不支持的直播类型提示 */}
                {unsupportedType && (
                  <div className='absolute inset-0 bg-black/90 backdrop-blur-sm rounded-xl overflow-hidden shadow-lg border border-white/0 dark:border-white/30 flex items-center justify-center z-[600] transition-all duration-300'>
                    <div className='text-center max-w-md mx-auto px-6'>
                      <div className='relative mb-8'>
                        <div className='relative mx-auto w-24 h-24 bg-gradient-to-r from-orange-500 to-red-600 rounded-2xl shadow-2xl flex items-center justify-center transform hover:scale-105 transition-transform duration-300'>
                          <div className='text-white text-4xl'>⚠️</div>
                          <div className='absolute -inset-2 bg-gradient-to-r from-orange-500 to-red-600 rounded-2xl opacity-20 animate-pulse'></div>
                        </div>
                      </div>
                      <div className='space-y-4'>
                        <h3 className='text-xl font-semibold text-white'>
                          {unsupportedType === 'channel-unavailable'
                            ? '该频道暂时不可用'
                            : '暂不支持的直播流类型'}
                        </h3>
                        <div className='bg-orange-500/20 border border-orange-500/30 rounded-lg p-4'>
                          <p className='text-orange-300 font-medium'>
                            {unsupportedType === 'channel-unavailable'
                              ? '频道可能需要特殊访问权限或链接已过期'
                              : `当前频道直播流类型：${unsupportedType.toUpperCase()}`}
                          </p>
                          <p className='text-sm text-orange-200 mt-2'>
                            {unsupportedType === 'channel-unavailable'
                              ? '请联系IPTV提供商或尝试其他频道'
                              : '目前仅支持 M3U8 格式的直播流'}
                          </p>
                        </div>
                        <p className='text-sm text-gray-300'>请尝试其他频道</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* 视频加载蒙层 */}
                {isVideoLoading && (
                  <div className='absolute inset-0 bg-black/85 backdrop-blur-sm rounded-xl overflow-hidden shadow-lg border border-white/0 dark:border-white/30 flex items-center justify-center z-[500] transition-all duration-300'>
                    <div className='text-center max-w-md mx-auto px-6'>
                      <div className='relative mb-8'>
                        <div className='relative mx-auto w-24 h-24 bg-gradient-to-r from-green-500 to-emerald-600 rounded-2xl shadow-2xl flex items-center justify-center transform hover:scale-105 transition-transform duration-300'>
                          <div className='text-white text-4xl'>📺</div>
                          <div className='absolute -inset-2 bg-gradient-to-r from-green-500 to-emerald-600 rounded-2xl opacity-20 animate-spin'></div>
                        </div>
                      </div>
                      <div className='space-y-2'>
                        <p className='text-xl font-semibold text-white animate-pulse'>
                          🔄 IPTV 加载中...
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* 频道列表 */}
            <ChannelSidebar
              isChannelListCollapsed={isChannelListCollapsed}
              activeTab={activeTab}
              onTabChange={setActiveTab}
              searchQuery={searchQuery}
              onSearchChange={handleSearchChange}
              currentSource={currentSource}
              currentChannel={currentChannel}
              isSwitchingSource={isSwitchingSource}
              groupedChannels={groupedChannels}
              selectedGroup={selectedGroup}
              onGroupChange={handleGroupChange}
              groupContainerRef={groupContainerRef}
              groupButtonRefs={groupButtonRefs}
              filteredChannels={filteredChannels}
              channelListRef={channelListRef}
              onChannelChange={handleChannelChange}
              currentSourceSearchResults={currentSourceSearchResults}
              liveSources={liveSources}
              isRefreshingSource={isRefreshingSource}
              onRefresh={refreshLiveSources}
              autoRefreshEnabled={autoRefreshEnabled}
              onAutoRefreshEnabledChange={setAutoRefreshEnabled}
              autoRefreshInterval={autoRefreshInterval}
              onAutoRefreshIntervalChange={setAutoRefreshInterval}
              onSourceChange={handleSourceChange}
            />
          </div>
        </div>

        {/* 当前频道信息 */}
        {currentChannel && (
          <ChannelInfoPanel
            currentChannel={currentChannel}
            currentSource={currentSource}
            favorited={favorited}
            onToggleFavorite={handleToggleFavorite}
            programs={epgData?.programs || []}
            isEpgLoading={isEpgLoading}
          />
        )}
      </div>
    </PageLayout>
  );
}

export default function LivePage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <LivePageClient />
    </Suspense>
  );
}
