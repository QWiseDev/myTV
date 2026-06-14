---
doc_type: audit-index
audit: 2026-06-08-play-runtime-bundle
scope: 播放页首屏运行时包体
created: 2026-06-08
status: resolved
total_findings: 1
---

# play-runtime-bundle 审计报告

## 范围

- `src/app/play/page.tsx`
- `src/app/play/hooks/usePlayerInitializer.ts`

## 总评

发现 1 条 P1 性能债：播放页顶层静态引入 `hls.js` 和 HLS 配置工具，导致进入播放页首屏时提前加载播放器运行时。修复后 HLS 运行时只在播放器初始化阶段动态加载。

## 发现清单

| # | 性质 | 严重度 | 置信度 | 标题 | 文件 |
|---|---|---|---|---|---|
| 1 | performance | P1 | high | `/play` 顶层加载 HLS 运行时，首屏包体过重 | [finding-01.md](finding-01.md) |

## 验证计划

1. 移除 `/play` 顶层 HLS 运行时依赖 -> verify: `pnpm exec eslint src/app/play/page.tsx src/app/play/hooks/usePlayerInitializer.ts --quiet`。
2. 确认播放器类型和 hook 依赖仍正确 -> verify: `pnpm typecheck`。
3. 确认已有 HLS/ArtPlayer 测试仍通过 -> verify: `pnpm exec jest src/app/play/utils/hlsConfig.test.ts src/app/play/utils/artplayerLoader.test.ts --runInBand`。
4. 确认包体结果 -> verify: `pnpm build` 与 `.next/app-build-manifest.json`。

## 处理结果

已完成修复，`/play/page` 的首屏 manifest 中不再包含 HLS 相关 chunk。
