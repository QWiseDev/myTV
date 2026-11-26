/* eslint-disable @typescript-eslint/no-explicit-any, no-console */

import he from 'he';

import { withAbortableTimeout } from '@/lib/promise-timeout';

import type { DanmuItem } from './types';

interface DanmuApiResponse {
  code: number;
  name: string;
  danum: number;
  danmuku: any[];
}

function normalizeXmlDanmuText(rawText: string): string {
  const unwrapped = rawText
    .replace(/^<!\[CDATA\[([\s\S]*?)\]\]>$/, '$1')
    .trim();
  if (!unwrapped) return '';
  return he.decode(unwrapped).trim();
}

function formatDecimalColor(rawColor: unknown): string {
  const colorInt = Number.parseInt(String(rawColor ?? '16777215'), 10);
  if (!Number.isInteger(colorInt) || colorInt < 0 || colorInt > 0xffffff) {
    return '#FFFFFF';
  }
  return '#' + colorInt.toString(16).padStart(6, '0').toUpperCase();
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
        timeout,
      );

      if (!response.ok) {
        continue; // 尝试下一个API
      }

      const responseText = await response.text();

      // 使用正则表达式解析XML（Node.js兼容，支持 CDATA 与实体解码）
      const danmakuRegex = /<d p="([^"]*)"[^>]*>([\s\S]*?)<\/d>/g;
      const danmuList: DanmuItem[] = [];
      let match;

      const SEGMENT_DURATION = 300; // 5分钟分段
      const MAX_DANMU_PER_SEGMENT = 500; // 每段最大弹幕数
      const BATCH_SIZE = 200; // 让出事件循环避免长 XML 阻塞

      const timeSegments: { [key: number]: DanmuItem[] } = {};
      let totalProcessed = 0;
      let batchCount = 0;

      while ((match = danmakuRegex.exec(responseText)) !== null) {
        try {
          const pAttr = match[1];
          const rawText = match[2];

          if (!pAttr || !rawText) continue;

          const trimmedText = normalizeXmlDanmuText(rawText);
          if (
            trimmedText.length === 0 ||
            trimmedText.length > 200 ||
            /^[^\u4e00-\u9fa5a-zA-Z0-9]+$/.test(trimmedText) ||
            trimmedText.includes('弹幕正在赶来')
          ) {
            continue;
          }

          const params = pAttr.split(',');
          if (params.length < 4) continue;

          const time = Number.parseFloat(params[0]);
          const mode = Number.parseInt(params[1], 10) || 0;

          if (!Number.isFinite(time) || time < 0 || time > 86400) continue;

          const item: DanmuItem = {
            text: trimmedText,
            time,
            color: formatDecimalColor(params[3]),
            mode: mode === 5 ? 1 : mode === 4 ? 2 : 0,
          };

          const segmentIndex = Math.floor(time / SEGMENT_DURATION);
          if (!timeSegments[segmentIndex]) {
            timeSegments[segmentIndex] = [];
          }

          if (timeSegments[segmentIndex].length >= MAX_DANMU_PER_SEGMENT) {
            if (Math.random() < 0.1) {
              const randomIndex = Math.floor(
                Math.random() * timeSegments[segmentIndex].length,
              );
              timeSegments[segmentIndex][randomIndex] = item;
            }
            continue;
          }

          timeSegments[segmentIndex].push(item);

          totalProcessed++;
          batchCount++;

          if (batchCount >= BATCH_SIZE) {
            await new Promise((resolve) => setTimeout(resolve, 0));
            batchCount = 0;
          }
        } catch (error) {
          console.error(`❌ 解析第${totalProcessed}条XML弹幕失败:`, error);
        }
      }

      for (const segmentIndex of Object.keys(timeSegments).sort(
        (a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10),
      )) {
        const segment = timeSegments[Number.parseInt(segmentIndex, 10)];
        segment.sort((a, b) => a.time - b.time);
        danmuList.push(...segment);
      }

      if (danmuList.length === 0) {
        continue;
      }

      const filteredDanmu = danmuList.filter(
        (item) =>
          !item.text.includes('官方弹幕库') && !item.text.includes('哔哩哔哩'),
      );

      const maxAllowedDanmu = 20000;
      let finalDanmu = filteredDanmu;

      if (filteredDanmu.length > maxAllowedDanmu) {
        console.warn(
          `⚠️ 弹幕数量过多 (${filteredDanmu.length})，采用智能采样至 ${maxAllowedDanmu} 条`,
        );

        const sampleRate = maxAllowedDanmu / filteredDanmu.length;
        finalDanmu = filteredDanmu
          .filter((_, index) => {
            return (
              index === 0 ||
              index === filteredDanmu.length - 1 ||
              Math.random() < sampleRate ||
              index % Math.ceil(1 / sampleRate) === 0
            );
          })
          .slice(0, maxAllowedDanmu);
      }

      return finalDanmu;
    } catch (error) {
      if (
        error instanceof Error &&
        (error.name === 'TimeoutError' || error.name === 'AbortError')
      ) {
        console.error(`❌ ${apiName}请求超时 (${timeout / 1000}秒):`, videoUrl);
      } else {
        console.error(`❌ ${apiName}请求失败:`, error);
      }
    }
  }

  return [];
}

// 从danmu.icu获取弹幕数据
async function fetchDanmuFromAPI(videoUrl: string): Promise<DanmuItem[]> {
  let timeout = 20000;
  if (videoUrl.includes('iqiyi.com')) {
    timeout = 30000;
  } else if (videoUrl.includes('youku.com')) {
    timeout = 25000;
  } else if (videoUrl.includes('mgtv.com') || videoUrl.includes('w.mgtv.com')) {
    timeout = 25000;
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
      timeout,
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

    const danmuList = data.danmuku
      .slice(0, 50000)
      .map((item: unknown): DanmuItem | null => {
        if (!Array.isArray(item)) return null;
        const time = Number.parseFloat(String(item[0]));
        const text = String(item[4] ?? '').trim();
        const rawColor =
          typeof item[2] === 'string' && item[2].trim()
            ? item[2].trim()
            : '#FFFFFF';
        const color = /^#[0-9a-f]{6}$/i.test(rawColor)
          ? rawColor.toUpperCase()
          : '#FFFFFF';

        let mode = 0;
        if (item[1] === 'top') mode = 1;
        else if (item[1] === 'bottom') mode = 2;

        return {
          text: text.slice(0, 1000),
          time,
          color,
          mode,
        };
      })
      .filter((item): item is DanmuItem => {
        if (!item) return false;
        return (
          item.text.length > 0 &&
          !item.text.includes('弹幕正在赶来') &&
          !item.text.includes('官方弹幕库') &&
          Number.isFinite(item.time) &&
          item.time >= 0 &&
          item.time <= 86400
        );
      })
      .sort((a, b) => a.time - b.time)
      .slice(0, 20000);

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

export { fetchDanmuFromAPI, fetchDanmuFromXMLAPI };
