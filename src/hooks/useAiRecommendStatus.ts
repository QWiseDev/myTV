import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { DELAYS } from '@/lib/constants/home';

// 服务端渲染时 useLayoutEffect 会告警，退回 useEffect
const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect;

const AI_STATUS_CACHE_KEY = 'home_ai_status_cache_v1';
const AI_STATUS_CACHE_TTL = 12 * 60 * 60 * 1000;

function readCachedAiStatus(): boolean | null {
  try {
    const cached = localStorage.getItem(AI_STATUS_CACHE_KEY);
    if (!cached) return null;

    const parsed = JSON.parse(cached) as {
      enabled: boolean;
      timestamp: number;
    };

    if (
      typeof parsed.enabled === 'boolean' &&
      typeof parsed.timestamp === 'number' &&
      Date.now() - parsed.timestamp < AI_STATUS_CACHE_TTL
    ) {
      return parsed.enabled;
    }
  } catch {
    try {
      localStorage.removeItem(AI_STATUS_CACHE_KEY);
    } catch {
      /* 存储不可用时忽略 */
    }
  }

  return null;
}

function cacheAiStatus(enabled: boolean) {
  try {
    localStorage.setItem(
      AI_STATUS_CACHE_KEY,
      JSON.stringify({
        enabled,
        timestamp: Date.now(),
      }),
    );
  } catch {
    /* 隐私模式或配额满时忽略，不影响页面渲染 */
  }
}

export function useAiRecommendStatus() {
  const [aiEnabled, setAiEnabled] = useState(false);
  const aiCheckTriggeredRef = useRef(false);

  // 用 layout effect 在首次绘制前读取本地缓存，避免 AI 按钮晚一帧出现把内容顶下去
  useIsomorphicLayoutEffect(() => {
    if (aiCheckTriggeredRef.current || typeof window === 'undefined') return;

    const cachedAiStatus = readCachedAiStatus();
    if (cachedAiStatus !== null) {
      setAiEnabled(cachedAiStatus);
      aiCheckTriggeredRef.current = true;
      return;
    }

    const checkAIStatus = async () => {
      try {
        const response = await fetch('/api/ai-recommend/status');
        const data = response.ok
          ? await response.json().catch(() => ({ enabled: false }))
          : { enabled: false };
        const enabled = response.ok ? Boolean(data.enabled) : false;
        setAiEnabled(enabled);
        if (response.ok || response.status === 401 || response.status === 403) {
          cacheAiStatus(enabled);
        }
      } catch {
        setAiEnabled(false);
      } finally {
        aiCheckTriggeredRef.current = true;
      }
    };

    const timeoutId = setTimeout(checkAIStatus, DELAYS.AI_STATUS_CHECK);
    return () => clearTimeout(timeoutId);
  }, []);

  return aiEnabled;
}
