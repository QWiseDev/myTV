/* eslint-disable @typescript-eslint/no-explicit-any, no-console */

import type { PlatformUrl } from './types';

// 从caiji.cyou API搜索视频链接
async function searchFromCaijiAPI(
  title: string,
  episode?: string | null,
): Promise<PlatformUrl[]> {
  try {

    // 尝试多种标题格式进行搜索
    const searchTitles = [
      title, // 原始标题
      title.replace(/·/g, ''), // 移除中间点
      title.replace(/·/g, ' '), // 中间点替换为空格
      title.replace(/·/g, '-'), // 中间点替换为连字符
    ];

    // 去重
    const uniqueTitles = Array.from(new Set(searchTitles));

    for (const searchTitle of uniqueTitles) {
      const searchUrl = `https://www.caiji.cyou/api.php/provide/vod/?wd=${encodeURIComponent(
        searchTitle,
      )}`;
      const response = await fetch(searchUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });

      if (!response.ok) {
        continue; // 尝试下一个标题
      }

      const data: any = await response.json();
      if (!data.list || data.list.length === 0) {
        continue; // 尝试下一个标题
      }


      // 智能选择最佳匹配结果
      let bestMatch: any = null;
      let exactMatch: any = null;

      for (const result of data.list) {

        // 标题完全匹配（优先级最高）
        if (result.vod_name === searchTitle || result.vod_name === title) {
          exactMatch = result;
          break;
        }

        // 跳过明显不合适的内容
        const isUnwanted =
          result.vod_name.includes('解说') ||
          result.vod_name.includes('预告') ||
          result.vod_name.includes('花絮') ||
          result.vod_name.includes('动态漫') ||
          result.vod_name.includes('之精彩');

        if (isUnwanted) {
          continue;
        }

        // 选择第一个合适的结果
        if (!bestMatch) {
          bestMatch = result;
        }
      }

      // 优先使用完全匹配，否则使用最佳匹配
      const selectedResult = exactMatch || bestMatch;

      if (selectedResult) {
        // 找到结果就处理并返回，不再尝试其他标题变体
        return await processSelectedResult(selectedResult, episode);
      }
    }

    return [];
  } catch (error) {
    console.error('❌ Caiji API搜索失败:', error);
    return [];
  }
}

// 处理选中的结果
async function processSelectedResult(
  selectedResult: any,
  episode?: string | null,
): Promise<PlatformUrl[]> {
  try {
    const firstResult: any = selectedResult;
    const detailUrl = `https://www.caiji.cyou/api.php/provide/vod/?ac=detail&ids=${firstResult.vod_id}`;

    const detailResponse = await fetch(detailUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    if (!detailResponse.ok) return [];

    const detailData: any = await detailResponse.json();
    if (!detailData.list || detailData.list.length === 0) return [];

    const videoInfo: any = detailData.list[0];

    const urls: PlatformUrl[] = [];

    // 解析播放链接
    if (videoInfo.vod_play_url) {
      const playUrls = videoInfo.vod_play_url.split('#');

      // 如果指定了集数，尝试找到对应集数的链接
      let targetUrl = '';
      if (episode && parseInt(episode) > 0) {
        const episodeNum = parseInt(episode);
        // 支持多种集数格式: "20$", "第20集$", "E20$", "EP20$" 等
        const targetEpisode = playUrls.find((url: string) => {
          return (
            url.startsWith(`${episodeNum}$`) ||
            url.startsWith(`第${episodeNum}集$`) ||
            url.startsWith(`E${episodeNum}$`) ||
            url.startsWith(`EP${episodeNum}$`)
          );
        });
        if (targetEpisode) {
          targetUrl = targetEpisode.split('$')[1];
        }
      }

      // 如果没有指定集数或找不到指定集数，使用第一集
      if (!targetUrl && playUrls.length > 0) {
        targetUrl = playUrls[0].split('$')[1];
      }

      if (targetUrl) {
        // 根据URL判断平台
        let platform = 'unknown';
        if (targetUrl.includes('bilibili.com')) {
          platform = 'bilibili_caiji';
        } else if (
          targetUrl.includes('v.qq.com') ||
          targetUrl.includes('qq.com')
        ) {
          platform = 'tencent_caiji';
        } else if (targetUrl.includes('iqiyi.com')) {
          platform = 'iqiyi_caiji';
        } else if (
          targetUrl.includes('youku.com') ||
          targetUrl.includes('v.youku.com')
        ) {
          platform = 'youku_caiji';
        } else if (
          targetUrl.includes('mgtv.com') ||
          targetUrl.includes('w.mgtv.com')
        ) {
          platform = 'mgtv_caiji';
        }

        // 统一修复所有平台的链接格式：将.htm转换为.html
        if (targetUrl.endsWith('.htm')) {
          targetUrl = targetUrl.replace(/\.htm$/, '.html');
        }


        urls.push({
          platform: platform,
          url: targetUrl,
        });
      }
    }

    return urls;
  } catch (error) {
    console.error('❌ Caiji API搜索失败:', error);
    return [];
  }
}

export { searchFromCaijiAPI };
