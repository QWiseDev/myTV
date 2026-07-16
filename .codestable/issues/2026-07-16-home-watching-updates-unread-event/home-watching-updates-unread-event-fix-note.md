---
doc_type: issue-fix
issue: 2026-07-16-home-watching-updates-unread-event
path: fast-track
fix_date: 2026-07-16
tags: [home, user-menu, watching-updates, unread, event]
---

# 用户菜单追更事件未读状态修复记录

## 1. 问题描述

用户打开过更新提醒后，超过一分钟再收到新追更事件，列表数据会更新但菜单未读红点不会重新出现。

## 2. 根因

初次缓存读取通过 updateWatchingUpdates 同时计算 snapshot 和 unread，事件订阅却只 setWatchingUpdates，绕过了同一未读计算。

## 3. 修复方案

正常 watching-updates 事件统一调用 updateWatchingUpdates，并同时要求事件 payload 有新集、snapshot.timestamp 晚于 lastViewed 且已超过一分钟抑制窗口；旧 snapshot 重播与 false/0 payload 保持已读。invalidated 事件继续提前返回，不改变既有重算调度边界。

## 4. 改动文件清单

- src/components/user-menu/useUserMenuWatchingUpdates.ts
- src/components/user-menu/UserMenuDataHooks.test.ts
- .codestable/audits/2026-07-16-home-sixth-pass/finding-05.md
- .codestable/audits/2026-07-16-home-sixth-pass/index.md

## 5. 验证结果

- 新增“已读后旧 snapshot 重播、false/0 payload、新 snapshot + true payload”组合回归，旧实现失败；修复后只有新 snapshot + true payload 重新未读。
- UserMenuDataHooks 16/16、合并定向 3 suites / 59 tests、全量 87 suites / 506 tests 通过。
- typecheck、目标 ESLint、production build 与 git diff 检查通过。
- 真实用户菜单显示 2 条追更提醒并可正常打开，console 0 error / 0 warning；未修改真实 viewed 时间。

## 6. 遗留事项

保留既有“一分钟内不重复提醒”语义；用户菜单弹层的 dialog、焦点与 Escape 生命周期仍是第六轮 finding-04。
