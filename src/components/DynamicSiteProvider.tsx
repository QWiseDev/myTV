'use client';

import { useEffect, useState } from 'react';

import { SiteProvider } from './SiteProvider';

interface DynamicSiteProviderProps {
  children: React.ReactNode;
  fallbackSiteName: string;
  fallbackAnnouncement?: string;
}

type RuntimeConfigWindow = Window & {
  RUNTIME_CONFIG?: Record<string, string | boolean>;
};

export function DynamicSiteProvider({
  children,
  fallbackSiteName,
  fallbackAnnouncement,
}: DynamicSiteProviderProps) {
  const [siteName, setSiteName] = useState(fallbackSiteName);
  const [announcement, setAnnouncement] = useState(fallbackAnnouncement);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // 客户端获取管理员配置中的站点名称
    const fetchSiteConfig = async () => {
      try {
        const response = await fetch('/api/server-config');
        if (response.ok) {
          const data = await response.json();
          console.log('[DynamicSiteProvider] 获取到服务器配置:', data);
          if (data.SiteName) {
            setSiteName(data.SiteName);
            console.log('[DynamicSiteProvider] 使用管理员配置的站点名称:', data.SiteName);
          }
          const runtimeConfig = (window as RuntimeConfigWindow).RUNTIME_CONFIG || {};
          (window as RuntimeConfigWindow).RUNTIME_CONFIG = {
            ...runtimeConfig,
            DOUBAN_PROXY_TYPE: data.DoubanProxyType ?? runtimeConfig.DOUBAN_PROXY_TYPE,
            DOUBAN_PROXY: data.DoubanProxy ?? runtimeConfig.DOUBAN_PROXY,
            DOUBAN_IMAGE_PROXY_TYPE:
              data.DoubanImageProxyType ?? runtimeConfig.DOUBAN_IMAGE_PROXY_TYPE,
            DOUBAN_IMAGE_PROXY:
              data.DoubanImageProxy ?? runtimeConfig.DOUBAN_IMAGE_PROXY,
            DISABLE_YELLOW_FILTER:
              data.DisableYellowFilter ?? runtimeConfig.DISABLE_YELLOW_FILTER,
            FLUID_SEARCH: data.FluidSearch ?? runtimeConfig.FLUID_SEARCH,
          };
        }
      } catch (error) {
        console.error('[DynamicSiteProvider] 获取站点配置失败:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchSiteConfig();
  }, []);

  // 如果还在加载中，使用fallback值
  if (isLoading) {
    return (
      <SiteProvider siteName={fallbackSiteName} announcement={fallbackAnnouncement}>
        {children}
      </SiteProvider>
    );
  }

  return (
    <SiteProvider siteName={siteName} announcement={announcement}>
      {children}
    </SiteProvider>
  );
}
