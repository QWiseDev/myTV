---
doc_type: issue-fix
issue: 2026-07-15-home-initial-data-latency
path: fast-track
fix_date: 2026-07-15
tags: [home, ssr, cache, performance, concurrency]
---

# 首页冷缓存首批数据与聚合缓存修复记录

## 1. 问题描述

首页 SSR 与 `/api/home` 共用完整聚合函数。冷缓存时电影、TV、综艺和 Bangumi 同处一个 `Promise.all`，页面要等待最慢的低优先级数据；DB 读取没有应用层 deadline，Redis 重连时等待甚至没有硬上界。任一 section 成功的 partial 结果又会进入完整内存、DB、CDN 和客户端缓存，导致客户端先命中残缺聚合，再重复分批补载。

## 2. 根因

- `page.tsx` 直接 await `getServerHomeData()`，SSR 与完整 API 没有不同的等待边界。
- 服务端只有一个 full memory/inflight，无法表达“首屏只等待 critical、完整 API 继续等待其余区块”。
- `readDbHomeData()` 没有 deadline，且用 `hasAnyData` 接受历史 partial 聚合。
- `/api/home` 对所有未抛异常的结果固定返回 public cache header；客户端也把任意非空聚合缓存 60 秒。
- 客户端只给完整 API 5 秒，但服务端 full 合法路径为 500ms DB deadline 加最慢 8 秒 Bangumi。
- `useHomeData` 的旧 effect 在 cleanup 后仍可能从 API await 继续进入 fallback，StrictMode 下会重复请求。

## 3. 修复方案

- 新增 `getServerInitialHomeData()`，读取顺序为完整内存、critical 内存、500ms DB deadline、热门电影；返回值始终保持完整 `HomeData` shape。
- 保留 `getServerHomeData()` 作为 full 聚合；initial/full 共用电影 critical memory 与 inflight，避免重复拉电影。
- 已有新 critical 时 full 跳过可能更旧的 DB 快照；fresh full 只拿到 partial 时会复查并发写入的完整内存结果。
- full 与 initial 的 DB 读取都受 500ms deadline 约束；只有 `isComplete` 数据可写 60 秒完整内存和 5 分钟 DB 缓存。
- partial、empty 和 error 的 `/api/home` 响应统一 `Cache-Control`/`CDN-Cache-Control: no-store`；客户端聚合内存也只保存 complete。
- 客户端 aggregate timeout 调整为 9 秒；`useHomeData` 在 API await 后、fallback 后和追更调度前检查 effect 是否已取消。

## 4. 改动文件清单

- `src/app/page.tsx`
- `src/app/page.test.tsx`
- `src/app/api/home/route.ts`
- `src/app/api/home/route.test.ts`
- `src/lib/constants/home.ts`
- `src/lib/home-data.server.ts`
- `src/lib/home-data.server.test.ts`
- `src/lib/home-data-loader.ts`
- `src/lib/home-data-loader.test.ts`
- `src/hooks/useHomeData.ts`
- `src/hooks/useHomeData.test.ts`
- `.codestable/audits/2026-07-15-home-deep-review/finding-06.md`
- `.codestable/audits/2026-07-15-home-deep-review/index.md`

## 5. 验证结果

- `pnpm exec jest --runInBand`：64 suites / 271 tests 全部通过。
- `pnpm typecheck`：通过。
- `pnpm build`：通过；构建期间远端 Redis `136.175.83.3:6379` 连接失败，但没有阻断产物生成。
- 本轮 TS/TSX 文件 `eslint --max-warnings=0` 与 Prettier：通过。
- `git diff --check`：通过。
- 本地生产包浏览器冒烟：`/` 与 `/play?source=test&id=1` 均按认证边界重定向登录页，登录页正常渲染，控制台无 error。

## 6. 遗留与取舍

- 500ms deadline 只停止调用方等待，不能取消底层 Redis 命令；Redis 长时间离线时仍可能留下后台重试。
- 本轮刻意不把 partial 放回长期缓存，也未新增 origin-only partial cooldown；持续上游故障时，不同 full 批次仍会重试缺失的 TV、综艺和 Bangumi，同批并发由 inflight 合并。
- 无本地登录态且远端 Redis 不可达，未完成登录后真实首页数据和首批电影的浏览器目视验收；对应时序、shape 和缓存语义已由单元/集成测试覆盖。
- 本轮按用户确认仅提交本地，未推送。
