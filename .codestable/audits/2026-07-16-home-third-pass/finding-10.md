---
doc_type: audit-finding
audit: 2026-07-16-home-third-pass
finding_id: "maintainability-10"
nature: maintainability
severity: P2
confidence: high
suggested_action: cs-refactor
status: open
---

# Finding 10：首页数据上下文与追更模块保留无消费者补丁路径

## 速答

近期定点修复后，播放记录 refresh API 与追更内部 listener Set 已没有消费者，却仍保留 timer、参数、Context 字段、镜像并发布尔值和测试负担。

## 关键证据

- `src/hooks/usePlaybackRecords.ts:134-147` — `refreshPlayRecords()` 仍创建 500ms timer并串联追更刷新。
- `src/contexts/PlayPageContext.tsx:40,86-98,118-136` — 该函数继续进入 Context；全仓实际消费者搜索只命中定义与透传。
- `src/lib/watching-updates.ts:70-71,636-643` — `updateListeners` 只有遍历，没有任何 `add` 调用。
- `src/lib/watching-updates.ts:175-197,435-445` — `globalCheckInProgress` 与 `updateCheckPromise` 表达同一在途状态。

## 影响

死 API 让 `usePlaybackRecords` 继续依赖本不需要的 `refreshWatchingUpdates`，Context value 和测试也携带无效表面；追更模块则保留不可达通知通道和重复状态机，增加后续修复误判。

## 修复方向

在 #1 功能修复稳定后，删除无消费者 refresh/context 字段、死 listener Set 和镜像布尔值，保留一个在途 Promise 与一个 DOM 事件通道。

## 建议动作

`cs-refactor`，因为这些代码已无运行时职责，只是多轮补丁残留。
