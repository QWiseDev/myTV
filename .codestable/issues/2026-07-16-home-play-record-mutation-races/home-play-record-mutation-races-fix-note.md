---
doc_type: issue-fix
issue: 2026-07-16-home-play-record-mutation-races
path: fast-track
fix_date: 2026-07-16
tags: [home, play-records, cache, concurrency, rollback]
---

# 首页播放记录 mutation 竞态修复记录

## 1. 问题描述

首页单删与清空先独立修改 React state，持久化成功后才建立分页 tombstone / generation；在途 append、priority refresh 和旧 rollback 因此可以回填已删除记录、覆盖较新的分页状态，或在清空后复活旧记录。客户端全量缓存同时存在旧 GET 回写、跨用户串缓存、局部记录被当成完整全集、mutation 调用顺序反转，以及服务端拒绝旧保存后客户端仍保留乐观记录的问题。

## 2. 根因

- `usePlayRecordActions` 与 `usePlaybackRecords` 分别持有 mutation 和分页状态，门禁建立晚于首个异步等待，失败恢复又依赖旧 state 快照覆盖。
- clear、delete 与 priority refresh 缺少双向顺序、可撤销 tombstone、pagination session snapshot 和 intent revision。
- `db.client` 的 revision、pending request 与 cache 写入原本没有按用户名隔离；save 的前置 GET 也不在 mutation queue 内。
- 冷缓存 mutation 使用 `|| {}` 把局部结果写成有效全量缓存；POST 只检查 HTTP 状态，没有解析服务端 `{ ignored: true }`。
- User Menu 的事件刷新与初始请求没有 latest-request-wins，旧请求可能晚到覆盖新结果。

## 3. 修复方案

- 单删在发请求前同步建立可撤销 tombstone；清空建立带 `commit/rollback` 的 barrier，并保存 records、cursor、`hasMore`、error 与 tombstone session。
- 同 key delete 与 clear-all 分别复用在途 Promise；clear → delete 等 clear 落定，clear 成功后跳过冗余删除，clear 失败后才执行删除。
- priority request 使用 request generation + intent revision；direct、append-deferred、旧 intent 晚到及 clear rollback 只允许最新 intent 提交或重放。
- 播放记录 cache revision、pending mutation、请求去重 key 与 mutation queue 全部按用户名隔离；save 从入口即排队，前置读取和用户复核也位于队列内。
- save/delete 只有在有效全量 cache 存在时才做内部乐观合并；冷缓存保持 invalid，不把分页或调用方局部记录提升为全集。clear-all 仍可把 `{}` 作为完整目标状态缓存。
- 解析 POST 的 `ignored` 响应，恢复旧缓存并在同一队列内直接 reconciliation；mutation 失败也先回源再释放队列，回源失败则强制保持 cache 过期。
- reconciliation 与 ignored 保存保守失效当前用户的客户端追更缓存；切号后不清理新用户的全局 snapshot。
- User Menu 继续观看请求增加 request id，只有最新请求可以写入。

## 4. 改动文件清单

- `src/lib/db.client.ts`
- `src/lib/db.client.play-records-race.test.ts`
- `src/lib/db.client.watching-updates.test.ts`
- `src/hooks/usePlayRecordActions.ts`
- `src/hooks/usePlayRecordActions.test.ts`
- `src/hooks/usePlaybackRecords.ts`
- `src/hooks/usePlaybackRecords.test.ts`
- `src/components/user-menu/useUserMenuContinueWatching.ts`
- `src/components/user-menu/UserMenuDataHooks.test.ts`
- `.codestable/audits/2026-07-16-home-fifth-pass/finding-03.md`
- `.codestable/audits/2026-07-16-home-fifth-pass/index.md`

## 5. 验证结果

- 相关回归覆盖 delete / clear 双向成功与失败、重复 Promise、rollback session、direct / deferred / superseded priority intent、冷缓存局部写入、save 调用顺序、切号隔离、ignored reconciliation 及 reconciliation 失败。
- 相关 8 suites / 88 tests 通过；最终全量 Jest：87 suites / 499 tests 通过。
- `pnpm typecheck`、目标 ESLint `--max-warnings=0`、目标 Prettier check 与 `git diff --check` 通过。
- SSH 隧道 `127.0.0.1:16379 → 136.175.83.3:127.0.0.1:6379` 下 Redis `PING=PONG`；覆写本次进程的 `REDIS_URL` 后 `pnpm build` 通过。
- production server 真实浏览器冒烟：首页渲染 12 条继续观看记录，priority 更新角标与用户菜单可见，console 0 error / 0 warning。
- 浏览器验证未点击删除或清空；未修改 `.env`、远端 Redis 监听、防火墙或公网暴露。验证后 production server 与 SSH 隧道均已关闭，`3100`、`16379` 无监听。

## 6. 遗留事项

- 当前客户端 queue 是标签页内、服务端 mutation queue 是单 Node 进程内保护；未来横向扩容仍需要共享存储 CAS / 事务。
- 同一微任务链由外部代码连续创建多个 clear、以及无超时请求永久占住同用户 queue，当前 UI 路径不可达或缺少线上证据，留作后续硬化。
- 收藏清空仍是独立共享写入 contract，本次未顺手修改。
