---
doc_type: audit-finding
audit: 2026-07-16-home-fifth-pass
finding_id: 'performance-07'
nature: performance
severity: P2
confidence: medium
suggested_action: cs-issue
status: open
---

# Finding 07：不可见卡片 shimmer 仍持续运行

## 速答

每张 `VideoCard` 的光泽层默认完全透明，但 `card-shimmer` 无限动画始终运行；首页几十张卡即使从未 hover，也会持续维护动画时间线，且不尊重 reduced motion。

## 关键证据

- `src/components/VideoCard.tsx:733-741` — 元素用 `opacity-0 group-hover:opacity-100` 隐藏，但 inline style 无条件设置 `animation: card-shimmer 2.5s ... infinite`。
- 同一节点没有 `animation-play-state`、`motion-reduce` 或 `prefers-reduced-motion` 门禁。

## 影响

首页每张卡都创建永久动画，增加低端设备和后台页面的合成/绘制负担；开启“减少动态效果”的用户仍会看到 hover 动画。

## 修复方向

默认暂停 shimmer，仅在 hover/focus 且允许 motion 时运行；补样式断言或浏览器 computed-style 回归。

## 建议动作

`cs-issue`，因为当前性能浪费同时违反用户的 reduced-motion 偏好。
