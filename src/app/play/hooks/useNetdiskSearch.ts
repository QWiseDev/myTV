import { useState } from 'react';

import type { NetDiskResults } from '@/app/play/types';

interface UseNetdiskSearchReturn {
  netdiskResults: NetDiskResults | null;
  netdiskLoading: boolean;
  netdiskError: string | null;
  netdiskTotal: number;
  handleNetDiskSearch: (query: string) => Promise<void>;
}

export const useNetdiskSearch = (): UseNetdiskSearchReturn => {
  const [netdiskResults, setNetdiskResults] = useState<NetDiskResults | null>(
    null,
  );
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

      if (data.success) {
        setNetdiskResults(data.data.merged_by_type || {});
        setNetdiskTotal(data.data.total || 0);
      } else {
        setNetdiskError(data.error || '网盘搜索失败');
      }
    } catch (error: unknown) {
      console.error('网盘搜索请求失败:', error);
      setNetdiskError('网盘搜索请求失败，请稍后重试');
    } finally {
      setNetdiskLoading(false);
    }
  };

  return {
    netdiskResults,
    netdiskLoading,
    netdiskError,
    netdiskTotal,
    handleNetDiskSearch,
  };
};
