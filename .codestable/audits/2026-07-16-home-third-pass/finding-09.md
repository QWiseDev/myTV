---
doc_type: audit-finding
audit: 2026-07-16-home-third-pass
finding_id: "performance-09"
nature: performance
severity: P2
confidence: high
suggested_action: cs-refactor
status: open
---

# Finding 09：数据库模式前台切换会高频读取追更 API

## 速答

visibility 调度只限制 15 秒，而数据库模式的检查每次都直接 GET `/api/watching-updates`；模块写入的 `memoryLastCheckTime` 没有参与该分支节流。

## 关键证据

- `src/hooks/useWatchingUpdatesRefresh.ts:97-112` — 页面重新可见后只做 15 秒 throttle。
- `src/lib/watching-updates.ts:181-186` — 数据库模式提前直接请求服务端。
- `src/lib/watching-updates.ts:203-215` — 30 分钟缓存判断位于 localStorage 后续分支，数据库模式不可达。
- `src/hooks/useWatchingUpdatesRefresh.test.ts` — 当前测试固化了 20 秒和 36 秒两次 visibility 请求。

## 影响

频繁切应用或浏览器标签会重复鉴权和 Redis 读取；追更缓存刚失效时还可能放大详情 rebuild 压力。

## 修复方向

给非 force 的 server check 设置明确轮询间隔，force 保持绕过；visibility 层只负责触发，不重复维护短周期 freshness。

## 建议动作

`cs-refactor`，因为这是轮询所有权与节流边界收口。
