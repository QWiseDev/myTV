---
doc_type: audit-finding
audit: 2026-07-15-home-deep-review
finding_id: bug-01
nature: bug
severity: P1
confidence: high
suggested_action: cs-issue
status: resolved
---

# Finding 01：分页刷新竞态会永久卡住“加载更多”

## 速答

加载更多请求与追更 priority keys 刷新重叠时，旧 append 请求会被丢弃且无法清理 `loadingMorePlayRecords`，按钮会一直显示“加载中”。

## 关键证据（修复前）

- `src/hooks/usePlaybackRecords.ts:47` — 首屏刷新和 append 共用一个递增 `loadRequestRef`。
- `src/hooks/usePlaybackRecords.ts:54-55` — append 开始后把 `loadingMorePlayRecords` 设为 true。
- `src/hooks/usePlaybackRecords.ts:68` — 新请求出现后，旧请求直接 return。
- `src/hooks/usePlaybackRecords.ts:85-90` — 旧 append 的 `finally` 因 requestId 过期不会清 loading；新首屏请求只清 `loadingPlayRecords`。
- `src/hooks/usePlaybackRecords.ts:154-165` — priority keys 变化会立即启动新的首屏请求。
- `src/components/ContinueWatching.tsx:213-231` — `loadingMore` 为 true 时“更多”按钮永久 disabled。

## 影响

用户在追更数据刷新附近点击“更多”即可触发；后续无法继续分页，直到首页组件重挂载或刷新页面。

## 修复方向

为首屏刷新和 append 分离 generation/loading 所有权，或让过期 append 仍在 finally 中清理自己的 loading 状态；补请求交叠回归测试。

## 修复记录（2026-07-15）

- `usePlaybackRecords` 已把首刷与 append 的 generation 分离；新首刷会立即 supersede 旧 append、清除“加载更多”状态并建立新游标基线，不再等待旧请求 settle。
- 静默首刷通过独立 ref 持有 loading 所有权，期间拒绝新 append，避免 `loadingPlayRecords=false` 时误发旧游标请求。
- 旧请求的 success、catch 与 finally 均校验当前 identity；较旧首刷失败不再清空较新结果。
- clear-all 会同时失效首刷和 append generation、清空本地 ref/游标/loading；已发出的首刷或 append 晚到后也不能重新填回记录。
- 已补分页双向交叠、静默首刷、stale failure、clear-all 在途首刷与 append 回归测试；最终全量 Jest、typecheck 与 build 已通过。

## 建议动作

`cs-issue`，因为这是确定的异步竞态和用户可见功能错误。
