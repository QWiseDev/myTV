---
doc_type: audit-index
audit: 2026-06-08-live-runtime-bundle
scope: 直播页首屏运行时包体
created: 2026-06-08
status: resolved
total_findings: 1
---

# live-runtime-bundle 审计报告

## 范围

- `src/app/live/page.tsx`

## 总评

发现 1 条 P1 性能债：直播页顶层静态引入 `hls.js` 与 HLS 错误处理工具，导致直播页首屏提前加载播放器运行时。修复后 HLS 运行时和 HLS 配置只在 ArtPlayer 初始化时动态加载。

## 发现清单

| # | 性质 | 严重度 | 置信度 | 标题 | 文件 |
|---|---|---|---|---|---|
| 1 | performance | P1 | high | `/live` 顶层加载 HLS 运行时，首屏包体过重 | [finding-01.md](finding-01.md) |

## 验证计划

1. 移除 `/live` 顶层 HLS 运行时依赖 -> verify: `pnpm exec eslint src/app/live/page.tsx --quiet`。
2. 确认动态加载类型正确 -> verify: `pnpm typecheck`。
3. 确认包体结果 -> verify: `pnpm build` 与 `.next/app-build-manifest.json`。

## 处理结果

已完成修复，`/live/page` 的首屏 manifest 中不再包含 HLS 相关 chunk。
