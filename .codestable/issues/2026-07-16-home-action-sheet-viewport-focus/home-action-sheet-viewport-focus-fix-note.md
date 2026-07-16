---
doc_type: issue-fix
issue: 2026-07-16-home-action-sheet-viewport-focus
path: fast-track
fix_date: 2026-07-16
tags: [home, action-sheet, viewport, focus, accessibility]
---

# 首页移动操作面板矮屏与焦点修复记录

## 1. 问题描述

移动操作面板没有视口高度上限和整体滚动区，外层又禁止所有触摸滚动；矮屏下操作可能不可达。键盘打开后焦点仍留在背景，Tab 可离开面板，关闭后也不恢复触发点。

## 2. 根因

面板只约束宽度与底部间距，操作列表和来源区分别自然增高；全屏祖先使用 `touchAction: 'none'` 与 `touchmove preventDefault()`。组件仅监听 Escape，没有 dialog 语义、初始焦点、焦点圈定和恢复所有权。

## 3. 修复方案

- 用 `100dvh` 与四向 safe-area 约束面板，头部固定，操作和来源共用一个纵向滚动主体。
- 仅遮罩阻止背景触摸/滚轮，移除滚动祖先的全局 touch 禁用。
- 增加 dialog、标题/描述关联、具名关闭按钮；打开后聚焦首个可用 action，关闭动画期间把焦点留在 dialog 并持续圈定，退场完成或提前卸载时恢复原触发点。
- 跟踪 body 滚动恢复 RAF；StrictMode 下一轮 setup 会取消上一轮模拟 cleanup 遗留的恢复任务。

## 4. 改动文件清单

- `src/components/MobileActionSheet.tsx`
- `src/components/MobileActionSheet.test.tsx`
- `.codestable/audits/2026-07-16-home-fourth-pass/index.md`
- `.codestable/audits/2026-07-16-home-fourth-pass/finding-02.md`

## 5. 验证结果

- 旧实现运行新增回归时，dialog、焦点圈定与恢复、视口滚动结构均稳定失败。
- `pnpm exec jest src/components/MobileActionSheet.test.tsx --runInBand`：1 suite / 5 tests 通过。
- 合并交互回归：4 suites / 45 tests 通过。
- `pnpm exec jest --runInBand`：81 suites / 399 tests 通过。
- `pnpm typecheck`、目标 ESLint 与 `git diff --check`：通过。
- SSH 隧道 Redis `PING=PONG`；覆写本次构建进程的 `REDIS_URL` 后 `pnpm build` 无连接错误并通过，未修改 `.env` 或远端 Redis 配置。
- 667×320 浏览器验证：视口高度 320，面板 top=16、bottom=304、height=288；唯一滚动区 `overflow-y:auto`，`scrollHeight=243 > clientHeight=191`，底部操作可聚焦。
- Tab 从最后 action 回到关闭按钮；Escape 后 200ms 关闭期 Tab 仍停留在 dialog，退场后焦点恢复原卡片；body 滚动锁恢复，console 0 warning / 0 error。
- 验证后本地 3100 与 16379 端口均已关闭，浏览器视口已恢复默认。

## 6. 遗留事项

无。本次未引入第三方 focus-trap 依赖；若未来面板加入输入框或复杂复合控件，应同步扩展 focusable selector 回归。
