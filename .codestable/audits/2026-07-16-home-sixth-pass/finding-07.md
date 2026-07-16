---
doc_type: audit-finding
audit: 2026-07-16-home-sixth-pass
finding_id: 'performance-07'
nature: performance
severity: P2
confidence: high
suggested_action: cs-issue
status: open
---

# Finding 07：reduced-motion 未覆盖续播脉冲与平滑滚动

## 速答

卡片 shimmer 已遵循 reduced-motion，但继续观看角标/光环仍永久 animate-pulse，横滑箭头也始终使用 smooth scrolling。

## 关键证据

- src/components/ContinueWatching.tsx:63-67、80-82、123-126 — 摘要点、角标和卡片光环持续使用 animate-pulse，没有 motion-safe 门禁。
- src/components/ScrollableRow.tsx:165-169 — 所有箭头滚动固定 behavior='smooth'，没有查询 prefers-reduced-motion。
- .codestable/audits/2026-07-16-home-fifth-pass/finding-07.md:34-35 — 上轮只关闭了 VideoCard shimmer，未覆盖同页面其他持续动画。

## 影响

开启“减少动态效果”的用户仍会看到多张卡无限脉冲和强制平滑位移；大量续播卡片同时存在时也保留持续合成成本。

## 修复方向

把脉冲类改为 motion-safe 动画；滚动行为根据 prefers-reduced-motion 选择 auto 或 smooth，并补样式与 matchMedia 回归。

## 建议动作

cs-issue，因为当前页面没有完整遵守用户的系统级动态效果偏好。
