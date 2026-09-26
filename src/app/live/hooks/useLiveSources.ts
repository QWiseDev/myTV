/* eslint-disable @typescript-eslint/no-explicit-any -- 接口返回 JSON 结构为 any，与原直播页实现保持一致 */
/* eslint-disable react-hooks/exhaustive-deps -- 初始化拉取 effect 依赖空数组为原有行为（仅首次挂载执行） */

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { cleanEpgData } from '@/lib/live-epg';

// 直播频道接口
export interface LiveChannel {
  id: string;
  tvgId: string;
  name: string;
  logo: string;
  group: string;
  url: string;
}

// 直播源接口
export interface LiveSource {
  key: string;
  name: string;
  url: string; // m3u 地址
  ua?: string;
  epg?: string; // 节目单
  from: 'config' | 'custom';
  channelNumber?: number;
  disabled?: boolean;
}

export interface UseLiveSourcesOptions {
  /** 滚动到指定频道位置（依赖页面持有的频道列表 DOM ref） */
  scrollToChannel: (channel: LiveChannel) => void;
  /** 模拟点击分组（依赖页面持有的分组条 DOM ref 与 selectedGroup 状态） */
  simulateGroupClick: (group: string) => void;
  /** 切换 Tab（activeTab 状态由页面持有） */
  setActiveTab: (tab: 'channels' | 'sources') => void;
}

/**
 * 直播页数据层：直播源 / 频道 / 分组 / 节目单（EPG）的拉取函数与相关状态。
 *
 * 仅承载网络拉取与状态流转；依赖页面 DOM 的回调（滚动、模拟点击分组）
 * 与播放器状态由页面通过 options 注入，以保证闭包语义与拆分前一致。
 */
export function useLiveSources({
  scrollToChannel,
  simulateGroupClick,
  setActiveTab,
}: UseLiveSourcesOptions) {
  // -----------------------------------------------------------------------------
  // 状态变量（State）
  // -----------------------------------------------------------------------------
  const [loading, setLoading] = useState(true);
  const [loadingStage, setLoadingStage] = useState<
    'loading' | 'fetching' | 'ready'
  >('loading');
  const [loadingMessage, setLoadingMessage] = useState('正在加载直播源...');

  const searchParams = useSearchParams();
  const router = useRouter();

  // 直播源相关
  const [liveSources, setLiveSources] = useState<LiveSource[]>([]);
  const [currentSource, setCurrentSource] = useState<LiveSource | null>(null);
  const currentSourceRef = useRef<LiveSource | null>(null);
  useEffect(() => {
    currentSourceRef.current = currentSource;
  }, [currentSource]);

  // 频道相关
  const [currentChannels, setCurrentChannels] = useState<LiveChannel[]>([]);
  const [currentChannel, setCurrentChannel] = useState<LiveChannel | null>(
    null
  );
  const currentChannelRef = useRef<LiveChannel | null>(null);
  useEffect(() => {
    currentChannelRef.current = currentChannel;
  }, [currentChannel]);

  const [needLoadSource] = useState(searchParams.get('source'));
  const [needLoadChannel] = useState(searchParams.get('id'));

  // 播放器相关
  const [videoUrl, setVideoUrl] = useState('');
  const [isVideoLoading, setIsVideoLoading] = useState(false);

  // 刷新相关状态
  const [isRefreshingSource, setIsRefreshingSource] = useState(false);

  // 分组相关
  const [groupedChannels, setGroupedChannels] = useState<{
    [key: string]: LiveChannel[];
  }>({});

  // 过滤后的频道列表
  const [filteredChannels, setFilteredChannels] = useState<LiveChannel[]>([]);

  // 节目单信息
  const [epgData, setEpgData] = useState<{
    tvgId: string;
    source: string;
    epgUrl: string;
    programs: Array<{
      start: string;
      end: string;
      title: string;
    }>;
  } | null>(null);

  // EPG 数据加载状态
  const [isEpgLoading, setIsEpgLoading] = useState(false);

  // -----------------------------------------------------------------------------
  // 数据拉取函数（Fetch）
  // -----------------------------------------------------------------------------

  // 刷新直播源
  const refreshLiveSources = async () => {
    if (isRefreshingSource) return;

    setIsRefreshingSource(true);
    try {

      // 调用后端刷新API
      const response = await fetch('/api/admin/live/refresh', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('刷新直播源失败');
      }

      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || '刷新直播源失败');
      }


      // 重新获取直播源列表
      await fetchLiveSources();
    } catch (error) {
      console.error('刷新直播源失败:', error);
      // 这里可以显示错误提示，但不设置全局error状态
    } finally {
      setIsRefreshingSource(false);
    }
  };

  // 获取直播源列表
  const fetchLiveSources = async () => {
    try {
      setLoadingStage('fetching');
      setLoadingMessage('正在获取直播源...');

      // 获取 AdminConfig 中的直播源信息
      const response = await fetch('/api/live/data');
      if (!response.ok) {
        throw new Error('获取直播源失败');
      }

      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || '获取直播源失败');
      }

      const sources = result.data;
      setLiveSources(sources);

      if (sources.length > 0) {
        // 默认选中第一个源
        const firstSource = sources[0];
        if (needLoadSource) {
          const foundSource = sources.find(
            (s: LiveSource) => s.key === needLoadSource
          );
          if (foundSource) {
            setCurrentSource(foundSource);
            await fetchChannels(foundSource);
          } else {
            setCurrentSource(firstSource);
            await fetchChannels(firstSource);
          }
        } else {
          setCurrentSource(firstSource);
          await fetchChannels(firstSource);
        }
      }

      setLoadingStage('ready');
      setLoadingMessage('✨ 准备就绪...');

      setTimeout(() => {
        setLoading(false);
      }, 1000);
    } catch (err) {
      console.error('获取直播源失败:', err);
      // 不设置错误，而是显示空状态
      setLiveSources([]);
      setLoading(false);
    } finally {
      // 移除 URL 搜索参数中的 source 和 id
      const newSearchParams = new URLSearchParams(searchParams.toString());
      newSearchParams.delete('source');
      newSearchParams.delete('id');

      const newUrl = newSearchParams.toString()
        ? `?${newSearchParams.toString()}`
        : window.location.pathname;

      router.replace(newUrl);
    }
  };

  // 获取频道列表
  const fetchChannels = async (source: LiveSource) => {
    try {
      setIsVideoLoading(true);

      // 从 cachedLiveChannels 获取频道信息
      const response = await fetch(`/api/live/channels?source=${source.key}`);
      if (!response.ok) {
        throw new Error('获取频道列表失败');
      }

      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || '获取频道列表失败');
      }

      const channelsData = result.data;
      if (!channelsData || channelsData.length === 0) {
        // 不抛出错误，而是设置空频道列表
        setCurrentChannels([]);
        setGroupedChannels({});
        setFilteredChannels([]);

        // 更新直播源的频道数为 0
        setLiveSources((prevSources) =>
          prevSources.map((s) =>
            s.key === source.key ? { ...s, channelNumber: 0 } : s
          )
        );

        setIsVideoLoading(false);
        return;
      }

      // 转换频道数据格式
      const channels: LiveChannel[] = channelsData.map((channel: any) => ({
        id: channel.id,
        tvgId: channel.tvgId || channel.name,
        name: channel.name,
        logo: channel.logo,
        group: channel.group || '其他',
        url: channel.url,
      }));

      setCurrentChannels(channels);

      // 更新直播源的频道数
      setLiveSources((prevSources) =>
        prevSources.map((s) =>
          s.key === source.key ? { ...s, channelNumber: channels.length } : s
        )
      );

      // 默认选中第一个频道
      let selectedChannel: LiveChannel | null = null;
      if (channels.length > 0) {
        if (needLoadChannel) {
          const foundChannel = channels.find(
            (c: LiveChannel) => c.id === needLoadChannel
          );
          if (foundChannel) {
            selectedChannel = foundChannel;
            setCurrentChannel(foundChannel);
            setVideoUrl(foundChannel.url);
            // 延迟滚动到选中的频道
            setTimeout(() => {
              scrollToChannel(foundChannel);
            }, 200);
          } else {
            selectedChannel = channels[0];
            setCurrentChannel(channels[0]);
            setVideoUrl(channels[0].url);
          }
        } else {
          selectedChannel = channels[0];
          setCurrentChannel(channels[0]);
          setVideoUrl(channels[0].url);
        }
      }

      // 按分组组织频道
      const grouped = channels.reduce((acc, channel) => {
        const group = channel.group || '其他';
        if (!acc[group]) {
          acc[group] = [];
        }
        acc[group].push(channel);
        return acc;
      }, {} as { [key: string]: LiveChannel[] });

      setGroupedChannels(grouped);

      // 默认选中当前加载的channel所在的分组，如果没有则选中第一个分组
      let targetGroup = '';
      if (needLoadChannel) {
        const foundChannel = channels.find(
          (c: LiveChannel) => c.id === needLoadChannel
        );
        if (foundChannel) {
          targetGroup = foundChannel.group || '其他';
        }
      }

      // 如果目标分组不存在，则使用第一个分组
      if (!targetGroup || !grouped[targetGroup]) {
        targetGroup = Object.keys(grouped)[0] || '';
      }

      // 先设置过滤后的频道列表，但不设置选中的分组
      setFilteredChannels(targetGroup ? grouped[targetGroup] : channels);

      // 触发模拟点击分组，让模拟点击来设置分组状态和触发滚动
      if (targetGroup) {
        // 确保切换到频道tab
        setActiveTab('channels');

        // 使用更长的延迟，确保状态更新和DOM渲染完成
        setTimeout(() => {
          simulateGroupClick(targetGroup);
        }, 500); // 增加延迟时间，确保状态更新和DOM渲染完成
      }

      // 🔑 关键修复：首次加载时也要加载选中频道的 EPG 数据
      if (selectedChannel && selectedChannel.tvgId) {
        try {
          setIsEpgLoading(true);
          const epgResponse = await fetch(
            `/api/live/epg?source=${source.key}&tvgId=${selectedChannel.tvgId}`
          );
          if (epgResponse.ok) {
            const epgResult = await epgResponse.json();
            if (epgResult.success) {
              // 清洗EPG数据，去除重叠的节目
              const cleanedData = {
                ...epgResult.data,
                programs: cleanEpgData(epgResult.data.programs),
              };
              setEpgData(cleanedData);
            }
          }
        } catch (error) {
          console.error('获取节目单信息失败:', error);
        } finally {
          setIsEpgLoading(false);
        }
      } else {
        // 如果没有 tvgId，清空 EPG 数据
        setEpgData(null);
        setIsEpgLoading(false);
      }

      setIsVideoLoading(false);
    } catch (err) {
      console.error('获取频道列表失败:', err);
      // 不设置错误，而是设置空频道列表
      setCurrentChannels([]);
      setGroupedChannels({});
      setFilteredChannels([]);

      // 更新直播源的频道数为 0
      setLiveSources((prevSources) =>
        prevSources.map((s) =>
          s.key === source.key ? { ...s, channelNumber: 0 } : s
        )
      );

      setIsVideoLoading(false);
    }
  };

  // 初始化
  useEffect(() => {
    fetchLiveSources();
  }, []);

  return {
    // 加载屏状态
    loading,
    loadingStage,
    loadingMessage,
    // 直播源
    liveSources,
    currentSource,
    setCurrentSource,
    currentSourceRef,
    // 频道
    currentChannels,
    currentChannel,
    setCurrentChannel,
    currentChannelRef,
    groupedChannels,
    filteredChannels,
    setFilteredChannels,
    // 播放器联动
    videoUrl,
    setVideoUrl,
    isVideoLoading,
    setIsVideoLoading,
    // 节目单（EPG）
    epgData,
    setEpgData,
    isEpgLoading,
    setIsEpgLoading,
    // 刷新
    isRefreshingSource,
    refreshLiveSources,
    fetchChannels,
  };
}
