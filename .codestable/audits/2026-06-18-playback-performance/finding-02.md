---
doc_type: audit-finding
audit: 2026-06-18-playback-performance
finding_id: performance-02
nature: performance
severity: P1
confidence: medium
suggested_action: cs-refactor
status: resolved
---

# Finding 02：弹幕默认开启并在 ready 后自动加载渲染

## 速答

播放页默认开启外部弹幕，并在播放器 ready 后 1 秒自动请求和渲染弹幕；弹幕插件开启防重叠和同步播放，会在播放期间持续参与渲染与时间轴同步。

## 关键证据

- `src/app/play/page.tsx:176` — `danmaku.enabled` 初始值为 `true`。
- `src/app/play/page.tsx:324` — 只有本地存过 `enable_external_danmu` 时才覆盖默认值，否则保持开启。
- `src/app/play/hooks/usePlayerInitializer.ts:685` — 播放器 `ready` 后通过 `setTimeout(..., 1000)` 自动执行弹幕加载。
- `src/app/play/hooks/usePlayerInitializer.ts:700` — 自动调用 `loadAndRenderDanmaku`，把外部弹幕加载进插件。
- `src/app/play/utils/danmakuConfig.ts:108` — `antiOverlap: true`。
- `src/app/play/utils/danmakuConfig.ts:110` — `synchronousPlayback: true`，弹幕与视频速度同步，播放期间持续工作。

## 影响

弹幕是播放过程中的持续渲染负载，和视频解码、HLS worker、播放器 UI 叠加。若用户只是想看视频，默认自动启用弹幕会提高 CPU/GPU 占用；弹幕量大时影响更明显。置信度为 medium，因为具体热量取决于弹幕数量、浏览器渲染和机器性能。

## 修复方向

将外部弹幕改为按需加载，或默认关闭并在用户显式开启后再请求和渲染；如果必须默认开启，也应按设备/能耗模式限制弹幕数量、关闭防重叠或降低同步开销。

## 建议动作

`cs-refactor`，因为这是默认策略和加载时机优化，范围集中在播放页弹幕控制。

## 处理结果

已将播放页外部弹幕默认值改为读取 `enable_external_danmu`，未设置时不自动加载；同时在播放器设置项中增加“弹幕”开关，用户可以随时打开，已开启偏好会继续保留。
