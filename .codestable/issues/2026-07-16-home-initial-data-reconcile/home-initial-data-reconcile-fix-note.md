---
doc_type: issue-fix
issue: 2026-07-16-home-initial-data-reconcile
path: fast-track
fix_date: 2026-07-16
tags: [home, initial-data, rsc, state-reconcile]
---

# 首页 partial initialData 合并修复记录

## 1. 问题描述

现有 Client Component 收到新的 partial `initialData` 时，只用 incoming snapshot 判断缺失区块，却不把其中的新数据写入 state。结果是新电影仍显示旧值，客户端已经加载成功的 TV、综艺和 Bangumi 又被重复补载。

## 2. 根因

`initialData` 只在 `useState` initializer 中完整消费一次。后续 effect 只有在 incoming snapshot 四个区块都非空时才调用 `applyHomeData()`；partial snapshot 的 state 与 availability 因而来自两条不同真相。

## 3. 修复方案

- 新 incoming snapshot 的非空区块覆盖当前区块，空区块保留当前成功数据。
- 用 latest-state ref 生成唯一 reconciled snapshot。
- 新 prop 到达时先提交该 snapshot，再从同一 snapshot 计算 fallback availability。
- 保留原有 generation、AbortController、StrictMode 取消点与分区重试契约。

## 4. 改动文件清单

- `src/hooks/useHomeData.ts`
- `src/hooks/useHomeData.test.ts`
- `.codestable/audits/2026-07-16-home-fourth-pass/finding-05.md`

## 5. 验证结果

- 回归覆盖客户端补载成功后收到 critical-only snapshot：新电影覆盖，TV / 综艺 / Bangumi 保留且不重复请求。
- 回归覆盖失败区块随后由 partial snapshot 提供：采用新数据并清除该区块 loading / error。
- `pnpm exec jest src/hooks/useHomeData.test.ts --runInBand`：1 suite / 15 tests 通过。
- 最终全量 Jest：81 suites / 411 tests 通过；变更文件 ESLint `--max-warnings=0` 与 `pnpm typecheck` 通过。
- SSH 隧道 Redis `PING=PONG`，覆写本次构建进程的 `REDIS_URL` 后 `pnpm build` 通过；未修改 `.env` 或远端 Redis 配置。
- 浏览器首页成功读取远端 Redis 并渲染 12 张继续观看卡片，console 无 error；仅保留既有 Next Image LCP warning。
- 仓库全量 `pnpm lint:strict` 仍被 145 条既有 warning 阻断，均不在本阶段变更文件内。

## 6. 遗留事项

- 当前空数组继续表示“区块缺失”，不能表达“权威清空”；本次未扩展 `HomeData` 契约。
- 同一 `initialData` 对象被原地 mutation 仍不会触发 effect，继续遵循 immutable props 前提。
