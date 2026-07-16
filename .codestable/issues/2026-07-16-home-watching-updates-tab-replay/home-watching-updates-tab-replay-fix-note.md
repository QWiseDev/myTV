---
doc_type: issue-fix
issue: 2026-07-16-home-watching-updates-tab-replay
path: fast-track
fix_date: 2026-07-16
tags: [home, watching-updates, scheduling, tabs]
---

# 首页追更常规检查 tab 重放修复记录

## 1. 问题描述

首页只安排一次常规 idle 追更检查。若回调执行时用户停留在收藏夹，tab 门禁会直接返回；返回首页又只重放 invalidation，普通检查因此可能长期缺失。

## 2. 根因

scheduled callback 没有记录“普通检查已到期但暂不可执行”的状态。`activeTab` 切换不会重挂 `useHomeData` 或重新安排 idle task，visibility 补偿也覆盖不了同页内部 tab 切换。

## 3. 修复方案

- scheduled callback 先设置 `pendingRegularCheckRef`，再调用统一检查入口。
- tab、visibility 或已有检查门禁阻塞时保留 pending。
- 返回首页、恢复可见和当前检查结束时统一 drain 普通 pending 与 invalidation pending。
- 真正执行或被 30 分钟成功间隔节流后才消费普通 pending；invalidation 与普通 pending 合并为一次强制检查。

## 4. 改动文件清单

- `src/hooks/useWatchingUpdatesRefresh.ts`
- `src/hooks/useWatchingUpdatesRefresh.test.ts`
- `.codestable/audits/2026-07-16-home-fourth-pass/finding-06.md`

## 5. 验证结果

- 回归覆盖 idle 回调在收藏夹被挡住、返回首页后执行一次普通检查。
- 回归覆盖普通 pending 与 invalidation 合并、隐藏页恢复以及检查结束后的队列收敛。
- `pnpm exec jest src/hooks/useWatchingUpdatesRefresh.test.ts --runInBand`：1 suite / 13 tests 通过。
- 最终全量 Jest：81 suites / 411 tests 通过；变更文件 ESLint `--max-warnings=0` 与 `pnpm typecheck` 通过。
- 浏览器重载后立即切到收藏夹，等待 5.2 秒再返回首页；服务端出现新的 `/api/watching-updates` 200 请求，页面恢复为“新剧集 2 / 继续观看 4”，console 无 error。
- SSH 隧道 Redis `PING=PONG`，覆写本次构建进程的 `REDIS_URL` 后 `pnpm build` 通过；未修改 `.env` 或远端 Redis 配置。
- 仓库全量 `pnpm lint:strict` 仍被 145 条既有 warning 阻断，均不在本阶段变更文件内。

## 6. 遗留事项

- 常规检查仍以最近一次成功检查后的 30 分钟为节流基线；本次未调整产品刷新频率。
- 检查失败不会写入成功时间，后续 visibility 或新调度仍可重试。
