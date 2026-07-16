---
doc_type: audit-finding
audit: 2026-07-16-home-fifth-pass
finding_id: 'performance-08'
nature: performance
severity: P2
confidence: medium
suggested_action: cs-refactor
status: open
---

# Finding 08：追更首次调度被 TV 与综艺请求串行阻塞

## 速答

生产 SSR 只提供电影，但首页要等 critical、TV 和综艺全部 settle 后才创建追更 idle task；追更与热门内容没有数据依赖，却被 secondary 最长 6 秒 deadline 串行推迟。

## 关键证据

- `src/lib/home-data.server.ts:43-47` — 当前生产首批 snapshot 永远只填充 `hotMovies`。
- `src/hooks/useHomeData.ts:260-329` — 缺失区块会把 critical 与 secondary 放入同一 `loadingTasks` 并 `Promise.all` 等待。
- `src/hooks/useHomeData.ts:348-355` — 只有 `loadFallbackBatches()` 完成后才调用 `scheduleWatchingUpdatesCheck()`。
- `src/hooks/useWatchingUpdatesRefresh.ts:117-129` — 追更自身还会再等待至少 4 秒 idle delay。

## 影响

慢 TV/综艺请求会把追更 freshness 额外推迟到约 10 秒以后；用户最关心的新剧提醒与无关的热门分区故障耦合。

## 修复方向

在 StrictMode 取消点之后独立调度追更，或只等待 critical 首屏准备；保留 secondary/tertiary 的现有加载优先级与取消句柄。

## 建议动作

`cs-refactor`，因为目标是解除无数据依赖的串行耦合，外部结果不变。
