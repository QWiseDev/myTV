'use client';

import { useEffect, useRef } from 'react';

const CUSTOM_AD_FILTER_CODE_CACHE_KEY = 'custom_ad_filter_code_cache';
const CUSTOM_AD_FILTER_VERSION_CACHE_KEY = 'custom_ad_filter_version_cache';

/**
 * 加载自定义去广告规则代码：
 * 优先读 localStorage 缓存立即生效，后台比对 /api/ad-filter 版本号，
 * 版本变化时重新拉取完整规则并回写缓存。
 */
export function useCustomAdFilterCode() {
  const customAdFilterCodeRef = useRef('');

  useEffect(() => {
    let cancelled = false;

    const loadCustomAdFilterCode = async () => {
      try {
        const cachedCode = localStorage.getItem(CUSTOM_AD_FILTER_CODE_CACHE_KEY);
        const cachedVersion = localStorage.getItem(
          CUSTOM_AD_FILTER_VERSION_CACHE_KEY,
        );

        if (cachedCode) {
          customAdFilterCodeRef.current = cachedCode;
        }

        const versionResponse = await fetch('/api/ad-filter');
        if (!versionResponse.ok) {
          return;
        }

        const versionPayload = (await versionResponse.json()) as {
          version?: unknown;
        };
        const version =
          typeof versionPayload.version === 'number'
            ? versionPayload.version
            : Number(versionPayload.version) || 0;

        if (cancelled) return;

        if (version <= 0) {
          localStorage.removeItem(CUSTOM_AD_FILTER_CODE_CACHE_KEY);
          localStorage.removeItem(CUSTOM_AD_FILTER_VERSION_CACHE_KEY);
          customAdFilterCodeRef.current = '';
          return;
        }

        if (cachedCode && cachedVersion === String(version)) {
          return;
        }

        const fullResponse = await fetch('/api/ad-filter?full=true');
        if (!fullResponse.ok) {
          return;
        }

        const fullPayload = (await fullResponse.json()) as {
          code?: unknown;
        };
        const code =
          typeof fullPayload.code === 'string' ? fullPayload.code : '';

        if (cancelled) return;

        if (code) {
          localStorage.setItem(CUSTOM_AD_FILTER_CODE_CACHE_KEY, code);
          localStorage.setItem(
            CUSTOM_AD_FILTER_VERSION_CACHE_KEY,
            String(version),
          );
          customAdFilterCodeRef.current = code;
        } else {
          localStorage.removeItem(CUSTOM_AD_FILTER_CODE_CACHE_KEY);
          localStorage.removeItem(CUSTOM_AD_FILTER_VERSION_CACHE_KEY);
          customAdFilterCodeRef.current = '';
        }
      } catch (error) {
        if (process.env.NODE_ENV === 'development') {
          console.warn('加载自定义去广告代码失败:', error);
        }
      }
    };

    void loadCustomAdFilterCode();

    return () => {
      cancelled = true;
    };
  }, []);

  return customAdFilterCodeRef;
}
