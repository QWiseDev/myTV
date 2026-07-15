---
doc_type: audit-finding
audit: 2026-07-15-playback-deep-review
finding_id: bug-05
nature: bug
severity: P1
confidence: medium
suggested_action: cs-issue
status: resolved
---

# Finding 05：播放进度乱序写入可回退集数和时间

## 速答

timeupdate、pause、visibility 和换集前保存都会独立 POST，同一 storage key 没有客户端串行或服务端 `save_time` 防旧写，较老请求后到可覆盖较新进度。

## 关键证据（修复前）

- `src/app/play/hooks/useEpisodeControls.ts:29-36`、`63-72` — 换集前发起保存但不等待。
- `src/app/play/hooks/usePlayerInitializer.ts:801-810`、`1028-1038` — pause/timeupdate 也独立保存。
- `src/app/play/hooks/usePlayProgress.ts:263-270` — visibility 隐藏时再次异步保存。
- `src/lib/db.client.ts:866-888` — 每次保存独立发 POST，没有 per-key 队列。
- `src/app/api/playrecords/route.ts:165-172` — 服务端直接覆盖，没有比较旧记录与请求的 `save_time`。

## 影响

弱网下快速换集、暂停或切后台，旧请求可能最后到达，导致继续观看退回旧集或更早时间。

## 修复方向

客户端按 storage key 串行/合并保存；服务端作为最终防线拒绝 `save_time` 更旧的写入。

## 修复记录（2026-07-15）

- `/api/playrecords` 在当前 Node 进程内按 username 串行 mutation；POST、单条 DELETE 和 clear-all 共享同一队列，read-compare-write 不再在本进程内交错。
- POST 统一得到有限数值 `save_time`，已有记录更新时间更晚时返回 `ignored: true`，不会被旧请求覆盖。
- 已补旧写拒绝、新写保存、并发写串行和“在途保存之后执行删除”测试；route 定向 4 个 tests 已知通过。
- 状态标记为 resolved 仅表示当前单进程可复现乱序路径已关闭。多实例/多进程仍需在持久化层做 CAS、事务或原子 upsert，不能把进程内 Map 当最终一致性保证。
- 换源不再提前删除旧 source key 以避免数据丢失，因此同一媒体的跨源重复记录仍可能出现；这属于后续安全迁移问题，不由同 key 的 `save_time` 防旧写解决。

## 建议动作

`cs-issue`，因为这是持久化顺序导致的数据正确性问题。
