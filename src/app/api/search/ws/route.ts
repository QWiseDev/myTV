/* eslint-disable no-console */

import { NextRequest } from 'next/server';

import { getConfig } from '@/lib/config';
import {
  authenticateSearchRequest,
  executeSingleSiteSearch,
  filterSearchResults,
  normalizeSearchQuery,
  resolveSearchSites,
} from '@/lib/search-service';
import type { SearchResult } from '@/lib/types';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const auth = await authenticateSearchRequest(request);
  if ('response' in auth) return auth.response;

  const { searchParams } = new URL(request.url);
  const query = normalizeSearchQuery(searchParams.get('q'));
  const group = searchParams.get('group');
  const forSource = searchParams.get('forSource') || '';

  if (!query) {
    return new Response(JSON.stringify({ error: '搜索关键词不能为空' }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    });
  }

  const config = await getConfig();
  const { isAdultSearch, apiSites } = await resolveSearchSites({
    username: auth.username,
    config,
    group,
    forSource,
  });

  let streamClosed = false;
  const abortController = new AbortController();
  const handleAbort = () => {
    streamClosed = true;
    abortController.abort();
  };
  request.signal?.addEventListener('abort', handleAbort, { once: true });

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      const enqueueEvent = (payload: Record<string, unknown>): boolean => {
        if (streamClosed) return false;
        try {
          if (!controller.desiredSize && controller.desiredSize !== 0) {
            streamClosed = true;
            abortController.abort();
            return false;
          }
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(payload)}\n\n`),
          );
          return true;
        } catch (error) {
          console.warn('SSE 写入失败:', error);
          streamClosed = true;
          abortController.abort();
          return false;
        }
      };

      const closeControllerSafely = () => {
        try {
          controller.close();
        } catch (error) {
          console.warn('关闭 SSE 流失败:', error);
        }
      };

      try {
        if (
          !enqueueEvent({
            type: 'start',
            query,
            totalSources: apiSites.length,
            timestamp: Date.now(),
          })
        ) {
          return;
        }

        let completedSources = 0;
        const allResults: SearchResult[] = [];

        if (apiSites.length === 0) {
          if (
            enqueueEvent({
              type: 'complete',
              totalResults: 0,
              completedSources: 0,
              timestamp: Date.now(),
            })
          ) {
            closeControllerSafely();
          }
          return;
        }

        const searchPromises = apiSites.map(async (site) => {
          if (streamClosed || abortController.signal.aborted) {
            return;
          }

          try {
            const outcome = await executeSingleSiteSearch(site, query, {
              signal: abortController.signal,
              throwOnError: true,
            });
            const filteredResults = outcome.skipped
              ? []
              : filterSearchResults(outcome.results, {
                  isAdultSearch,
                  disableYellowFilter: config.SiteConfig.DisableYellowFilter,
                });

            completedSources += 1;
            if (
              !enqueueEvent({
                type: 'source_result',
                source: site.key,
                sourceName: site.name,
                results: filteredResults,
                timestamp: Date.now(),
              })
            ) {
              return;
            }

            if (filteredResults.length > 0) {
              allResults.push(...filteredResults);
            }
          } catch (error) {
            if (streamClosed || abortController.signal.aborted) {
              return;
            }
            console.warn(`搜索失败 ${site.name}:`, error);

            completedSources += 1;
            enqueueEvent({
              type: 'source_error',
              source: site.key,
              sourceName: site.name,
              error: error instanceof Error ? error.message : '搜索失败',
              timestamp: Date.now(),
            });
          }
        });

        await Promise.allSettled(searchPromises);

        if (!streamClosed) {
          if (
            enqueueEvent({
              type: 'complete',
              totalResults: allResults.length,
              completedSources,
              timestamp: Date.now(),
            })
          ) {
            closeControllerSafely();
          }
        }
      } catch (error) {
        console.error('流式搜索失败:', error);
        if (!streamClosed) {
          enqueueEvent({
            type: 'error',
            error: '搜索失败',
            timestamp: Date.now(),
          });
          closeControllerSafely();
        }
      } finally {
        request.signal?.removeEventListener('abort', handleAbort);
      }
    },
    cancel() {
      handleAbort();
      request.signal?.removeEventListener('abort', handleAbort);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
