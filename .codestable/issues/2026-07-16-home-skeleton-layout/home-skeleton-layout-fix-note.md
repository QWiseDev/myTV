---
doc_type: issue-fix
issue: 2026-07-16-home-skeleton-layout
path: fast-track
fix_date: 2026-07-16
tags: [home, skeleton, layout, animation]
---

# 首页加载骨架横向布局修复记录

## 1. 问题描述

`SkeletonRow` 作为单个 React child 进入动画网格后，被一个 block wrapper 包住，内部多张骨架卡在该 wrapper 中纵向堆叠。

## 2. 根因

动画容器在 `SkeletonRow` 展开 fragment 之前按 child 包装；加载态不适合使用逐卡入场动画。

## 3. 修复方案

`ContinueWatching` 和 `LazyVideoSection` 在 loading 时关闭 `ScrollableRow` 动画，非 loading 时保持原配置。

## 4. 改动文件清单

- `src/components/ContinueWatching.tsx` 及测试
- `src/components/LazyVideoSection.tsx` 及测试
- `src/components/ScrollableRow.test.tsx`

## 5. 验证结果

- 组件回归覆盖 loading 关闭动画与非 loading 配置保持。
- 真实 `ScrollableRow → SkeletonRow` 组合测试确认三张骨架直接成为横向滚动容器的三个子节点。
- 最终全量 Jest：76 suites / 367 tests；类型检查、目标 ESLint、production build 通过。

## 6. 遗留事项

- 本次不改变正常卡片的入场动画，也不调整横滑间距和卡片宽度。
