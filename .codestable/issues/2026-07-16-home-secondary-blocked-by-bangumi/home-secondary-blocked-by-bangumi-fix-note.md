---
doc_type: issue-fix
issue: 2026-07-16-home-secondary-blocked-by-bangumi
path: fast-track
fix_date: 2026-07-16
tags: [home, performance, hydration, bangumi, fallback]
---

# 首页次要数据被 Bangumi 超时阻塞修复记录

## 1. 问题描述

服务端已经在首屏 HTML 中提供热门电影时，客户端 hydration 仍先请求完整 `/api/home`。真实环境中电影、TV、综艺均已成功，但 Bangumi 请求直到 8 秒 timeout 才结束，导致聚合响应整体约 8.04 秒后才返回，TV/综艺也无法提前显示；partial 响应又不会进入服务端、CDN 或客户端完整缓存，后续冷访问可能重复等待。

## 2. 根因

`src/hooks/useHomeData.ts` 只在 initial snapshot 完整时跳过聚合接口；只要 TV、综艺或 Bangumi 任一缺失，即使 SSR 已有 critical movies，仍会先 await `loadHomeDataFromApi()`。分项 fallback 必须等聚合返回后才启动，因此 Bangumi 成为 TV/综艺的 head-of-line blocker。

## 3. 修复方案

- initial snapshot 已有 critical movies 时，不再调用 `/api/home`，直接使用现有 `loadFallbackBatches()` 补齐缺失的 TV/综艺，并保持 Bangumi 的 idle tertiary 调度。
- initial snapshot 没有 critical movies 时，仍先走 `/api/home` 聚合兜底，避免空首屏同时发起三批请求。
- 在直接 fallback 前保留一个可取消的微任务边界，让 React StrictMode 首轮 effect cleanup 有机会失效旧任务，避免开发环境重复请求。

## 4. 改动文件清单

- `src/hooks/useHomeData.ts`
- `src/hooks/useHomeData.test.ts`

## 5. 验证结果

- 修复前新增测试稳定复现：critical-only 初值仍调用 `/api/home`；StrictMode 下调用 2 次聚合接口。
- 修复后 `useHomeData.test.ts` 4 个测试通过：
  - 有 SSR critical 时直接请求缺失 secondary，聚合调用次数为 0；
  - 无 critical 时仍只调用一次聚合兜底；
  - TV/综艺补载不覆盖已有热门电影；
  - StrictMode 只启动一次分项请求与一次追更调度。
- 全量 Jest：67 suites / 285 tests 通过。
- 变更文件 ESLint `--max-warnings=0`、Prettier 与 `pnpm typecheck` 通过。
- `pnpm build` 通过；构建期仍有本地 `.env` 直连远端 Redis 的历史 `ECONNREFUSED` 日志，最终退出码为 0。
- SSH Redis 隧道下最新生产包：SSR 首页 `HTTP 200`、TTFB `0.277s`、总耗时 `1.401s`，HTML 含“热门电影”；TV/综艺分项接口并发返回各 20 条，总耗时分别 `1.583s` 与 `1.521s`，不再需要等待 Bangumi 的 8 秒聚合 timeout。

## 6. 遗留事项

- `/api/home` 仍保留完整聚合语义，并在 initial critical 缺失时作为兜底；直接调用该接口时仍可能受 Bangumi timeout 影响。
- secondary 内部仍用一个 `Promise.all` 等待 TV 与综艺共同 settle；单边异常时另一边可能多等到 6 秒 timeout，可按真实运行数据另评估。
- Bangumi 失败尚未设置短期负缓存；每次新页面仍可能在 idle 阶段重试一次，但只影响新番区块，不再阻塞 TV/综艺。
