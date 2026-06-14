/** @type {import('next').NextConfig} */
/* eslint-disable @typescript-eslint/no-var-requires */

const isProd = process.env.NODE_ENV === 'production';

const nextConfig = {
  output: 'standalone',
  eslint: {
    // Warning: This allows production builds to successfully complete even if ESLint warnings exist
    ignoreDuringBuilds: true,
    dirs: ['src'],
  },

  reactStrictMode: true,
  swcMinify: true,

  experimental: {
    instrumentationHook: isProd,
  },

  // 🔥 全局强制动态渲染，避免构建时数据库访问问题
  generateBuildId: async () => {
    return 'build'
  },

  // 禁用静态优化，强制所有页面动态渲染
  trailingSlash: false,

  // 完全禁用静态生成，强制所有路由动态渲染
  async rewrites() {
    return [
      // 所有API路由都强制动态渲染
      {
        source: '/api/:path*',
        destination: '/api/:path*',
      },
    ]
  },

  // 🔥 生产环境移除 console.* 但保留 console.error 和 console.warn
  compiler: isProd
    ? {
        removeConsole: {
          exclude: ['error', 'warn'],
        },
      }
    : {},

  experimental: {
    instrumentationHook: isProd,
  },

  // 静态资源缓存配置
  async headers() {
    return [
      {
        source: '/slot-symbols/(.*)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable', // 1年缓存，资源不可变
          },
          {
            key: 'Expires',
            value: new Date(Date.now() + 31536000000).toUTCString(), // 1年后过期
          },
        ],
      },
      {
        source: '/sounds/(.*)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable, stale-while-revalidate=86400', // 1年缓存 + 24小时过期宽限期
          },
          {
            key: 'Expires',
            value: new Date(Date.now() + 31536000000).toUTCString(), // 1年后过期
          },
          {
            key: 'ETag',
            value: '"v1"', // ETag 用于资源版本验证
          },
        ],
      },
      {
        // 为其他静态资源添加缓存（图片、音频、视频等）
        source: '/_next/static/(.*)',
        headers: [
          {
            key: 'Cache-Control',
            // dev 环境下 _next/static 的文件名不带内容 hash，若强缓存会导致：
            // 1) 修改代码后浏览器继续使用旧 chunk（演员阵容/豆瓣短评等 UI 不更新）
            // 2) 本地同时运行多个 Next 项目时静态资源互相串缓存
            value: isProd
              ? 'public, max-age=31536000, immutable'
              : 'no-store, must-revalidate',
          },
        ],
      },
      {
        // 为 manifest.json 和 PWA 资源添加缓存
        source: '/(manifest\\.json|sw\\.js|workbox-.*\\.js)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=0, must-revalidate', // 每次检查更新
          },
        ],
      },
    ];
  },

  // Uncoment to add domain whitelist
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
      {
        protocol: 'http',
        hostname: '**',
      },
    ],
  },

  webpack(config) {
    // Grab the existing rule that handles SVG imports
    const fileLoaderRule = config.module.rules.find((rule) =>
      rule.test?.test?.('.svg')
    );

    config.module.rules.push(
      // Reapply the existing rule, but only for svg imports ending in ?url
      {
        ...fileLoaderRule,
        test: /\.svg$/i,
        resourceQuery: /url/, // *.svg?url
      },
      // Convert all other *.svg imports to React components
      {
        test: /\.svg$/i,
        issuer: { not: /\.(css|scss|sass)$/ },
        resourceQuery: { not: /url/ }, // exclude if *.svg?url
        loader: '@svgr/webpack',
        options: {
          dimensions: false,
          titleProp: true,
        },
      }
    );

    // Modify the file loader rule to ignore *.svg, since we have it handled now.
    fileLoaderRule.exclude = /\.svg$/i;

    config.resolve.fallback = {
      ...config.resolve.fallback,
      net: false,
      tls: false,
      crypto: false,
    };

    return config;
  },
};

// 暂时禁用PWA以解决缓存问题
const withPWA = (config) => config;

module.exports = withPWA(nextConfig);
