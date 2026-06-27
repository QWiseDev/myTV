---
doc_type: audit-finding
audit: 2026-06-27-home-review
finding_id: performance-04
nature: performance
severity: P2
confidence: medium
suggested_action: cs-refactor
status: resolved
---

# Finding 04：首页服务端超时兜底不取消底层请求

## 速答

首页服务端聚合使用 `withTimeout` 超时返回 fallback，但底层外部 fetch 没有被取消；高延迟或上游异常时，请求可能在页面已返回后继续占用服务端资源。

## 关键证据

- `src/lib/home-data.server.ts:43` — `getServerHomeData()` 并行聚合首页数据。
- `src/lib/home-data.server.ts:46` — 热门电影请求用 `withTimeout(..., DATA_FETCH_TIMEOUTS.CRITICAL, fallback)` 包裹。
- `src/lib/home-data.server.ts:51` — 热门剧集请求用 `withTimeout` 包裹。
- `src/lib/home-data.server.ts:56` — 热门综艺请求用 `withTimeout` 包裹。
- `src/lib/home-data.server.ts:61` — Bangumi 请求用 `withTimeout` 包裹。
- `src/lib/promise-timeout.ts:30` — 超时后只设置 `settled` 并 `resolve(fallback)`。
- `src/lib/promise-timeout.ts:36` — 原始 promise 仍继续执行，只是完成后被忽略。
- `src/lib/douban.ts:57` — 豆瓣请求有自己的 `AbortController`。
- `src/lib/douban.ts:58` — 豆瓣底层 fetch 超时是 10 秒，长于首页 critical/secondary 的 5/6 秒窗口。

## 影响

用户看到的是降级后的空区块或客户端 fallback，但服务端仍可能维持外部请求、连接和回调。单次影响不大；在首页高并发或上游变慢时，会放大 Node 运行时资源占用。

## 修复方向

让首页聚合函数向底层 fetch 传递 `AbortSignal`，或用 `AbortSignal.timeout()` 统一超时与取消；同时把服务端和客户端抓取超时策略收敛到同一处。

## 处理结果

已在首页服务端聚合中使用 abortable timeout，并将 signal 传入豆瓣和 Bangumi fetch 链路；超时返回 fallback 的同时会 abort 底层请求。

## 建议动作

`cs-refactor`，因为这是保持降级语义不变的资源治理。
