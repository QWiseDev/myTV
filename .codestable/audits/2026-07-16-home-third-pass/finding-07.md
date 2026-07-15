---
doc_type: audit-finding
audit: 2026-07-16-home-third-pass
finding_id: "performance-07"
nature: performance
severity: P2
confidence: high
suggested_action: cs-refactor
status: open
---

# Finding 07：客户端分项超时不取消底层请求

## 速答

首页电影、TV 和综艺的超时只提前解析空 fallback，源 fetch 仍继续运行；组件重挂或再次加载时可以叠加第二批请求，迟到成功又不会更新当前页面。

## 关键证据

- `src/lib/home-data-loader.ts:88-152` — 分项 loader 使用非 abortable `withTimeout()`。
- `src/lib/promise-timeout.ts:28-48` — 超时只 resolve fallback，不取消源 Promise。
- `src/lib/promise-timeout.test.ts:20-33` — 测试明确锁定 late result 被忽略而非取消。
- `src/lib/douban.client.ts:328` — 当前分类加载契约没有接收 effect 级 `AbortSignal`。

## 影响

慢上游时会留下后台连接、无效缓存写入和潜在迟到日志；RSC 更新、StrictMode 重挂或用户重试可放大并发。

## 修复方向

向分项 loader 与底层 fetch 透传 `AbortSignal`，timeout 和 effect cleanup 都真实 abort，并为同一批次增加 singleflight 边界。

## 建议动作

`cs-refactor`，因为需要调整请求取消契约但不应改变成功数据行为。
