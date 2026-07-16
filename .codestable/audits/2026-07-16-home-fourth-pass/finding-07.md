---
doc_type: audit-finding
audit: 2026-07-16-home-fourth-pass
finding_id: 'performance-07'
nature: performance
severity: P2
confidence: high
suggested_action: cs-issue
status: resolved
---

# Finding 07：priority 项与 cursor 分页状态未隔离

## 速答

首屏额外插入的 priority 记录仍会落入后续 cursor 页面；priority 更新又会用新首屏替换全部已追加记录，分页会话缺少稳定边界。

## 关键证据

- `src/lib/play-records-pagination.ts:97-113` — 普通 page slice 不排除 `includeKeys`，附加 included entries 后 cursor 与 `hasMore` 仍只按普通 slice 计算。
- `src/hooks/usePlaybackRecords.ts:89-105` — append 请求不再传 `includeKeys`，因此服务端不知道哪些 priority 项已在首屏额外展示。
- `src/hooks/usePlaybackRecords.ts:206-217` — priority signature 变化触发非 append 首屏刷新；成功后 `setPlayRecords(... : pageRecords)` 清掉已加载的后续页并重置 cursor。

## 影响

“加载更多”可能拿到已经展示的 priority 项而没有新增卡片；用户加载多页后收到追更 priority 更新，后续页会从 UI 消失并要求重新加载。

## 修复方向

为一次分页会话固定 priority 排除集合，并区分“首屏权威重载”和“priority 补全”，避免重置已追加数据与 cursor。

## 处理进展（2026-07-16）

- `includeKeys` 作为分页会话 pinned set：普通 cursor 流先排除 pinned，首屏再额外附加 pinned，后续页不再重复。
- Hook 在权威首屏成功后建立 session set；priority 补全成功后只增不减，append 仅携带该已确认集合，未完成的 priority key 继续留在普通 cursor 流中。
- priority 变化改为 merge，不再替换已追加记录或写回补全请求的 cursor / `hasMore`。
- append、priority 补全与权威首屏使用独立请求门禁；快速 priority 变化、clear-all、删除与失败重试不会被旧响应回写。
- 新增纯分页、远端 cursor 参数、会话 cursor 保留、双向并发完成顺序、stale priority 与 priority A→B supersede 回归。

## 建议动作

`cs-issue`，因为性能浪费已转化为可见的分页交互退化。
