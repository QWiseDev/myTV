---
doc_type: audit-finding
audit: 2026-07-15-home-deep-review
finding_id: performance-06
nature: performance
severity: P1
confidence: high
suggested_action: cs-refactor
status: open
---

# Finding 06：冷缓存首屏等待最慢三级数据

## 速答

首页服务端把关键、次要和三级数据放进同一个 `Promise.all`，冷缓存时整页要等待最慢的 8 秒 Bangumi 预算，客户端所谓分层加载只能在内容首次返回后发生。

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

## 本轮进展（2026-07-15）

本轮只拆分了客户端 TV/综艺的缺失项补载与 loading 所有权，没有改动服务端 `loadInitialHomeData()` 的聚合等待、Bangumi 预算或部分结果缓存 TTL。冷缓存首屏仍可能被低优先级数据拖住，因此保持 open，需单独设计和验证 SSR/缓存策略。

## 建议动作

`cs-refactor`，因为这会改变性能与缓存边界，需要设计和浏览器/服务端验证。
