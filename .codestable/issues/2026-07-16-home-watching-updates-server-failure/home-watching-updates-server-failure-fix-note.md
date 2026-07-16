---
doc_type: issue-fix
issue: 2026-07-16-home-watching-updates-server-failure
path: fast-track
fix_date: 2026-07-16
tags: [home, watching-updates, redis, retry]
---

# 首页追更 server-mode 失败语义修复记录

## 1. 问题描述

Redis/数据库模式的追更请求遇到 500、无效 payload 或网络异常时，会返回旧缓存/null 并正常结束；首页 hook 因此把失败请求记成成功，后续普通检查被节流 30 分钟。

## 2. 根因

`fetchWatchingUpdatesFromServer()` 同时承担“拉新数据”和“失败 fallback”，但调用方只用 Promise 是否 reject 判断成功。fallback 抹掉了失败信号，使 hook 的失败重试测试与真实实现不一致。

## 3. 修复方案

- 非 2xx、无效 payload 和网络异常继续抛出。
- 有效响应保留现有缓存、时间戳与事件发布语义。
- 用真实 `window.RUNTIME_CONFIG.STORAGE_TYPE='redis'` 模块初始化覆盖 server-mode 分支。

## 4. 改动文件清单

- `src/lib/watching-updates.ts`
- `src/lib/watching-updates.server-mode.test.ts`
- `.codestable/audits/2026-07-16-home-fifth-pass/finding-01.md`

## 5. 验证结果

- server-mode 成功、HTTP 503、无效 payload、网络失败回归通过。
- 首批合并回归：7 suites / 53 tests；最终全量 Jest：82 suites / 420 tests。
- 新测试 ESLint `--max-warnings=0`、源文件 ESLint `--quiet`、`pnpm typecheck` 通过。
- SSH 隧道 Redis `PING=PONG`，production build 通过；真实首页 `/api/watching-updates` 返回 200。

## 6. 遗留事项

- `watching-updates.ts` 仍有 3 条既有 `no-explicit-any` 和整文件 Prettier 漂移，本次未把无关格式/类型清理混入 bug 修复。
- 失败后仍等待下一次 visibility、invalidated 或调度触发重试；本次只修复错误成功时间，不新增主动退避策略。
