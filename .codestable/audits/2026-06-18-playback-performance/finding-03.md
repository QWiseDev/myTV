---
doc_type: audit-finding
audit: 2026-06-18-playback-performance
finding_id: performance-03
nature: performance
severity: P2
confidence: high
suggested_action: cs-refactor
status: resolved
---

# Finding 03：`SkipController` 随播放进度每秒重渲染和扫描片段

## 速答

播放页每秒把 `currentTime` 写入 React 状态并传给 `SkipController`，导致该组件随播放进度持续重渲染并执行片段判断，即使跳过设置面板不可见也会工作。

## 关键证据

- `src/app/play/page.tsx:293` — `video:timeupdate` 经过 `useThrottle(..., 1000)` 后仍每秒更新一次播放状态。
- `src/app/play/page.tsx:295` — 每秒调用 `setCurrentPlayTime(currentTime)`。
- `src/app/play/page.tsx:1130` — `currentPlayTime` 作为 `currentTime` prop 传给播放器容器。
- `src/components/play/PlayerContainer.tsx:139` — `currentTime` 继续传给 `SkipController`。
- `src/components/SkipController.tsx:898` — `currentTime` 变化触发 effect。
- `src/components/SkipController.tsx:901` — effect 调用 `checkSkipSegment(currentTime)`。
- `src/components/SkipController.tsx:467` — 每次判断用 `effectiveSegments.find(...)` 扫描当前片段。

## 影响

单次开销不大，但这是播放期间的持续 React 更新路径，会让 `PlayerContainer` 和 `SkipController` 至少每秒参与一次渲染/判断。它不足以单独解释严重发热，但会和 HLS、弹幕、播放器 UI 渲染叠加。

## 修复方向

把自动跳过判断移到播放器事件监听或内部 ref 路径，只在进入片段、配置变化、集数变化时更新 React 状态；不需要把每秒播放时间作为 prop 驱动整个 `SkipController`。

## 建议动作

`cs-refactor`，因为这是局部渲染路径优化，行为应保持不变。

## 处理结果

已移除 `PlayerContainer` / `SkipController` 的 `currentTime` prop 传递，播放页不再每秒写入 `currentTime` React 状态；`SkipController` 改为内部监听播放器 `video:timeupdate` 事件执行跳过判断。
