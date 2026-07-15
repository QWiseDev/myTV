---
doc_type: issue-fix
issue: 2026-07-16-home-favorites-clear-consistency
path: fast-track
fix_date: 2026-07-16
tags: [home, favorites, cache, error-state]
---

# 收藏清空失败一致性修复记录

## 1. 问题描述

数据库模式在 DELETE 前先缓存并广播空收藏；DELETE 与补偿 GET 同时失败时，服务端数据仍在，但当前页面已变成最终空态。

## 2. 根因

`clearAllFavorites()` 把不可确认成功的远端删除实现成乐观最终状态，补偿刷新又是唯一恢复路径。

## 3. 修复方案

先等待 DELETE 成功，再提交空缓存和 `favoritesUpdated {}`；失败时保留原缓存，继续沿既有错误提示与补偿刷新路径处理。

## 4. 改动文件清单

- `src/lib/db.client.ts`
- `src/lib/db.client.favorites.test.ts`

## 5. 验证结果

- 回归覆盖 DELETE 500 且补偿 GET 503，确认旧收藏仍可读取且没有空事件。
- 最终全量 Jest：76 suites / 367 tests；`pnpm typecheck`、目标 ESLint、production build 通过。

## 6. 遗留事项

- 单条收藏保存/删除仍保留既有乐观更新语义；本 issue 只处理“清空全部”失败会伪造最终空态的问题。
