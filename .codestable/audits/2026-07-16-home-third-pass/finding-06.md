---
doc_type: audit-finding
audit: 2026-07-16-home-third-pass
finding_id: "maintainability-06"
nature: maintainability
severity: P2
confidence: high
suggested_action: cs-refactor
status: open
---

# Finding 06：完整聚合缓存退出正常首页成功链路

## 速答

SSR 快路径成功拿到电影后，客户端明确跳过 `/api/home`；而完整 memory/Redis 聚合缓存只有 `/api/home` 对应 full reader 才会写，整套聚合缓存已退化为 critical 失败时的兜底路径。

## 关键证据

- `src/app/page.tsx:10-27` — 首页只调用 `getServerInitialHomeData()`。
- `src/lib/home-data.server.ts:315-319` — 完整聚合缓存唯一写点位于 `getServerHomeData()`。
- `src/lib/home-data.server.ts:339-371` — initial reader 冷缓存只返回热门电影，不启动 full reader。
- `src/hooks/useHomeData.ts:200-218` — 有 SSR critical 时跳过 `/api/home`，直接走客户端分项。

## 影响

正常流量不会续期 `home:aggregate-v1`，但项目仍维护 full/initial 两套 inflight、TTL、Redis/CDN/client cache 与测试；电影成功与否还会决定两套不同 freshness 和错误语义。

## 修复方向

先拍板二选一：恢复一次性后台聚合预热并避免与客户端分项重复，或删除冗余 aggregate 层并统一 empty-initial 兜底。

## 建议动作

`cs-refactor`，因为问题是多轮性能补丁后留下的双路径结构债。
