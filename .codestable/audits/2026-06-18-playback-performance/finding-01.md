---
doc_type: audit-finding
audit: 2026-06-18-playback-performance
finding_id: performance-01
nature: performance
severity: P1
confidence: high
suggested_action: cs-refactor
status: resolved
---

# Finding 01：桌面 HLS 缓冲与重试配置偏激进

## 速答

桌面端 HLS 配置明显偏向抗卡顿：更长缓冲、预取、带宽测试和多次重试会增加网络、内存与解封装压力，在高码率源或硬解不稳定时容易放大电脑发热。

## 关键证据

- `src/app/play/utils/hlsConfig.ts:233` — 桌面端 `enableWorker: !isMobile`，HLS 解封装转到 worker；这能避免阻塞主线程，但仍会持续占用 CPU。
- `src/app/play/utils/hlsConfig.ts:247` — 桌面 `maxBufferLength: 25`，播放时会主动维持较长前向缓冲。
- `src/app/play/utils/hlsConfig.ts:254` — 桌面 `backBufferLength: 15`，保留更多后向缓冲，增加内存压力。
- `src/app/play/utils/hlsConfig.ts:285` — 桌面 `maxMaxBufferLength: 180`，允许极长缓冲上限。
- `src/app/play/utils/hlsConfig.ts:294` — 桌面 `startFragPrefetch: !isMobile`，会预取片段。
- `src/app/play/utils/hlsConfig.ts:300` — 桌面片段加载超时可到 `120000ms`，并且 `timeoutRetry.maxNumRetry: 4`、`errorRetry.maxNumRetry: 6`，弱源会持续消耗。

## 影响

触发条件是桌面端播放 HLS 源，尤其是高码率、弱网络、多清晰度自适应或浏览器无法稳定硬解的片源。用户表现可能是播放流畅但 CPU/GPU/能耗持续偏高，电脑发热明显。

## 修复方向

为桌面端提供省资源配置或下调默认值：减少 `maxBufferLength`、`backBufferLength`、`maxMaxBufferLength`、`startFragPrefetch` 和重试次数；必要时增加“低发热模式”而不是继续扩大缓冲。

## 建议动作

`cs-refactor`，因为这是行为保持为播放但调整资源策略的局部性能优化。

## 处理结果

已下调桌面端 HLS 持续缓冲和重试压力：`maxBufferLength` 25 -> 20、`backBufferLength` 15 -> 10、`maxMaxBufferLength` 180 -> 90、关闭 `startFragPrefetch`，并降低桌面片段加载重试。保留 `enableWorker` 与 `testBandwidth`，避免牺牲默认播放流畅度。
