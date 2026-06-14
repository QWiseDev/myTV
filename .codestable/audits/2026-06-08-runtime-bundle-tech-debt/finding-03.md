---
doc_type: audit-finding
audit: 2026-06-08-runtime-bundle-tech-debt
finding_id: maintainability-03
nature: maintainability
severity: P2
confidence: medium
suggested_action: cs-refactor
status: resolved
---

# Finding 03：HLS 流信息工具为事件常量静态依赖 `hls.js`

## 速答

`hlsStreamInfo.ts` 的顶层 `hls.js` 依赖主要用于事件常量，这让只想复用流信息类型或格式化函数的调用方也可能引入播放器运行时。

## 关键证据

- `src/app/play/utils/hlsStreamInfo.ts:1` — `import Hls from 'hls.js';` —— 工具模块顶层加载 HLS。
- `src/app/play/utils/hlsStreamInfo.ts:230` — 使用 `Hls.Events.MANIFEST_PARSED` 等事件名 —— 事件名本质是稳定字符串，构造器不是必需依赖。
- `src/components/SourceTestModule.tsx:21` — 同时 import `formatBandwidth`、`getHLSStreamInfo`、`HLSStreamInfo` —— 源检测组件首屏因此可能间接引入 `hls.js`。

## 影响

扩大工具函数的运行时依赖面，降低按需加载边界清晰度。触发包体影响取决于打包器树摇结果，所以置信度标为 medium。

## 修复方向

将事件名改成本地字符串常量，HLS 实例按鸭子类型使用 `on/off/levels/currentLevel`，保留外部行为。

## 建议动作

`cs-refactor`，因为这是小范围行为等价依赖收敛。

## 处理结果

已在 `src/app/play/utils/hlsStreamInfo.ts` 移除顶层 `hls.js` import，并用经 `node` 读取 `hls.js` 真实 `Events` 输出确认过的事件字符串替代。
