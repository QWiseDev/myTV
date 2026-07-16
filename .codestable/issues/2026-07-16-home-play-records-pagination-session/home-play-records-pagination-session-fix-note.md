---
doc_type: issue-fix
issue: 2026-07-16-home-play-records-pagination-session
path: fast-track
fix_date: 2026-07-16
tags: [home, play-records, pagination, priority, concurrency]
---

# 首页播放记录 priority 分页会话修复记录

## 1. 问题描述

首屏额外展示的 priority 记录仍留在普通 cursor 流中，后续“加载更多”可能整页只返回已展示记录。priority key 更新又会用新首屏替换全部已追加页面，并重置 cursor / `hasMore`。

## 2. 根因

服务端 helper 把 `includeKeys` 只当成首屏附加项，没有从普通分页集合排除；客户端 append 不继续携带该集合，priority 变化还复用了“权威首屏替换”路径。

## 3. 修复方案

- 将 `includeKeys` 定义为当前分页会话的 pinned set：普通 cursor 流先排除 pinned，首屏再附加 pinned。
- 权威首屏成功后建立 session set；priority 补全成功后只增不减，append 始终携带已确认集合。
- priority 变化改为 merge，保留已有记录、cursor 与 `hasMore`。
- 权威首屏、append、priority 补全分别使用 request generation / request id；clear-all 统一失效旧响应。
- refresh error 的重试继续走 priority merge，不把已追加页面替换掉。

## 4. 改动文件清单

- `src/lib/play-records-pagination.ts`
- `src/lib/play-records-pagination.test.ts`
- `src/hooks/usePlaybackRecords.ts`
- `src/hooks/usePlaybackRecords.test.ts`
- `src/lib/db.client.play-records-page.test.ts`
- `.codestable/audits/2026-07-16-home-fourth-pass/finding-07.md`

## 5. 验证结果

- 纯分页回归覆盖 pinned 在首屏内外、后续页排除、cursor / `hasMore` 与全量 `total`。
- Hook 回归覆盖已追加页面与 cursor 保留、session set 只增不减、快速 priority 更新、append / priority 两种完成顺序、未确认 priority 被 supersede、clear/delete/error retry。
- 客户端 API 回归确认带 cursor 的远端请求仍序列化全部 `includeKey`。
- `pnpm exec jest src/hooks/usePlaybackRecords.test.ts src/lib/play-records-pagination.test.ts src/lib/db.client.play-records-page.test.ts --runInBand`：3 suites / 32 tests 通过。
- 最终全量 Jest：81 suites / 411 tests 通过；变更文件 ESLint `--max-warnings=0` 与 `pnpm typecheck` 通过。
- SSH 隧道 Redis `PING=PONG`，覆写本次构建进程的 `REDIS_URL` 后 `pnpm build` 通过；未修改 `.env` 或远端 Redis 配置。
- 当前远端数据不足以显示“加载更多”，浏览器只验证首屏与 priority 补全；append / priority 竞态由 Hook 与分页回归覆盖。
- 仓库全量 `pnpm lint:strict` 仍被 145 条既有 warning 阻断，均不在本阶段变更文件内。

## 6. 遗留事项

- `total` 继续表示全部播放记录数，不改成排除 pinned 后的普通流数量，以保持响应契约。
- 本次没有引入服务端 session token；分页稳定性依赖客户端在一次会话内持续携带 pinned set。
