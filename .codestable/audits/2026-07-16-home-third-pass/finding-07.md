---
doc_type: audit-finding
audit: 2026-07-16-home-third-pass
finding_id: "performance-07"
nature: performance
severity: P2
confidence: high
suggested_action: cs-refactor
status: resolved
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

## 修复记录（2026-07-16）

- 新增 task-factory 形式的 `withAbortableTimeout()`；timeout 与父 signal 都会 reject 并真实 abort task signal，旧 `withTimeout()` 保持兼容。
- `useHomeData` 每批分项加载共用父 controller，effect cleanup 会取消电影、TV、综艺和 Bangumi；共享 `/api/home` inflight 不绑定组件 signal。
- Douban signal 已贯通客户端直连/代理、categories route、服务端限流/随机 delay 与上游 fetch；取消后不继续请求或写分类缓存。
- Bangumi 提供可抛错的 signal-aware fetch，兼容 wrapper 仍保持失败转空数组；取消后不写缓存。
- 修复记录见 `.codestable/issues/2026-07-16-home-section-reliability/home-section-reliability-fix-note.md`。
