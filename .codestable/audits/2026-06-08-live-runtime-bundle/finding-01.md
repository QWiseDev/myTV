---
doc_type: audit-finding
audit: 2026-06-08-live-runtime-bundle
finding_id: performance-01
nature: performance
severity: P1
confidence: high
suggested_action: cs-refactor
status: resolved
---

# Finding 01：`/live` 顶层加载 HLS 运行时

## 速答

直播页在模块顶层加载 `hls.js`，还静态引入 HLS 配置工具，导致首屏 chunk 过早包含播放器运行时。

## 关键证据

- `src/app/live/page.tsx` 原先顶层 `import Hls from 'hls.js'`。
- `src/app/live/page.tsx` 原先静态 import `isRecoverableFragmentParsingError` 与 `isRecoverableTimestampAppendError`。
- `src/app/live/page.tsx` 中 HLS 只在 `m3u8Loader` 和播放器初始化时使用。

## 影响

进入直播页时会提前下载 HLS 运行时，增加首屏 JS。

## 修复方向

把 HLS 构造器、HLS 配置工具与自定义 loader 的 HLS 依赖延后到 ArtPlayer 初始化流程。

## 建议动作

`cs-refactor`，因为这是行为等价的依赖加载时机优化。

## 处理结果

已将 HLS 运行时移入直播播放器初始化路径。
