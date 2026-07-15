---
doc_type: audit-finding
audit: 2026-07-16-home-second-pass
finding_id: performance-06
nature: performance
severity: P2
confidence: high
suggested_action: cs-refactor
status: resolved
---

# Finding 06：追更 idle 检查丢失取消句柄

## 速答

首页调度约 4 秒后的追更检查时丢弃 `scheduleIdleTask()` 返回值，离开页面后任务仍可能执行。

## 关键证据

- `src/hooks/useWatchingUpdatesRefresh.ts:60-74` — `scheduleWatchingUpdatesCheck()` 调用 `scheduleIdleTask()` 后不返回取消函数。
- `src/hooks/useHomeData.ts:187-189`、`216-225` — 数据完成后调度追更检查，但 effect cleanup 只取消 tertiary load。
- `src/lib/browser-scheduler.ts:13-45` — 调度器已提供可同时取消 idle callback 与 delay timer 的标准句柄，调用方没有接住。

## 影响

用户在 4 秒窗口内离开首页后，旧 callback 仍保留最后的 `activeTabRef === 'home'` 并可能发起网络请求；完整 SSR 数据下 StrictMode 首轮 effect 还会留下重复 schedule。

## 修复方向

把取消句柄返回给 `useHomeData`，由 effect cleanup 统一回收。

## 建议动作

`cs-refactor`，因为这是现有调度契约的所有权补全，不需要改变追更逻辑。

## 修复记录（2026-07-16）

- `scheduleWatchingUpdatesCheck()` 现在返回底层 `scheduleIdleTask()` 的取消函数；SSR 分支返回 no-op，调用契约保持统一。
- `useHomeData` effect 接住该句柄，并在 cleanup 与 tertiary idle 任务一起取消；创建与回收由同一 effect 持有。
- 完整 initialData 的 StrictMode 首轮 setup 会在模拟 cleanup 时取消，第二轮只保留一个 live task；普通卸载同样会取消未执行任务。
- 不扩大到中止已经开始的追更 fetch；active tab 与页面可见性门禁保持不变。
- 定向 Jest 2 suites / 10 tests、全量 Jest 69 suites / 307 tests、typecheck、production build、目标 ESLint 与格式检查通过。
