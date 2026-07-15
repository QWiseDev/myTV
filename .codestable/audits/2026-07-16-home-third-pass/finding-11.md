---
doc_type: audit-finding
audit: 2026-07-16-home-third-pass
finding_id: "bug-11"
nature: bug
severity: P1
confidence: high
suggested_action: cs-issue
status: resolved
---

# Finding 11：主 cron 可能覆盖或复活用户播放记录

## 速答

主 cron 在队列外读取旧播放记录并等待远端详情，随后整对象保存；期间用户若更新或删除记录，cron 可能把旧进度覆盖回去，甚至在删除后重新创建记录。

## 关键证据

- `src/app/api/cron/route.ts` — 旧实现以 detail 请求前的完整 record 构造 `nextRecord` 并直接 `db.savePlayRecord()`。
- `src/lib/db.ts` — `savePlayRecord()` 最终是无条件整对象覆盖，没有 compare-and-merge。
- `src/app/api/playrecords/route.ts` — 用户 POST/DELETE 只有路由内 mutation queue，cron 原先不参与同一序列化契约。

## 影响

用户刚切换到更高集、更新播放进度、单删或清空记录时，恰逢 cron 详情刷新就可能出现进度回退或记录复活；随后首页继续观看与追更缓存都会基于错误记录重建。

## 修复方向

API 与 cron 共用播放记录 mutation 服务；cron 更新必须要求记录仍存在，且 `save_time` 与 detail 请求前一致，否则跳过。成功写入后统一失效追更 generation，再从数据库重建。

## 修复记录（2026-07-16）

- 新增 `play-record-mutations.ts`，集中 per-user queue、`save_time` 比较、原始集数合并与追更缓存失效。
- cron 使用 `requireExisting + expectedSaveTime` conditional-update；记录已删除或已更新时不写入。
- 回归覆盖 DELETE 先完成后 cron 不得复活记录，以及用户新 `save_time` 不得被旧 cron 覆盖。
- 修复记录见 `.codestable/issues/2026-07-16-home-cron-play-record-race/home-cron-play-record-race-fix-note.md`。
