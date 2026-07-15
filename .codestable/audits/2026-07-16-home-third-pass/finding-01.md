---
doc_type: audit-finding
audit: 2026-07-16-home-third-pass
finding_id: "bug-01"
nature: bug
severity: P1
confidence: high
suggested_action: cs-issue
status: resolved
---

# Finding 01：追更刷新在两种存储模式下都可能长期陈旧

## 速答

localStorage 首页调度只读取旧追更缓存，数据库模式的播放记录写删又不失效三小时服务端缓存；两种模式都会让首页徽章、汇总和 priority key 长期落后于真实播放记录。

## 关键证据

- `src/hooks/useWatchingUpdatesRefresh.ts:44-52` — 自动检查直接调用 `fetchWatchingUpdatesFromServer()`，绕过 storage-aware 的检查协调器。
- `src/lib/watching-updates.ts:128-137` — localStorage 分支只返回 `getDetailedWatchingUpdates()`，不会扫描播放记录或详情。
- `src/lib/watching-updates.ts:181-186` — 真正区分 local/server 并执行检查的是 `checkWatchingUpdates()`。
- `src/app/api/playrecords/route.ts:214-229,257-280` — POST、单删和清空成功后都没有失效追更缓存。
- `src/lib/watching-updates-cache.ts:7-8,340-363` — `watching-updates:{username}` TTL 为三小时，普通读取优先复用旧值。

## 影响

localStorage 用户的首页自动追更可能完全不计算；Redis/数据库用户消费新集或删除续播记录后，旧“新剧集/继续观看”状态最长保留三小时。旧 rebuild 与 mutation 交叠时还可能在失效后重新写回旧快照。

## 修复方向

统一由 storage-aware 协调器执行首页检查；播放记录相关字段变化、删除和清空后失效用户追更缓存，并用 generation 防止 mutation 前启动的 rebuild 迟到写回。

## 建议动作

`cs-issue`，因为当前可见追更状态与已持久化播放记录不一致。

## 修复记录（2026-07-16）

- 首页自动检查统一调用 storage-aware `checkWatchingUpdates()`；正常事件到达时只刷新一次 snapshot。
- 播放记录关键字段变化、删除和清空成功后同时失效客户端缓存与 `watching-updates:{username}`；invalidated 事件在 favorites tab 也会保留 pending，回到首页后强制重算。
- invalidation 发生在检查中时会排队第二次 `force` 检查，绕过 localStorage 30 分钟门控；失败且无正常结果事件时 snapshot 回读为 `null`，不继续展示已知陈旧徽章。
- 服务端 rebuild 统一在 generation 内读取播放记录并 singleflight；主 cron 不再在保护区外传旧 snapshot。
- 修复记录见 `.codestable/issues/2026-07-16-home-watching-updates-freshness/home-watching-updates-freshness-fix-note.md`。
