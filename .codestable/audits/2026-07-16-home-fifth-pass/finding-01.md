---
doc_type: audit-finding
audit: 2026-07-16-home-fifth-pass
finding_id: 'bug-01'
nature: bug
severity: P1
confidence: high
suggested_action: cs-issue
status: resolved
---

# Finding 01：追更接口失败被当作成功并触发 30 分钟节流

## 速答

Redis/数据库模式下，追更请求的 HTTP 错误、无效响应和网络异常都会退回旧缓存并正常 resolve；首页 hook 随后把这次失败记成成功，30 分钟内不再做普通重试。

## 关键证据

- `src/lib/watching-updates.ts:130-155` — 非 2xx、无效 JSON 和 fetch 异常都返回 `getDetailedWatchingUpdates()`，没有向调用方表达失败。
- `src/lib/watching-updates.ts:167-172` — 非 localStorage 模式直接等待上述 helper，任何 fallback 都被视为成功完成。
- `src/hooks/useWatchingUpdatesRefresh.ts:79-87` — pending 在请求前被清除，请求 resolve 后无条件写入 `lastCheckAtRef`。
- `src/hooks/useWatchingUpdatesRefresh.test.ts:431-459` — 现有“失败可重试”测试 mock 了 rejection，但生产 server-mode helper 正常不会抛出该 rejection。

## 影响

追更缓存刚失效时若 `/api/watching-updates` 短暂 500 或断网，页面会继续展示旧 snapshot；后续 visibility/普通检查又被成功时间节流，陈旧状态最长可持续 30 分钟。

## 修复方向

让 server-mode 拉取明确返回 fresh/failure 或直接抛错，并且只在拿到有效新响应后写成功时间；补真实 server-mode 500、无效响应和网络失败回归。

## 处理进展（2026-07-16）

- server mode 的非 2xx、无效 payload 和网络异常改为继续抛出，不再退回旧缓存后 resolve。
- 有效响应仍缓存 snapshot，并只发布一次 `watchingUpdatesChanged`。
- 新增真实 `STORAGE_TYPE=redis` 的成功、HTTP 失败、无效响应和网络失败回归。

## 建议动作

`cs-issue`，因为底层错误语义直接破坏 hook 已有的失败重试契约。
