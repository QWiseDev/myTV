# 静态资源缓存配置

## 概述

为老虎机游戏的图片和音频资源添加了强缓存头，避免重复请求浪费服务器资源，提升用户游戏体验。

## 缓存策略

### 1. 老虎机符号图片 (`/slot-symbols/`)
- **缓存时间**: 1年 (31536000秒)
- **缓存策略**: `public, max-age=31536000, immutable`
- **说明**: 图片资源通常不会变更，使用长期缓存

### 2. 音频文件 (`/sounds/`)
- **缓存时间**: 1年 (31536000秒)
- **缓存策略**: `public, max-age=31536000, immutable`
- **说明**: 音频文件为静态资源，使用长期缓存

### 3. Next.js 静态资源 (`/_next/static/`)
- **缓存时间**: 1年 (31536000秒)
- **缓存策略**: `public, max-age=31536000, immutable`
- **说明**: Next.js 构建的静态资源

### 4. PWA 资源 (`manifest.json`, `sw.js`, `workbox-*.js`)
- **缓存时间**: 立即验证
- **缓存策略**: `public, max-age=0, must-revalidate`
- **说明**: PWA 资源需要频繁检查更新

## 配置实现

### Next.js 配置 (`next.config.js`)

```javascript
async headers() {
  return [
    {
      source: '/slot-symbols/(.*)',
      headers: [
        {
          key: 'Cache-Control',
          value: 'public, max-age=31536000, immutable',
        },
        {
          key: 'Expires',
          value: new Date(Date.now() + 31536000000).toUTCString(),
        },
      ],
    },
    {
      source: '/sounds/(.*)',
      headers: [
        {
          key: 'Cache-Control',
          value: 'public, max-age=31536000, immutable',
        },
        {
          key: 'Expires',
          value: new Date(Date.now() + 31536000000).toUTCString(),
        },
      ],
    },
    // ... 更多配置
  ];
}
```

### 中间件配置 (`src/middleware.ts`)

更新了 `shouldSkipAuth` 函数，让静态资源绕过认证：

```typescript
const skipPaths = [
  // ... 其他路径
  '/slot-symbols/', // 老虎机符号图片
  '/sounds/', // 音频文件
];
```

## 缓存头说明

### Cache-Control: `public, max-age=31536000, immutable`
- **public**: 响应可被任何缓存（包括CDN）缓存
- **max-age=31536000**: 缓存有效期 1 年
- **immutable**: 资源内容不会改变，可无限期缓存

### Expires 头
- 提供 HTTP/1.1 兼容的过期时间
- 设置为当前时间 + 1 年

## 验证工具

### 1. 命令行验证

```bash
# 检查图片缓存头
curl -I http://localhost:3000/slot-symbols/j.png

# 检查音频缓存头
curl -I http://localhost:3000/sounds/mixkit-slot-machine-win-1928.wav
```

### 2. API 测试端点

访问 `/api/test-cache` 获取详细的缓存测试结果：

```json
{
  "success": true,
  "message": "静态资源缓存头测试结果",
  "results": [
    {
      "url": "/slot-symbols/j.png",
      "status": 200,
      "cacheControl": "public, max-age=31536000, immutable",
      "hasCache": true
    }
    // ... 更多结果
  ],
  "summary": {
    "total": 4,
    "withCache": 4,
    "withoutCache": 0
  }
}
```

## 性能收益

### 1. 减少服务器负载
- 图片和音频文件只请求一次
- 后续请求直接从浏览器缓存读取
- 减少带宽使用和服务器计算

### 2. 提升用户体验
- 老虎机符号图片即时加载
- 音效文件无需等待下载
- 游戏启动速度更快

### 3. 离线支持
- PWA 可缓存这些资源
- 支持离线游戏体验

## 注意事项

### 1. 文件更新
由于使用 `immutable` 标记，文件更新需要：
- 修改文件名（添加哈希值）
- 或清除浏览器缓存

### 2. CDN 兼容性
配置适用于各种 CDN 和代理服务器，确保最佳缓存效果。

### 3. 开发环境
开发环境下缓存行为可能与生产环境不同，这是正常的。