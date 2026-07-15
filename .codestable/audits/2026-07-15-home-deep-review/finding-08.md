---
doc_type: audit-finding
audit: 2026-07-15-home-deep-review
finding_id: maintainability-08
nature: maintainability
severity: P2
confidence: high
suggested_action: cs-issue
status: resolved
---

# Finding 08：image-proxy 并发改动漏同步测试基线

## 速答

生产并发上限已从 12 调到 6，但测试仍按 12 发请求并断言，导致当前全量 Jest 稳定失败。

## 关键证据（修复前）

- `src/app/api/image-proxy/route.ts:9-13` — 当前上限是 6。
- `src/app/api/image-proxy/route.test.ts:15-17` — 测试常量仍是 12。
- `src/app/api/image-proxy/route.test.ts:111-124` — 只会有 6 个 fetch 获得槽位，断言却期待 12 次。
- 审计时 `pnpm exec jest --runInBand` 曾复现：Expected 12, Received 6；该结果仅作为修复前证据。

## 影响

全量测试门禁为红色，后续真实回归会被既有失败噪音掩盖。

## 修复方向

让测试基线与生产常量一致，并保留“第 N+1 个请求返回 503”的行为断言。

## 修复记录（2026-07-15）

`src/app/api/image-proxy/route.test.ts` 的并发基线已从 12 调整为 6，与生产上限一致；测试仍覆盖 6 个请求获得槽位以及第 7 个请求返回 503。原审计基线中的“Expected 12, Received 6”已过期，最终全量 Jest 已通过。

## 建议动作

`cs-issue`，因为根因明确且修复只有 1 处，适合快速通道。
