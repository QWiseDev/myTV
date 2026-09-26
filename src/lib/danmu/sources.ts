/* eslint-disable @typescript-eslint/no-explicit-any, no-console */

import { withAbortableTimeout } from '@/lib/promise-timeout';

import type { DanmuItem } from './types';

interface DanmuApiResponse {
  code: number;
  name: string;
  danum: number;
  danmuku: any[];
}

// 从XML API获取弹幕数据（支持多个备用URL）
async function fetchDanmuFromXMLAPI(videoUrl: string): Promise<DanmuItem[]> {
  const xmlApiUrls = ['https://fc.lyz05.cn', 'https://danmu.smone.us'];

  // 尝试每个API URL
  for (let i = 0; i < xmlApiUrls.length; i++) {
    const baseUrl = xmlApiUrls[i];
    const apiName = i === 0 ? '主用XML API' : `备用XML API ${i}`;
    const timeout = 15000; // 15秒超时

    try {
      const apiUrl = `${baseUrl}/?url=${encodeURIComponent(videoUrl)}`;

      const response = await withAbortableTimeout(
        (signal) =>
          fetch(apiUrl, {
            signal,
            headers: {
              'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
              Accept: 'application/xml, text/xml, */*',
              'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
            },
          }),
        timeout
      );

      if (!response.ok) {
        continue; // 尝试下一个API
      }

      const responseText = await response.text();

      // 使用正则表达式解析XML（Node.js兼容）
      const danmakuRegex = /<d p="([^"]*)"[^>]*>([^<]*)<\/d>/g;
      const danmuList: DanmuItem[] = [];
      let match;
      const _count = 0;

      // 🚀 激进性能优化策略 - 基于ArtPlayer源码深度分析
      // 核心问题: 大量弹幕导致内存占用和计算密集
      // 解决方案: 智能分段加载 + 动态密度控制 + 预计算优化

      const SEGMENT_DURATION = 300; // 5分钟分段
      const MAX_DANMU_PER_SEGMENT = 500; // 每段最大弹幕数
      // const MAX_CONCURRENT_DANMU = 50; // 同时显示的最大弹幕数 - 在前端控制
      const BATCH_SIZE = 200; // 减小批处理大小，更频繁让出控制权

      const timeSegments: { [key: number]: DanmuItem[] } = {};
      let totalProcessed = 0;
      let batchCount = 0;

      while ((match = danmakuRegex.exec(responseText)) !== null) {
        try {
          const pAttr = match[1];
          const text = match[2];

          if (!pAttr || !text) continue;

          // 🔥 激进预过滤: 更严格的质量控制
          const trimmedText = text.trim();
          if (
            trimmedText.length === 0 ||
            trimmedText.length > 50 || // 更严格的长度限制
            trimmedText.length < 2 || // 过短弹幕通常是无意义的
            /^[^\u4e00-\u9fa5a-zA-Z0-9]+$/.test(trimmedText) || // 纯符号弹幕
            trimmedText.includes('弹幕正在赶来') ||
            trimmedText.includes('视频不错') ||
            trimmedText.includes('666') ||
            /^\d+$/.test(trimmedText) || // 纯数字弹幕
            /^[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]+$/.test(trimmedText)
          ) {
            // 纯标点符号
            continue;
          }

          // XML格式解析
          const params = pAttr.split(',');
          if (params.length < 4) continue;

          const time = parseFloat(params[0]) || 0;
          const mode = parseInt(params[1]) || 0;
          const colorInt = parseInt(params[3]) || 16777215;

          // 时间范围和有效性检查
          if (time < 0 || time > 86400 || !Number.isFinite(time)) continue;

          // 🎯 智能分段: 按时间分段存储，便于按需加载
          const segmentIndex = Math.floor(time / SEGMENT_DURATION);
          if (!timeSegments[segmentIndex]) {
            timeSegments[segmentIndex] = [];
          }

          // 🎯 密度控制: 每段限制弹幕数量，优先保留质量高的
          if (timeSegments[segmentIndex].length >= MAX_DANMU_PER_SEGMENT) {
            // 如果当前段已满，随机替换（保持弹幕多样性）
            if (Math.random() < 0.1) {
              // 10%概率替换
              const randomIndex = Math.floor(
                Math.random() * timeSegments[segmentIndex].length,
              );
              timeSegments[segmentIndex][randomIndex] = {
                text: trimmedText,
                time: time,
                color:
                  '#' + colorInt.toString(16).padStart(6, '0').toUpperCase(),
                mode: mode === 5 ? 1 : mode === 4 ? 2 : 0,
              };
            }
            continue;
          }

          timeSegments[segmentIndex].push({
            text: trimmedText,
            time: time,
            color: '#' + colorInt.toString(16).padStart(6, '0').toUpperCase(),
            mode: mode === 5 ? 1 : mode === 4 ? 2 : 0,
          });

          totalProcessed++;
          batchCount++;

          // 🔄 更频繁的批量处理控制
          if (batchCount >= BATCH_SIZE) {
            await new Promise((resolve) => setTimeout(resolve, 0));
            batchCount = 0;

            // 进度反馈，避免用户以为卡死
          }
        } catch (error) {
          console.error(`❌ 解析第${totalProcessed}条XML弹幕失败:`, error);
        }
      }

      // 🎯 将分段数据重新整合为时间排序的数组

      for (const segmentIndex of Object.keys(timeSegments).sort(
        (a, b) => parseInt(a) - parseInt(b),
      )) {
        const segment = timeSegments[parseInt(segmentIndex)];
        // 段内按时间排序，提高播放时的查找效率
        segment.sort((a, b) => a.time - b.time);
        danmuList.push(...segment);
      }


      if (danmuList.length === 0) {
        continue; // 尝试下一个API
      }

      // 🎯 优化后的最终处理，避免重复操作
      // 由于上面已经分段排序，这里只需要简单去重和最终验证
      const filteredDanmu = danmuList.filter(
        (item) =>
          !item.text.includes('官方弹幕库') && !item.text.includes('哔哩哔哩'), // 额外过滤平台相关内容
      );

      // 🚀 性能统计和限制
      const maxAllowedDanmu = 20000; // 设置合理的最大弹幕数量
      let finalDanmu = filteredDanmu;

      if (filteredDanmu.length > maxAllowedDanmu) {
        console.warn(
          `⚠️ 弹幕数量过多 (${filteredDanmu.length})，采用智能采样至 ${maxAllowedDanmu} 条`,
        );

        // 🎯 智能采样：保持时间分布均匀
        const sampleRate = maxAllowedDanmu / filteredDanmu.length;
        finalDanmu = filteredDanmu
          .filter((_, index) => {
            return (
              index === 0 || // 保留第一条
              index === filteredDanmu.length - 1 || // 保留最后一条
              Math.random() < sampleRate || // 随机采样
              index % Math.ceil(1 / sampleRate) === 0
            ); // 均匀采样
          })
          .slice(0, maxAllowedDanmu);
      }


      // 🎯 优化统计信息，减少不必要的计算
      if (finalDanmu.length > 0) {
        const firstTime = finalDanmu[0].time;
        const lastTime = finalDanmu[finalDanmu.length - 1].time;
        const _duration = lastTime - firstTime;


        // 只在弹幕较少时显示详细统计
      }

      return finalDanmu; // 成功获取优化后的弹幕
    } catch (error) {
      if (
        error instanceof Error &&
        (error.name === 'TimeoutError' || error.name === 'AbortError')
      ) {
        console.error(`❌ ${apiName}请求超时 (${timeout / 1000}秒):`, videoUrl);
      } else {
        console.error(`❌ ${apiName}请求失败:`, error);
      }
      // 继续尝试下一个API
    }
  }

  // 所有API都失败了
  return [];
}

// 从danmu.icu获取弹幕数据
async function fetchDanmuFromAPI(videoUrl: string): Promise<DanmuItem[]> {
  // 根据平台设置不同的超时时间
  let timeout = 20000; // 默认20秒
  if (videoUrl.includes('iqiyi.com')) {
    timeout = 30000; // 爱奇艺30秒
  } else if (videoUrl.includes('youku.com')) {
    timeout = 25000; // 优酷25秒
  } else if (videoUrl.includes('mgtv.com') || videoUrl.includes('w.mgtv.com')) {
    timeout = 25000; // 芒果TV25秒
  }

  try {
    const apiUrl = `https://api.danmu.icu/?url=${encodeURIComponent(videoUrl)}`;

    const response = await withAbortableTimeout(
      (signal) =>
        fetch(apiUrl, {
          signal,
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            Accept: 'application/json, text/plain, */*',
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
            Referer: 'https://danmu.icu/',
          },
        }),
      timeout
    );

    if (!response.ok) {
      return [];
    }

    const responseText = await response.text();

    let data: DanmuApiResponse;
    try {
      data = JSON.parse(responseText);
    } catch (parseError) {
      console.error('❌ JSON解析失败:', parseError);
      return [];
    }

    if (!data.danmuku || !Array.isArray(data.danmuku)) return [];

    // 转换为Artplayer格式
    // API返回格式: [时间, 位置, 颜色, "", 文本, "", "", "字号"]

    const danmuList = data.danmuku
      .map((item: any[]) => {
        // 正确解析时间 - 第一个元素就是时间(秒)
        const time = parseFloat(item[0]) || 0;
        const text = (item[4] || '').toString().trim();
        const color = item[2] || '#FFFFFF';

        // 转换位置: top=1顶部, bottom=2底部, right=0滚动
        let mode = 0;
        if (item[1] === 'top') mode = 1;
        else if (item[1] === 'bottom') mode = 2;
        else mode = 0; // right 或其他都是滚动

        return {
          text: text,
          time: time,
          color: color,
          mode: mode,
        };
      })
      .filter((item) => {
        const valid =
          item.text.length > 0 &&
          !item.text.includes('弹幕正在赶来') &&
          !item.text.includes('官方弹幕库') &&
          item.time >= 0;
        return valid;
      })
      .sort((a, b) => a.time - b.time); // 按时间排序

    // 显示时间分布统计
    const _timeStats = danmuList.reduce(
      (acc, item) => {
        const timeRange = Math.floor(item.time / 60); // 按分钟分组
        acc[timeRange] = (acc[timeRange] || 0) + 1;
        return acc;
      },
      {} as Record<number, number>,
    );


    return danmuList;
  } catch (error) {
    if (
      error instanceof Error &&
      (error.name === 'TimeoutError' || error.name === 'AbortError')
    ) {
      console.error(`❌ 弹幕API请求超时 (${timeout / 1000}秒):`, videoUrl);
    } else {
      console.error('❌ 获取弹幕失败:', error);
    }
    return [];
  }
}

export { fetchDanmuFromAPI,fetchDanmuFromXMLAPI };
