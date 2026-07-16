---
doc_type: issue-fix
issue: 2026-07-16-home-watching-updates-schedule
path: fast-track
fix_date: 2026-07-16
tags: [home, watching-updates, scheduling, performance]
---

# 首页追更首次调度解耦修复记录

## 1. 问题描述

登录态 SSR 通常只提供热门电影，但首页原先要等 TV、综艺等 fallback 请求全部 settle 后才创建追更 idle task。secondary 最长可等待 6 秒，追更自身再等待至少 4 秒，导致 freshness 被无关分区串行推迟。

## 2. 根因

`useHomeData` 在 StrictMode 微任务门禁后先 `await loadFallbackBatches()`，只有 fallback 全部完成才调用 `scheduleWatchingUpdatesCheck()`；两者没有数据依赖，却被放在同一串行链路。

## 3. 修复方案

- 保留 StrictMode 微任务门禁，避免首轮无效 effect 创建重复任务。
- 门禁通过后立即保存追更调度取消句柄，再继续等待 fallback 批次。
- 保留 4 秒 idle 延迟、TV/综艺批量加载、tertiary 调度和 effect cleanup 取消逻辑。

## 4. 改动文件清单

- `src/hooks/useHomeData.ts`
- `src/hooks/useHomeData.test.ts`
- `.codestable/audits/2026-07-16-home-fifth-pass/finding-08.md`
- `.codestable/audits/2026-07-16-home-fifth-pass/index.md`

## 5. 验证结果

- 新增 deferred secondary 回归后，旧实现按预期失败：fallback 未完成时追更调度调用数为 0。
- `pnpm exec jest src/hooks/useHomeData.test.ts --runInBand`：1 suite / 16 tests 通过。
- `pnpm exec jest --runInBand`：82 suites / 422 tests 通过。
- 目标 ESLint 与 `pnpm typecheck` 通过。
- `pnpm build` 通过；构建期 `.env` 直连 `136.175.83.3:6379` 仍打印 `ECONNREFUSED`，最终退出码为 0。

## 6. 遗留事项

- 追更检查会更早与慢 secondary 请求重叠；空 snapshot 异常路径下也可能与 critical 请求尾段重叠，但原有至少 4 秒 idle 延迟仍在。本次不调整轮询间隔、缓存接口或数据 contract。
