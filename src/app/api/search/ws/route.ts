/* eslint-disable @typescript-eslint/no-explicit-any,no-console */

import { NextRequest } from 'next/server';

import { requireUser } from '@/lib/auth';
import { getAvailableApiSites, getConfig } from '@/lib/config';
import { probeSiteSearchHealth, searchFromApi } from '@/lib/downstream';
import { withAbortableTimeout } from '@/lib/promise-timeout';
import {
  isSearchTimeoutError,
  markSiteSearchFailure,
  SEARCH_SITE_TIMEOUT_MS,
  shouldSkipSiteSearch,
} from '@/lib/site-health';
import { ensureUserAccessOrResponse } from '@/lib/user-access';
import { yellowWords } from '@/lib/yellow';

export const runtime = 'nodejs';

// 强制动态渲染，避免在构建时预生成
export async function GET(request: NextRequest) {
  const auth = await requireUser(request);
  if (!auth.authInfo) return auth.response;
  const authInfo = auth.authInfo;

  const guardResult = await ensureUserAccessOrResponse(
    authInfo.username,
    authInfo.timestamp,
  );
  if ('response' in guardResult) {
    return guardResult.response;
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');

  if (!query) {
    return new Response(JSON.stringify({ error: '搜索关键词不能为空' }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  const config = await getConfig();
  const apiSites = await getAvailableApiSites(authInfo.username);

  // 共享状态
  let streamClosed = false;
  const abortController = new AbortController();
  const handleAbort = () => {
    streamClosed = true;
    abortController.abort();
  };
  request.signal?.addEventListener('abort', handleAbort, { once: true });

  // 创建可读流
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      // 辅助函数：安全地向控制器写入数据
      const safeEnqueue = (data: Uint8Array) => {
        try {
          if (
            streamClosed ||
            (!controller.desiredSize && controller.desiredSize !== 0)
          ) {
            // 流已标记为关闭或控制器已关闭
            return false;
          }
          controller.enqueue(data);
          return true;
        } catch (error) {
          // 控制器已关闭或出现其他错误
          console.warn('Failed to enqueue data:', error);
          streamClosed = true;
          return false;
        }
      };

      const closeControllerSafely = () => {
        try {
          controller.close();
        } catch (error) {
          console.warn('Failed to close controller:', error);
        }
      };

      try {
        // 发送开始事件
        const startEvent = `data: ${JSON.stringify({
          type: 'start',
          query,
          totalSources: apiSites.length,
          timestamp: Date.now(),
        })}\n\n`;

        if (!safeEnqueue(encoder.encode(startEvent))) {
          return; // 连接已关闭，提前退出
        }

        // 记录已完成的源数量
        let completedSources = 0;
        const allResults: any[] = [];

        if (apiSites.length === 0) {
          const completeEvent = `data: ${JSON.stringify({
            type: 'complete',
            totalResults: 0,
            completedSources: 0,
            timestamp: Date.now(),
          })}\n\n`;
          if (safeEnqueue(encoder.encode(completeEvent))) {
            closeControllerSafely();
          }
          return;
        }

        // 为每个源创建搜索 Promise
        const searchPromises = apiSites.map(async (site) => {
          if (streamClosed || abortController.signal.aborted) {
            return;
          }

          const decision = shouldSkipSiteSearch(site.key);
          if (decision.skip) {
            if (decision.shouldBackgroundProbe) {
              void probeSiteSearchHealth(site);
            }
            // 熔断/半开中的站点直接跳过，仍推送空结果推进进度
            completedSources++;

            if (!streamClosed) {
              const skippedEvent = `data: ${JSON.stringify({
                type: 'source_result',
                source: site.key,
                sourceName: site.name,
                results: [],
                timestamp: Date.now(),
              })}\n\n`;

              if (!safeEnqueue(encoder.encode(skippedEvent))) {
                streamClosed = true;
                abortController.abort();
                return; // 连接已关闭，停止处理
              }
            }
            return;
          }

          try {
            // 添加超时控制与客户端断开级联取消（真实网络成功/失败由 downstream.ts 精准上报）
            const results = (await withAbortableTimeout(
              async () => searchFromApi(site, query),
              SEARCH_SITE_TIMEOUT_MS,
              abortController.signal,
            )) as any[];

            // 过滤黄色内容
            let filteredResults = results;
            if (!config.SiteConfig.DisableYellowFilter) {
              filteredResults = results.filter((result) => {
                const typeName = result.type_name || '';
                return !yellowWords.some((word: string) =>
                  typeName.includes(word),
                );
              });
            }

            // 发送该源的搜索结果
            completedSources++;

            if (!streamClosed) {
              const sourceEvent = `data: ${JSON.stringify({
                type: 'source_result',
                source: site.key,
                sourceName: site.name,
                results: filteredResults,
                timestamp: Date.now(),
              })}\n\n`;

              if (!safeEnqueue(encoder.encode(sourceEvent))) {
                streamClosed = true;
                abortController.abort();
                return; // 连接已关闭，停止处理
              }
            }

            if (filteredResults.length > 0) {
              allResults.push(...filteredResults);
            }
          } catch (error) {
            if (streamClosed || abortController.signal.aborted) {
              return;
            }
            console.warn(`搜索失败 ${site.name}:`, error);

            if (isSearchTimeoutError(error)) {
              markSiteSearchFailure(site.key, 'timeout');
            }

            // 发送源错误事件
            completedSources++;

            if (!streamClosed) {
              const errorEvent = `data: ${JSON.stringify({
                type: 'source_error',
                source: site.key,
                sourceName: site.name,
                error: error instanceof Error ? error.message : '搜索失败',
                timestamp: Date.now(),
              })}\n\n`;

              if (!safeEnqueue(encoder.encode(errorEvent))) {
                streamClosed = true;
                abortController.abort();
                return; // 连接已关闭，停止处理
              }
            }
          }
        });

        // 等待所有搜索完成
        await Promise.allSettled(searchPromises);

        if (!streamClosed) {
          const completeEvent = `data: ${JSON.stringify({
            type: 'complete',
            totalResults: allResults.length,
            completedSources,
            timestamp: Date.now(),
          })}\n\n`;

          if (safeEnqueue(encoder.encode(completeEvent))) {
            closeControllerSafely();
          }
        }
      } finally {
        request.signal?.removeEventListener('abort', handleAbort);
      }
    },

    cancel() {
      // 客户端断开连接时，标记流已关闭并取消未完成搜索
      streamClosed = true;
      abortController.abort();
    },
  });

  // 返回流式响应
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
