import { useEffect, useRef, useState } from 'react';

import { DELAYS } from '@/lib/constants/home';

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
    localStorage.removeItem(AI_STATUS_CACHE_KEY);
  }

  return null;
}

function cacheAiStatus(enabled: boolean) {
  localStorage.setItem(
    AI_STATUS_CACHE_KEY,
    JSON.stringify({
      enabled,
      timestamp: Date.now(),
    }),
  );
}

export function useAiRecommendStatus() {
  const [aiEnabled, setAiEnabled] = useState(false);
  const aiCheckTriggeredRef = useRef(false);

  useEffect(() => {
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
