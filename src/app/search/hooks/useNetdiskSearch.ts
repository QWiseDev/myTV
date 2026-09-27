/* eslint-disable @typescript-eslint/no-explicit-any -- 与原搜索页实现逐字一致 */
'use client';

import { useState } from 'react';

/**
 * 网盘搜索：状态与请求逻辑拆分自搜索页原实现，请求路径、
 * success 字段判断与错误文案原样保留。
 */
export function useNetdiskSearch() {
  const [netdiskResults, setNetdiskResults] = useState<{
    [key: string]: any[];
  } | null>(null);
  const [netdiskLoading, setNetdiskLoading] = useState(false);
  const [netdiskError, setNetdiskError] = useState<string | null>(null);
  const [netdiskTotal, setNetdiskTotal] = useState(0);

  const handleNetDiskSearch = async (query: string) => {
    if (!query.trim()) return;

    setNetdiskLoading(true);
    setNetdiskError(null);
    setNetdiskResults(null);
    setNetdiskTotal(0);

    try {
      const response = await fetch(
        `/api/netdisk/search?q=${encodeURIComponent(query.trim())}`,
      );
      const data = await response.json();

      // 检查响应状态和success字段
      if (response.ok && data.success) {
        setNetdiskResults(data.data.merged_by_type || {});
        setNetdiskTotal(data.data.total || 0);
      } else {
        // 处理错误情况（包括功能关闭、配置错误等）
        setNetdiskError(data.error || '网盘搜索失败');
      }
    } catch (error: any) {
      console.error('网盘搜索请求失败:', error);
      setNetdiskError('网盘搜索请求失败，请稍后重试');
    } finally {
      setNetdiskLoading(false);
    }
  };

  return {
    netdiskResults,
    setNetdiskResults,
    netdiskLoading,
    netdiskError,
    setNetdiskError,
    netdiskTotal,
    setNetdiskTotal,
    handleNetDiskSearch,
  };
}
