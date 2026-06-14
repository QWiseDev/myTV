---
doc_type: audit-finding
audit: 2026-06-08-play-runtime-bundle
finding_id: performance-01
nature: performance
severity: P1
confidence: high
suggested_action: cs-refactor
status: resolved
---

# Finding 01：`/play` 顶层加载 HLS 运行时

## 速答

播放页在模块顶层加载 `hls.js`，导致首屏 chunk 提前包含播放器运行时。

## 关键证据

- `src/app/play/page.tsx` 原先顶层 `import Hls from 'hls.js'`。
- `src/app/play/hooks/usePlayerInitializer.ts` 原先静态 import `handleHlsError` 与 `initAdaptiveHls`，该工具模块顶层依赖 `hls.js`。

## 影响

用户进入播放页时会提前下载 HLS 运行时，即使播放器初始化还未真正执行。

## 修复方向

把 `hls.js` 与 HLS 配置工具动态加载到播放器初始化流程内。

## 建议动作

`cs-refactor`，因为这是行为等价的依赖加载时机优化。

## 处理结果

已将 HLS 运行时移入 `usePlayerInitializer` 的动态初始化路径。
