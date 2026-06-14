/* eslint-disable @typescript-eslint/no-explicit-any */

import type { Metadata, Viewport } from 'next';

// import { Inter } from 'next/font/google'; // 暂时注释掉，避免网络问题
import './globals.css';

import { ClarityProvider } from '@/components/ClarityProvider';

import { GlobalErrorIndicator } from '../components/GlobalErrorIndicator';
import { SessionTracker } from '../components/SessionTracker';
import { SiteProvider } from '../components/SiteProvider';
import { ThemeProvider } from '../components/ThemeProvider';

// 暂时注释掉Google字体，使用系统字体
// const inter = Inter({
//   subsets: ['latin'],
//   display: 'swap',
//   fallback: ['system-ui', 'sans-serif'],
// });
export const dynamic = 'force-dynamic';

// 动态生成 metadata，支持配置更新后的标题变化
export async function generateMetadata(): Promise<Metadata> {
  // 🔥 构建时避免数据库调用，只使用环境变量
  const siteName = process.env.NEXT_PUBLIC_SITE_NAME || '卡拉米影视';

  return {
    title: siteName,
    description: '影视聚合',
    manifest: '/manifest.json',
  };
}

export const viewport: Viewport = {
  viewportFit: 'cover',
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // 🔥 构建时避免数据库调用，只使用环境变量默认值
  const storageType = process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage';

  const siteName = process.env.NEXT_PUBLIC_SITE_NAME || '卡拉米影视';
  const announcement =
    process.env.ANNOUNCEMENT ||
    '本网站仅提供影视信息搜索服务，所有内容均来自第三方网站。本站不存储任何视频资源，不对任何内容的准确性、合法性、完整性负责。';

  const doubanProxyType = process.env.NEXT_PUBLIC_DOUBAN_PROXY_TYPE || 'direct';
  const doubanProxy = process.env.NEXT_PUBLIC_DOUBAN_PROXY || '';
  const doubanImageProxyType =
    process.env.NEXT_PUBLIC_DOUBAN_IMAGE_PROXY_TYPE || 'direct';
  const doubanImageProxy = process.env.NEXT_PUBLIC_DOUBAN_IMAGE_PROXY || '';
  const disableYellowFilter =
    process.env.NEXT_PUBLIC_DISABLE_YELLOW_FILTER === 'true';
  const fluidSearch = process.env.NEXT_PUBLIC_FLUID_SEARCH !== 'false';

  // 🔥 自定义分类在客户端动态加载，构建时使用空数组
  const customCategories: {
    name: string;
    type: 'movie' | 'tv';
    query: string;
  }[] = [];

  // 注意：只有在 storageType 为 'localstorage' 时才使用环境变量配置
  // 其他配置会在客户端通过 API 动态获取

  // 将运行时配置注入到全局 window 对象，供客户端在运行时读取
  const runtimeConfig = {
    STORAGE_TYPE: process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage',
    DOUBAN_PROXY_TYPE: doubanProxyType,
    DOUBAN_PROXY: doubanProxy,
    DOUBAN_IMAGE_PROXY_TYPE: doubanImageProxyType,
    DOUBAN_IMAGE_PROXY: doubanImageProxy,
    DISABLE_YELLOW_FILTER: disableYellowFilter,
    CUSTOM_CATEGORIES: customCategories,
    FLUID_SEARCH: fluidSearch,
    CLARITY_PROJECT_ID: process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID || 'u6fla6fy8x',
    CLARITY_ENABLED: process.env.NODE_ENV === 'production', // 仅在生产环境启用
  };

  return (
    <html lang='zh-CN' suppressHydrationWarning>
      <head>
        <meta
          name='viewport'
          content='width=device-width, initial-scale=1.0, viewport-fit=cover'
        />
        <link rel='apple-touch-icon' href='/icons/icon-192x192.png' />
        {/* 处理字体加载失败 */}
        <style
          dangerouslySetInnerHTML={{
            __html: `
              .font-loading {
                font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Helvetica Neue', Helvetica, Arial, sans-serif;
              }
            `,
          }}
        />
        {/* 将配置序列化后直接写入脚本，浏览器端可通过 window.RUNTIME_CONFIG 获取 */}
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script
          dangerouslySetInnerHTML={{
            __html: `window.RUNTIME_CONFIG = ${JSON.stringify(runtimeConfig)};`,
          }}
        />
      </head>
      <body
        className="min-h-screen bg-white text-gray-900 dark:bg-black dark:text-gray-200 font-loading"
      >
        <ThemeProvider
          attribute='class'
          defaultTheme='system'
          enableSystem
          disableTransitionOnChange
        >
          {/* 仅在生产环境启用 ClarityProvider */}
          {runtimeConfig.CLARITY_ENABLED ? (
            <ClarityProvider
              projectId={runtimeConfig.CLARITY_PROJECT_ID}
              enable={true}
            >
              <SiteProvider siteName={siteName} announcement={announcement}>
                <SessionTracker />
                {children}
                <GlobalErrorIndicator />
              </SiteProvider>
            </ClarityProvider>
          ) : (
            <SiteProvider siteName={siteName} announcement={announcement}>
              <SessionTracker />
              {children}
              <GlobalErrorIndicator />
            </SiteProvider>
          )}
        </ThemeProvider>
      </body>
    </html>
  );
}
