---
doc_type: audit-finding
audit: 2026-07-15-playback-deep-review
finding_id: performance-06
nature: performance
severity: P2
confidence: high
suggested_action: cs-refactor
status: resolved
---

# Finding 06：返回顶部同时常驻 RAF 与 scroll timer

## 速答

播放页返回顶部控制器进入页面后持续运行 requestAnimationFrame，同时又注册一套 100ms scroll timer，两条路径重复读滚动位置和更新状态。

## 关键证据（修复前）

- `src/app/play/hooks/useBackToTopController.ts:18-34` — RAF 回调每帧再次调度自身。
- `src/app/play/hooks/useBackToTopController.ts:36-47` — 同时注册 scroll listener 和 100ms timer。

## 影响

即使用户完全不滚动，播放期间仍常驻约 60 次/秒的 RAF；滚动时又叠加 timer，增加无意义主线程工作。

## 修复方向

保留单一 passive scroll listener，并用最多一个 RAF 合并更新；无滚动时不执行。

## 修复记录（2026-07-15）

返回顶部控制器已删除常驻 RAF 与 100ms scroll timer，只保留 passive scroll listener；连续 scroll 事件最多调度一个 RAF，执行后才允许下一帧更新。卸载时移除 listener 并取消尚未执行的 RAF，已补滚动合并、卸载清理和回顶行为测试。

## 建议动作

`cs-refactor`，因为这是行为等价的持续运行路径收敛。
