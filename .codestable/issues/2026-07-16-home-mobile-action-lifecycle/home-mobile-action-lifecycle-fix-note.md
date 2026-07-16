---
doc_type: issue-fix
issue: 2026-07-16-home-mobile-action-lifecycle
path: fast-track
fix_date: 2026-07-16
tags: [home, action-sheet, video-card, long-press, lifecycle]
---

# 首页移动操作生命周期修复记录

## 1. 问题描述

操作面板退场 200ms 内仍可重复执行旧 action，收藏/删除没有共享 pending 门禁；长按在 `touchcancel` 或组件卸载后仍可能延迟振动并打开菜单。

## 2. 根因

ActionSheet 的 action 触发后只调用 `onClose()`，没有“本次打开已消费”状态；收藏与删除 handler 在 await 前未登记 in-flight Promise。`useLongPress` 只有 touch start/move/end，timer 和手势 ref 没有统一 cleanup。

## 3. 修复方案

- ActionSheet 为 action 与 close 增加幂等 ref，closing 阶段禁用按钮和指针交互。
- 收藏、删除分别在共享业务 handler 内用 `Map` 保存各卡片 identity 的 pending Promise，使桌面和移动入口共同去重；A→B→A 的虚拟列表往返仍复用 A 的原任务，旧任务也不会回写错误卡片。
- 长按抽取 `resetGesture()`，用于移动越界、`touchcancel`、touch end 与卸载；嵌套交互控件不启动卡片手势。

## 4. 改动文件清单

- `src/components/MobileActionSheet.tsx`
- `src/components/MobileActionSheet.test.tsx`
- `src/components/VideoCard.tsx`
- `src/components/VideoCard.test.tsx`
- `src/hooks/useLongPress.ts`
- `src/hooks/useLongPress.test.tsx`
- `.codestable/audits/2026-07-16-home-fourth-pass/index.md`
- `.codestable/audits/2026-07-16-home-fourth-pass/finding-04.md`

## 5. 验证结果

- 旧实现新增回归稳定复现 action 双触发、pending mutation 重复写、`touchcancel`/卸载 timer 泄漏和嵌套按钮误触。
- ActionSheet、VideoCard、long-press 与 ContinueWatching 定向：4 suites / 45 tests 通过。
- `pnpm exec jest --runInBand`：81 suites / 399 tests 通过。
- `pnpm typecheck`、目标 ESLint 与 `git diff --check`：通过。
- SSH 隧道 Redis `PING=PONG`，production build 无连接错误并通过。
- 真实浏览器验证 closing 期间焦点仍圈定、退场后 dialog 卸载、body 滚动锁恢复、焦点回到触发卡片，console 0 warning / 0 error。
- 验证后本地 3100 与 16379 端口均已关闭。

## 6. 遗留事项

本次不把 `MobileAction.onClick` 扩成 Promise 契约；单次打开门禁负责 UI 退场边界，收藏/删除的真实异步去重仍由 VideoCard 业务 handler 所有。
