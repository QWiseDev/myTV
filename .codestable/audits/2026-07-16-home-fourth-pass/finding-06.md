---
doc_type: audit-finding
audit: 2026-07-16-home-fourth-pass
finding_id: 'bug-06'
nature: bug
severity: P2
confidence: high
suggested_action: cs-issue
status: resolved
---

# Finding 06：收藏夹可消费唯一一次常规追更检查

## 速答

常规 idle 检查若在收藏夹激活时执行会直接跳过，返回首页只重放 invalidation，不会重新安排被跳过的普通检查。

## 关键证据

- `src/hooks/useWatchingUpdatesRefresh.ts:105-109` — tab 返回首页只在 `pendingInvalidationRef` 为真时主动检查。
- `src/hooks/useWatchingUpdatesRefresh.ts:111-125` — scheduled callback 在非首页时直接 return，没有记录“常规检查被跳过”。
- `src/hooks/useHomeData.ts:310-329` — 首页数据加载完成后只安排一次常规追更检查，effect 不因 `activeTab` 切换而重跑。
- `src/components/HomeClient.tsx:136-179` — 首页与收藏夹在同一组件实例内切换，不会通过重新挂载补调度。

## 影响

用户在启动后的 idle 延迟内切到收藏夹，再返回首页时，追更 snapshot 可持续陈旧，直到 visibility 事件或新的 invalidation 出现。

## 修复方向

记录被 tab 门禁跳过的常规检查，并在返回 `home` 时重放一次，同时保留现有 30 分钟节流。

## 处理进展（2026-07-16）

- scheduled callback 先记录 `pendingRegularCheckRef`，再进入现有 tab / visibility / in-flight 门禁；被拦截时不再丢失。
- 返回首页、恢复可见以及上一轮检查结束时统一 drain 普通 pending 与 invalidation pending。
- 普通重放继续经过 30 分钟节流；与 invalidation 同时存在时只执行一次强制检查。
- 新增收藏夹返回、普通 pending + invalidation 合并、隐藏页恢复与不重复执行回归。

## 建议动作

`cs-issue`，因为可由明确 tab 时序稳定触发。
