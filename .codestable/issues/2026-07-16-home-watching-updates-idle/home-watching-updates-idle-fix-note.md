---
doc_type: issue-fix
issue: 2026-07-16-home-watching-updates-idle
path: fast-track
fix_date: 2026-07-16
tags: [home, watching-updates, idle-task, lifecycle, strict-mode]
---

# 首页追更 idle 任务生命周期修复记录

## 1. 问题描述

首页完成数据加载后会延迟调度追更检查，但 `scheduleWatchingUpdatesCheck()` 丢弃了底层取消句柄。组件在 idle callback 或后续 4 秒 timer 触发前卸载时，旧任务仍可能动态导入追更模块并发起请求；完整 initialData 在 StrictMode 首轮 effect 中还会遗留重复调度。

## 2. 根因

`scheduleIdleTask()` 已提供取消函数，但包装它的 `useWatchingUpdatesRefresh` 没有返回该值；真正创建任务的 `useHomeData` effect 因此无法在 cleanup 回收任务。

## 3. 修复方案

- `scheduleWatchingUpdatesCheck()` 返回 `scheduleIdleTask()` canceller，SSR 统一返回 no-op。
- `useHomeData` effect 保存该句柄，并在 cleanup 与 tertiary idle 句柄一起调用。
- 保持一个 effect 最多创建一个追更任务：完整 initialData 的 early return 与加载结束后的调度点互斥，不引入数组、额外 ref 或双重所有权。
- 不中止已经开始的 fetch；本次只修复尚未执行的 idle/timer 工作泄漏。

## 4. 改动文件清单

- `src/hooks/useWatchingUpdatesRefresh.ts`
- `src/hooks/useWatchingUpdatesRefresh.test.ts`
- `src/hooks/useHomeData.ts`
- `src/hooks/useHomeData.test.ts`
- `.codestable/audits/2026-07-16-home-second-pass/index.md`
- `.codestable/audits/2026-07-16-home-second-pass/finding-06.md`

## 5. 验证结果

- `pnpm exec jest src/hooks/useWatchingUpdatesRefresh.test.ts src/hooks/useHomeData.test.ts --runInBand`：2 suites / 10 tests 通过。
- `pnpm exec jest --runInBand`：69 suites / 307 tests 通过。
- `pnpm typecheck`：通过。
- 修改文件 ESLint、Prettier check 与 `git diff --check`：通过。
- 通过 `127.0.0.1:16379` SSH 隧道执行 `pnpm build`：无 Redis 配置/连接错误并通过。

## 6. 遗留事项

取消句柄不能中止已经进入 `checkWatchingUpdates()` 的网络请求；当前请求有 tab、可见性和 in-flight 门禁，若未来需要 route 切换时中止在途 fetch，应单独为追更请求设计 `AbortSignal` 契约。
