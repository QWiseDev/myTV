---
doc_type: issue-fix
issue: 2026-07-16-home-watching-updates-freshness
path: fast-track
fix_date: 2026-07-16
tags: [home, watching-updates, cache, concurrency]
---

# 首页追更刷新陈旧修复记录

## 1. 问题描述

localStorage 自动检查绕过真实计算，数据库模式播放记录 mutation 又不失效三小时服务端缓存；客户端 memory snapshot、主 cron 与并发 rebuild 还可能继续展示或写回旧结果。

## 2. 根因

- 首页调度直接拉服务端缓存，没有统一走 storage-aware 协调器。
- 客户端与服务端没有共享“哪些播放记录字段会影响追更”的失效契约。
- rebuild、cron 与 mutation 缺少统一 generation/singleflight 时序；invalidated 事件也没有表达“需要重算”。

## 3. 修复方案

- 抽出 `shouldInvalidateWatchingUpdates()`，客户端与 API 复用同一字段判定。
- 相关保存、删除、清空成功后同时清客户端缓存、发布 invalidated 事件并删除服务端用户缓存。
- 首页 hook 常驻订阅 invalidated 事件；跨 tab 保留 pending，检查中再次失效则排队 `force` 重算，正常事件只刷新一次 snapshot。
- 服务端 rebuild 在 generation 内重新读 DB，所有缓存写统一 singleflight；cron 不再传保护区外预采集 snapshot。

## 4. 改动文件清单

- `src/hooks/useWatchingUpdatesRefresh.ts` 及测试
- `src/lib/watching-updates.ts`、`watching-updates-cache.ts`、`watching-updates-invalidation.ts` 及测试
- `src/lib/db.client.ts`、`db.client.watching-updates.test.ts`
- `src/app/api/playrecords/route.ts` 及测试
- `src/app/api/cron/route.ts`
- `src/components/UserMenu.tsx`

## 5. 验证结果

- 追更/播放记录定向回归与并发回归通过；最终全量 Jest：76 suites / 367 tests。
- `pnpm typecheck`、目标 ESLint、`git diff --check` 通过。
- SSH 隧道 `127.0.0.1:16379 → 136.175.83.3:127.0.0.1:6379` 下 Redis `PING` 返回 `PONG`，最终 `pnpm build` 退出 0。
- 生产构建首页浏览器冒烟可见新剧集与继续观看汇总，浏览器 console 无 error。

## 6. 遗留事项

- generation map 为单进程保护；当前 standalone 部署是单 Node 进程。若未来横向扩容，需要把 generation/revision 下沉到共享存储。
- 本阶段未修改 `.env`，未开放远端 Redis 公网端口；验证后本地隧道已关闭。
