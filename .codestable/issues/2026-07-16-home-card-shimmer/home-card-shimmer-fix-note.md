---
doc_type: issue-fix
issue: 2026-07-16-home-card-shimmer
path: fast-track
fix_date: 2026-07-16
tags: [home, video-card, animation, reduced-motion]
---

# 首页卡片 shimmer 运行门禁修复记录

## 1. 问题描述

每张 `VideoCard` 的 shimmer 层默认透明，但 inline 无限动画始终运行；卡片未 hover 时仍维护动画时间线，也不尊重 reduced-motion。

## 2. 根因

视觉隐藏只使用 `opacity-0`，而 `animation: card-shimmer ... infinite` 无条件写在 inline style 中。透明度不会暂停 CSS animation，普通 class 也难以覆盖 inline shorthand。

## 3. 修复方案

- 删除无条件 inline animation，把动画定义放进 `motion-safe` class。
- 允许动态效果时默认暂停，仅在卡片 hover 或 focus-within 时切换为 running。
- reduced-motion 下不创建 shimmer 动画，并关闭透明度过渡。

## 4. 改动文件清单

- `src/components/VideoCard.tsx`
- `src/components/VideoCard.test.tsx`
- `.codestable/audits/2026-07-16-home-fifth-pass/finding-07.md`
- `.codestable/audits/2026-07-16-home-fifth-pass/index.md`

## 5. 验证结果

- `pnpm exec jest src/components/VideoCard.test.tsx --runInBand`：1 suite / 32 tests 通过。
- `pnpm exec jest --runInBand`：82 suites / 421 tests 通过。
- 目标 ESLint、`pnpm typecheck`、文档 Prettier 与 `git diff --check` 通过。
- `pnpm build` 通过；构建期 `.env` 仍尝试直连 `136.175.83.3:6379` 并打印 `ECONNREFUSED`，但最终退出码为 0，与本次样式改动无关。
- 真实浏览器 computed style：静止时 `animation-play-state: paused`、`opacity: 0`；键盘聚焦播放链接后切换为 `running`，透明度过渡后为 `1`。
- production build 与运行中的 dev server 共用 `.next` 后，刷新产生一次缺失 chunk 的开发环境错误；堆栈指向混用构建产物，不作为 shimmer 回归失败。

## 6. 遗留事项

- 保留 `card-shimmer` keyframes 和现有视觉效果；本次不删除装饰层，不改变其它卡片动画。
