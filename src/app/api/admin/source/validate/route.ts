/* eslint-disable @typescript-eslint/no-explicit-any,no-console */

import { NextRequest } from 'next/server';

import { requireAdmin } from '@/lib/admin-auth';
import { API_CONFIG } from '@/lib/config';

export const runtime = 'nodejs';

// 强制动态渲染，避免在构建时预生成
export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if ('response' in admin) return admin.response;

  const { searchParams } = new URL(request.url);
  const searchKeyword = searchParams.get('q');

  if (!searchKeyword) {
    return new Response(JSON.stringify({ error: '搜索关键词不能为空' }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  const config = admin.config;
  const apiSites = config.SourceConfig || [];

  // 共享状态与级联取消控制器
  let streamClosed = false;
  const streamAbortController = new AbortController();
  const handleRequestAbort = () => {
    streamClosed = true;
    streamAbortController.abort();
  };
  request.signal?.addEventListener('abort', handleRequestAbort, { once: true });

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
            return false;
          }
          controller.enqueue(data);
          return true;
        } catch (error) {
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
          totalSources: apiSites.length,
        })}\n\n`;

        if (!safeEnqueue(encoder.encode(startEvent))) {
          return;
        }

        // 记录已完成的源数量
        let completedSources = 0;

        if (apiSites.length === 0) {
          const completeEvent = `data: ${JSON.stringify({
            type: 'complete',
            completedSources: 0,
          })}\n\n`;
          if (safeEnqueue(encoder.encode(completeEvent))) {
            closeControllerSafely();
          }
          return;
        }

        // 为每个源创建验证 Promise
        const validationPromises = apiSites.map(async (site) => {
          if (streamClosed || streamAbortController.signal.aborted) {
            return;
          }

          // 设置超时与流关闭联动取消控制
          const fetchController = new AbortController();
          const onStreamAbort = () => fetchController.abort();
          streamAbortController.signal.addEventListener(
            'abort',
            onStreamAbort,
            { once: true },
          );
          const timeoutId = setTimeout(() => fetchController.abort(), 10000);

          try {
            const parsedApi = new URL(site.api);
            if (
              parsedApi.protocol !== 'http:' &&
              parsedApi.protocol !== 'https:'
            ) {
              throw new Error('Unsupported protocol');
            }

            // 构建搜索URL，只获取第一页
            const searchUrl = `${site.api}?ac=videolist&wd=${encodeURIComponent(
              searchKeyword,
            )}`;

            const response = await fetch(searchUrl, {
              headers: API_CONFIG.search.headers,
              signal: fetchController.signal,
            });

            if (!response.ok) {
              throw new Error(`HTTP ${response.status}`);
            }

            const data = (await response.json()) as any;

            // 检查结果是否有效
            let status: 'valid' | 'no_results' | 'invalid';
            if (
              data &&
              data.list &&
              Array.isArray(data.list) &&
              data.list.length > 0
            ) {
              // 检查是否有标题包含搜索词的结果
              const validResults = data.list.filter((item: any) => {
                const title = item.vod_name || '';
                return title
                  .toLowerCase()
                  .includes(searchKeyword.toLowerCase());
              });

              if (validResults.length > 0) {
                status = 'valid';
              } else {
                status = 'no_results';
              }
            } else {
              status = 'no_results';
            }

            // 发送该源的验证结果
            completedSources++;

            if (!streamClosed) {
              const sourceEvent = `data: ${JSON.stringify({
                type: 'source_result',
                source: site.key,
                status,
              })}\n\n`;

              if (!safeEnqueue(encoder.encode(sourceEvent))) {
                streamClosed = true;
                streamAbortController.abort();
                return;
              }
            }
          } catch (error) {
            if (streamClosed || streamAbortController.signal.aborted) {
              return;
            }
            console.warn(`验证失败 ${site.name}:`, error);

            // 发送源错误事件
            completedSources++;

            if (!streamClosed) {
              const errorEvent = `data: ${JSON.stringify({
                type: 'source_error',
                source: site.key,
                status: 'invalid',
              })}\n\n`;

              if (!safeEnqueue(encoder.encode(errorEvent))) {
                streamClosed = true;
                streamAbortController.abort();
                return;
              }
            }
          } finally {
            clearTimeout(timeoutId);
            streamAbortController.signal.removeEventListener(
              'abort',
              onStreamAbort,
            );
          }
        });

        // 等待所有验证完成
        await Promise.allSettled(validationPromises);

        if (!streamClosed) {
          const completeEvent = `data: ${JSON.stringify({
            type: 'complete',
            completedSources,
          })}\n\n`;

          if (safeEnqueue(encoder.encode(completeEvent))) {
            closeControllerSafely();
          }
        }
      } finally {
        request.signal?.removeEventListener('abort', handleRequestAbort);
      }
    },

    cancel() {
      streamClosed = true;
      streamAbortController.abort();
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
