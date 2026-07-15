---
doc_type: audit-finding
audit: 2026-07-15-home-deep-review
finding_id: performance-06
nature: performance
severity: P1
confidence: high
suggested_action: cs-refactor
status: resolved
---

# Finding 06：冷缓存首屏等待最慢三级数据

## 速答

首页服务端原本把关键、次要和三级数据放进同一个 `Promise.all`，冷缓存时整页会等待最慢的 Bangumi；现已拆分 SSR 首批读取与完整聚合，冷缓存首屏只等待电影关键数据。

## 关键证据

- `src/app/page.tsx:24-27` — 页面先完整 await `loadInitialHomeData()` 才渲染 `HomeClient`。
- `src/lib/home-data.server.ts:134-175` — 电影、TV、综艺和 Bangumi 同处一个 `Promise.all`。
- `src/lib/constants/home.ts:6-10` — 关键/次要/三级超时分别为 5/6/8 秒。
- `src/lib/home-data.server.ts:206-210` — 只要“有任意数据”就按 60 秒内存、5 分钟 DB TTL 缓存部分结果。
- `src/hooks/useHomeData.ts:172-198` — hydration 后还会先请求完整 `/api/home`，再走缺失项 fallback。

## 影响

冷缓存或单个低优先级上游变慢时，首屏关键内容仍被拖住；部分结果被缓存后，客户端可能先重复命中同一份不完整聚合，再发分批请求。

## 修复方向

单独设计 SSR 总预算和关键 section 边界；不完整聚合不按完整 TTL 缓存，客户端直接补缺失 section。

## 修复记录（2026-07-15）

- 新增 `getServerInitialHomeData()`：完整内存缓存优先，DB 读取最多等待 500ms；冷缓存未命中时只等待热门电影，返回四字段齐全、缺失区块为空数组的 `HomeData`。
- `page.tsx` 改用首批读取；完整 `/api/home` 聚合继续补 TV、综艺和 Bangumi，不再阻塞 SSR。
- initial/full 共用电影 critical memory 与 inflight；已有 critical 时 full 跳过可能更旧的 DB 快照，避免电影列表在 hydration 后回退。
- full 的 DB 读取同样增加 500ms deadline；只有 `isComplete` 聚合才能写入 60 秒完整内存缓存和 5 分钟 DB 缓存。
- `/api/home` 的 partial/empty/error 响应统一 `no-store`，客户端聚合内存也只缓存完整结果。
- 客户端聚合等待预算调整为 9 秒，覆盖服务端 500ms DB deadline 与 8 秒 Bangumi 上限；已取消的 StrictMode effect 不再继续发 fallback 或安排追更。
- 已补 SSR 首批、DB deadline、initial/full 去重、partial 缓存、缓存时序、路由 header、客户端缓存和 StrictMode cleanup 回归测试。

## 验证

- `pnpm exec jest --runInBand`：64 suites / 271 tests 通过。
- `pnpm typecheck`、`pnpm build`、本轮文件 ESLint/Prettier、`git diff --check`：通过。
- 本地生产包浏览器冒烟：`/` 与 `/play?...` 的认证重定向正确，登录页可渲染且控制台无 error。
- 本机无法连接 `.env` 指向的远端 Redis，因此未完成登录后真实首页数据目视验收；构建仍成功完成。

## 运行态跟进（2026-07-16）

- SSH Redis 隧道复验确认 SSR 首屏已解除阻塞：冷首页 `HTTP 200`，TTFB `0.152s`、总耗时 `0.777s`，HTML 已包含热门电影。
- 同次复验发现 hydration 仍会请求完整 `/api/home`；Bangumi 失败时该接口约 `8.04s` 才返回 partial，TV/综艺虽各有 20 条也被整体扣留。
- 后续 issue `2026-07-16-home-secondary-blocked-by-bangumi` 已修复该客户端 head-of-line：有 SSR critical 时直接补 TV/综艺并 idle 拉 Bangumi，只有空 initial 才保留聚合兜底。
- 最新生产包下 TV/综艺分项接口并发返回各 20 条，总耗时约 `1.58s` 与 `1.52s`；全量 Jest 更新为 67 suites / 285 tests。

## 建议动作

`cs-refactor`，因为这会改变性能与缓存边界，需要设计和浏览器/服务端验证；本轮已按确认后的边界完成修复。
