'use client';

import { useCallback, useState } from 'react';

import type { SecurityConfig } from '../_components/types';

/**
 * TVBox 配置链接的状态与操作：格式/模式选择、URL 拼装与复制。
 * 拆分自 TVBox 配置页原逻辑，行为原样保留。
 */
export function useTvboxConfigUrl(
  securityConfig: SecurityConfig | null,
  userToken: string,
) {
  const [copied, setCopied] = useState(false);
  const [format, setFormat] = useState<'json' | 'base64'>('json');
  const [configMode, setConfigMode] = useState<
    'standard' | 'safe' | 'fast' | 'yingshicang'
  >('standard');

  const getConfigUrl = useCallback(() => {
    if (typeof window === 'undefined') return '';
    const baseUrl = window.location.origin;
    const params = new URLSearchParams();

    params.append('format', format);

    // 🔑 优先使用用户专属 Token，如果没有则使用全局 Token
    if (userToken) {
      params.append('token', userToken);
    } else if (securityConfig?.enableAuth && securityConfig.token) {
      params.append('token', securityConfig.token);
    }

    // 添加配置模式参数
    if (configMode !== 'standard') {
      params.append('mode', configMode);
    }

    return `${baseUrl}/api/tvbox?${params.toString()}`;
  }, [format, configMode, securityConfig, userToken]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(getConfigUrl());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Copy failed silently
    }
  };

  return {
    copied,
    format,
    setFormat,
    configMode,
    setConfigMode,
    getConfigUrl,
    handleCopy,
  };
}
