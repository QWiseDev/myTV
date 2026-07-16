---
doc_type: issue-fix
issue: 2026-07-16-home-scroll-overlays
path: fast-track
fix_date: 2026-07-16
tags: [home, accessibility, scroll, pointer-events]
---

# 首页横滑覆盖层交互修复记录

## 1. 问题描述

横滑箭头在非 hover 状态仍可被键盘聚焦，但完全透明且没有 accessible name；窄屏挂载后切到桌面断点不会初始化箭头。继续观看角标覆盖播放链接并拦截触摸点击。

## 2. 根因

滚动控件只把可见性绑定到 mouse hover，effect 又在窄屏直接退出；非交互角标缺少 pointer hit-testing 约束，并且是播放链接的高层 sibling。

## 3. 修复方案

- 滚动按钮补“向左/向右滚动”名称，wrapper 增加 `focus-within:opacity-100`。
- 始终订阅 media query change；匹配桌面断点时观察/测量，离开时清理状态和 observer。
- `CornerBadge` 增加 `pointer-events-none`。

## 4. 改动文件清单

- `src/components/ScrollableRow.tsx`
- `src/components/ScrollableRow.test.tsx`
- `src/components/ContinueWatching.tsx`
- `src/components/ContinueWatching.test.tsx`
- `.codestable/audits/2026-07-16-home-fifth-pass/finding-04.md`

## 5. 验证结果

- 组件定向 Jest：2 suites / 10 tests；首批合并回归：7 suites / 53 tests；最终全量：82 suites / 420 tests。
- 4 个变更文件 ESLint `--max-warnings=0`、Prettier 与 `pnpm typecheck` 通过。
- 浏览器 accessibility snapshot 可见“向右滚动”；键盘激活后 wrapper opacity 从 0 过渡到 1；`+3集` 角标 computed `pointer-events=none`。
- 首页/收藏夹切换正常，console 无 error；production build 通过。

## 6. 遗留事项

- 当前使用现代 `MediaQueryList.addEventListener`，没有为已不在目标范围的老浏览器增加 `addListener` 兼容分支。
