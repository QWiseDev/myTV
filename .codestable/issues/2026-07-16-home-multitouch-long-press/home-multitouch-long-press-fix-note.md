---
doc_type: issue-fix
issue: 2026-07-16-home-multitouch-long-press
path: fast-track
fix_date: 2026-07-16
tags: [home, video-card, touch, long-press, navigation]
---

# 首页多指长按误播放修复记录

## 1. 问题描述

卡片长按手势期间加入第二指或结束非首个触点，可能提前结束手势并触发播放导航。

## 2. 根因

useLongPress 只读取 touches[0]，没有记录活动 touch identifier；任一 touchend 都直接进入 handleEnd，而短按分支会调用 onClick。

## 3. 修复方案

- 只接受单指开始并记录活动 touch identifier。
- 手势活动期间临时在 document capture 阶段监听 touchstart，第二指落在卡片外也立即取消；move 时找不到活动触点或出现多指同样取消。
- 多指取消后压制 touchend 默认行为，避免浏览器合成原生 click；若外部末指结束不经过 Hook，下一次确认的单指 touchstart 会清理旧抑制，再开始正常手势。

## 4. 改动文件清单

- src/hooks/useLongPress.ts
- src/hooks/useLongPress.test.tsx
- .codestable/audits/2026-07-16-home-sixth-pass/finding-03.md
- .codestable/audits/2026-07-16-home-sixth-pass/index.md

## 5. 验证结果

- 初始 4 个多指回归在旧实现 4/4 失败；最终 5 个回归覆盖第二触点位于 Harness 外、两种抬指顺序和下一次单指可用性，修复后 useLongPress 8/8 通过。
- 合并定向 3 suites / 59 tests、全量 87 suites / 506 tests 通过。
- typecheck、目标 ESLint、目标 Prettier、production build 与 git diff 检查通过。
- 真实浏览器首页卡片与用户菜单冒烟正常，console 0 error / 0 warning；桌面浏览器不具备真实多点触控输入，核心触点序列由 Hook 回归覆盖。

## 6. 遗留事项

无。临时 document listener 只在单个活动手势期间存在，并在正常结束、取消、移动越界和卸载时清理；本次没有修改 VideoCard 导航 contract 或移动 ActionSheet 生命周期。
