/* eslint-disable no-console */

import { NextRequest, NextResponse } from 'next/server';

import { searchFromCaijiAPI } from '@/lib/danmu/caiji';
import { extractPlatformUrls } from '@/lib/danmu/douban-platform';
import {
  fetchDanmuFromKlmAPI,
  fetchDanmuFromKlmEpisode,
  isSupportedDanmuPlatformUrl,
} from '@/lib/danmu/klm';
import { fetchDanmuFromAPI, fetchDanmuFromXMLAPI } from '@/lib/danmu/sources';
import type {
  DanmuItem,
  KlmResolvedEpisode,
  PlatformUrl,
} from '@/lib/danmu/types';

// danmu_api 按「标题+年份+集数」匹配到剧集时的统一响应结构
function klmEpisodeResponse(result: {
  danmu: DanmuItem[];
  resolvedEpisode: KlmResolvedEpisode | null;
}) {
  return NextResponse.json({
    danmu: result.danmu,
    platforms: [
      {
        platform: 'logvar_episode',
        episodeId: result.resolvedEpisode?.episodeId,
        title: result.resolvedEpisode?.animeTitle,
        episodeTitle: result.resolvedEpisode?.episodeTitle,
        count: result.danmu.length,
      },
    ],
    total: result.danmu.length,
  });
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const doubanId = searchParams.get('douban_id');
  const title = searchParams.get('title');
  const year = searchParams.get('year');
  const episode = searchParams.get('episode'); // 新增集数参数
  const videoUrl = searchParams.get('video_url');
  // 本地集名与同版式内序数：综艺智能匹配（日期/版式/序数综合打分）用
  const episodeTitle = searchParams.get('episode_title')?.slice(0, 100) || null;
  const variantEpisodeRaw = Number.parseInt(
    searchParams.get('variant_episode') || '',
    10,
  );
  const variantEpisode =
    Number.isFinite(variantEpisodeRaw) && variantEpisodeRaw > 0
      ? variantEpisodeRaw
      : null;
  const episodeMeta = episodeTitle ? { episodeTitle, variantEpisode } : null;

  if (!doubanId && !title) {
    return NextResponse.json(
      {
        error: 'Missing required parameters: douban_id or title',
      },
      { status: 400 },
    );
  }

  try {
    if (videoUrl && isSupportedDanmuPlatformUrl(videoUrl)) {
      const urlDanmu = await fetchDanmuFromKlmAPI(videoUrl);
      if (urlDanmu.length > 0) {
        return NextResponse.json({
          danmu: urlDanmu,
          platforms: [
            {
              platform: 'logvar_url',
              url: videoUrl,
              count: urlDanmu.length,
            },
          ],
          total: urlDanmu.length,
        });
      }
    }

    if (title && !doubanId) {
      const directKlmResult = await fetchDanmuFromKlmEpisode(
        title,
        year,
        episode,
        episodeMeta,
      );

      if (directKlmResult.danmu.length > 0) {
        return klmEpisodeResponse(directKlmResult);
      }
    }

    let platformUrls: PlatformUrl[] = [];

    // 优先从豆瓣页面提取链接
    if (doubanId) {
      platformUrls = await extractPlatformUrls(doubanId, episode);
    }

    // 如果豆瓣没有结果，使用caiji.cyou API作为备用
    if (platformUrls.length === 0 && title) {
      const caijiUrls = await searchFromCaijiAPI(title, episode);
      if (caijiUrls.length > 0) {
        platformUrls = caijiUrls;
      }
    }

    // 如果找不到任何链接，直接返回空结果，不使用测试数据
    // （删除了不合适的fallback测试链接逻辑）

    if (platformUrls.length === 0) {
      // 豆瓣与 caiji 均未命中平台链接时（如芒果TV独播综艺），
      // 回退到 danmu_api 按「标题+年份+集数」匹配剧集
      if (title) {
        const fallbackKlmResult = await fetchDanmuFromKlmEpisode(
          title,
          year,
          episode,
          episodeMeta,
        );
        if (fallbackKlmResult.danmu.length > 0) {
          return klmEpisodeResponse(fallbackKlmResult);
        }
      }

      return NextResponse.json({
        danmu: [],
        platforms: [],
        total: 0,
        message: `未找到"${title}"的视频平台链接，无法获取弹幕数据`,
      });
    }

    // 并发获取多个平台的弹幕（自建 danmu_api 优先，旧外部源备用）
    const danmuPromises = platformUrls.map(async ({ platform, url }) => {
      let danmu = await fetchDanmuFromKlmAPI(url);

      if (danmu.length === 0) {
        danmu = await fetchDanmuFromXMLAPI(url);

        if (danmu.length === 0) {
          const jsonDanmu = await fetchDanmuFromAPI(url);

          if (jsonDanmu.length > 0) {
            danmu = jsonDanmu;
          }
        }
      }

      return { platform, danmu, url };
    });

    const results = await Promise.allSettled(danmuPromises);

    // 合并所有成功的弹幕数据
    let allDanmu: DanmuItem[] = [];
    const platformInfo: Array<{
      platform: string;
      url: string;
      count: number;
    }> = [];

    results.forEach((result) => {
      if (result.status === 'fulfilled' && result.value.danmu.length > 0) {
        allDanmu = allDanmu.concat(result.value.danmu);
        platformInfo.push({
          platform: result.value.platform,
          url: result.value.url,
          count: result.value.danmu.length,
        });
      }
    });

    // 按时间排序
    allDanmu.sort((a, b) => a.time - b.time);

    // 🚀 优化去重处理：更精确的重复检测
    const uniqueDanmu: DanmuItem[] = [];
    const seenMap = new Map<string, boolean>();

    // 批量处理去重，避免阻塞
    const DEDUP_BATCH_SIZE = 100;
    for (let i = 0; i < allDanmu.length; i += DEDUP_BATCH_SIZE) {
      const batch = allDanmu.slice(i, i + DEDUP_BATCH_SIZE);

      batch.forEach((danmu) => {
        // 创建更精确的唯一标识：时间(保留2位小数) + 文本内容 + 颜色
        const normalizedText = danmu.text.trim().toLowerCase();
        const timeKey = Math.round(danmu.time * 100) / 100; // 精确到0.01秒
        const uniqueKey = `${timeKey}_${normalizedText}_${
          danmu.color || 'default'
        }`;

        if (!seenMap.has(uniqueKey)) {
          seenMap.set(uniqueKey, true);
          uniqueDanmu.push(danmu);
        }
      });

      // 让出执行权，避免阻塞
      if (i % (DEDUP_BATCH_SIZE * 5) === 0) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }

    return NextResponse.json({
      danmu: uniqueDanmu,
      platforms: platformInfo,
      total: uniqueDanmu.length,
    });
  } catch (error) {
    console.error('外部弹幕获取失败:', error);
    return NextResponse.json(
      {
        error: '获取外部弹幕失败',
        danmu: [],
      },
      { status: 500 },
    );
  }
}
