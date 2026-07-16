---
doc_type: issue-fix
issue: 2026-07-16-home-favorites-retry
path: fast-track
fix_date: 2026-07-16
tags: [home, favorites, retry, error-state]
---

# 首页收藏原地重试修复记录

## 1. 问题描述

收藏首次加载或刷新失败后只显示错误文案，用户必须切回首页再进入收藏夹才能触发下一次 GET。

## 2. 根因

收藏加载 effect 只依赖 `activeTab`，hook 没有对外提供 reload 命令；错误组件因此无法执行文案承诺的“重试”。

## 3. 修复方案

- hook 增加 retry generation，重启同一 effect 而不复制加载逻辑。
- ref 门禁消费快速重复点击；重试立即进入 loading。
- stale content 保留，空错误态和刷新错误态均显示重试按钮。

## 4. 改动文件清单

- `src/hooks/useFavoriteItems.ts`
- `src/hooks/useFavoriteItems.test.ts`
- `src/components/FavoritesSection.tsx`
- `src/components/FavoritesSection.test.tsx`
- `src/components/HomeClient.tsx`
- `.codestable/audits/2026-07-16-home-fifth-pass/finding-05.md`

## 5. 验证结果

- Hook/组件定向 Jest：2 suites / 20 tests；首批合并回归：7 suites / 53 tests；最终全量：82 suites / 420 tests。
- 目标 ESLint、Prettier、`pnpm typecheck` 与 `git diff --check` 通过。
- 浏览器收藏 tab 正常加载真实远端数据并可返回首页，console 无 error；production build 通过。

## 6. 遗留事项

- 本次没有新增自动定时重试或指数退避；重试仍由用户明确触发，避免弱网下后台请求放大。
