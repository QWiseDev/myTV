---
doc_type: audit-finding
audit: 2026-07-16-home-third-pass
finding_id: "performance-08"
nature: performance
severity: P2
confidence: high
suggested_action: cs-refactor
status: open
---

# Finding 08：动画 wrapper 的 index key 让排序重挂卡片

## 速答

首页卡片本身已有稳定业务 key，但 `AnimatedCardGrid` 丢弃它并按 index 给外层 wrapper 标 key；追更优先级或时间排序变化时，原卡片会在新位置卸载重挂。

## 关键证据

- `src/components/ContinueWatching.tsx:228-234` — 继续观看卡片以 `record.key` 标识。
- `src/components/LazyVideoSection.tsx:51-54` — 热门卡片以 item id 标识。
- `src/components/AnimatedCardGrid.tsx:50-70` — wrapper 固定使用 `key={index}`，未复用 child key。

## 影响

重新排序会重启图片加载、收藏状态查询和组件 effects；已打开的 ActionSheet 也可能消失，抵消此前为稳定横滑树做的优化。

## 修复方向

有效 React child 优先使用 `child.key`，仅无 key 时回退 index；用 mount/unmount 计数覆盖重排回归。

## 建议动作

`cs-refactor`，因为这是行为等价的 reconciliation identity 修正。
