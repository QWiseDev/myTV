---
doc_type: issue-fix
issue: 2026-07-16-home-cron-play-record-race
path: fast-track
fix_date: 2026-07-16
tags: [home, cron, play-records, concurrency]
---

# cron 播放记录覆盖与复活竞态修复记录

## 1. 问题描述

cron 在远端 detail 请求前读取完整播放记录，返回后无条件整对象保存；用户并发更新、单删或清空时，旧 record 可能覆盖新进度或把已删除记录重新创建。

## 2. 根因

API POST 有自己的 per-user queue 与 `save_time` 比较，cron 却绕过该契约直接调用 `db.savePlayRecord()`，且“正常新建”和“只更新仍存在的旧记录”共用同一无条件写入口。

## 3. 修复方案

- 新建 `play-record-mutations.ts`，集中 per-user 序列化、`save_time` 比较、原始集数合并和追更缓存失效。
- API POST 与 cron 共用该服务。
- cron 使用 `requireExisting: true` 和 `expectedSaveTime`；记录已删除或 detail 请求期间已变化时返回 ignored，不再写入。

## 4. 改动文件清单

- `src/lib/play-record-mutations.ts` 及测试
- `src/app/api/playrecords/route.ts` 及测试
- `src/app/api/cron/route.ts`

## 5. 验证结果

- 回归覆盖 DELETE 先占用队列并清除记录后 cron 不得复活，以及新 `save_time` 不得被旧 cron 覆盖。
- 原 API 并发 POST/DELETE 与 stale save 回归继续通过。
- 最终全量 Jest：76 suites / 367 tests；`pnpm typecheck`、目标 ESLint、production build 通过。

## 6. 遗留事项

- 当前 queue 是单 Node 进程内契约；若未来多实例部署，需要把 compare-and-update 下沉为共享存储原子操作或分布式锁。
