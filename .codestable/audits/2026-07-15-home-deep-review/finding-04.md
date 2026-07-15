---
doc_type: audit-finding
audit: 2026-07-15-home-deep-review
finding_id: bug-04
nature: bug
severity: P1
confidence: high
suggested_action: cs-issue
status: resolved
---

# Finding 04：第二页继续观看进入播放页后可能丢续播

## 速答

首页可以加载第 2 页以后的播放记录，但 `/play` 重新挂载后只读取最近 12 条和追更 priority keys；当前被点击的旧记录不一定在内，续播集数、时间和元数据 fallback 会丢失。

## 关键证据（修复前）

- `src/hooks/usePlaybackRecords.ts:6-8` — 播放记录页大小固定为 12。
- `src/hooks/usePlaybackRecords.ts:61-65` — 首屏 include keys 只有追更 priority keys，没有当前 `/play?source&id`。
- `src/components/ContinueWatching.tsx:213-231` — 用户可以加载并点击第 2 页以后的记录。
- `src/components/VideoCard.tsx:515-517` — 点击走 document navigation，播放页 Provider 会重新创建。
- `src/app/play/page.tsx:338-346` — `routePlayRecord` 只从 Provider 当前页记录中查找。
- `src/app/play/hooks/usePlayRecordSync.ts:103-105` — 当前 key 没有记录时直接返回，不恢复集数和进度。

## 影响

用户从“加载更多”后的旧记录进入播放页时，可能从第 1 集/0 秒开始；空详情所需的历史标题、封面与豆瓣 ID fallback 也可能缺失。

## 修复方向

播放页首批请求必须显式 include 当前 route storage key，或单独读取当前记录；补“超过 12 条后从第二页进入播放页”的链路测试。

## 修复记录（2026-07-15）

- 播放页新增数据边界，从当前 URL 读取 `source` / `id` 并生成 storage key。
- `PlaybackDataProvider` 把当前 route key 与追更 priority keys 去重合并后传给首批播放记录请求。
- 因此当前媒体即使位于第 2 页以后，也会进入播放页首批结果，续播集数、时间和元数据 fallback 不再依赖“恰好位于最近 12 条”。
- 已补当前 route key 与追更 key 同时 include 的 Provider 测试；最终全量 Jest、typecheck 与 build 已通过。

## 建议动作

`cs-issue`，因为分页改造破坏了原有续播行为。
