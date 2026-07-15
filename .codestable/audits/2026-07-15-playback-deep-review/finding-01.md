---
doc_type: audit-finding
audit: 2026-07-15-playback-deep-review
finding_id: bug-01
nature: bug
severity: P1
confidence: medium
suggested_action: cs-issue
status: resolved
---

# Finding 01：同路由推荐跳转不重置媒体状态

## 速答

推荐卡片用 App Router 从 `/play` 跳到另一个 `/play`，组件实例会复用，但 reducer 初值、详情、短评、网盘结果和播放器会话没有统一按新媒体身份清理。

## 关键证据（修复前）

- `src/components/play/RecommendationsSection.tsx:87-92` — 推荐点击调用 `router.push(playUrl)`。
- `src/app/play/hooks/usePlayerState.ts:437-443` — route 信息只用于 reducer 首次初始化。
- `src/app/play/hooks/useBangumiDetails.ts:38-40` — 旧 movie/bangumi details 非空时会阻止新 ID 加载。
- `src/app/play/hooks/useNetdiskSearch.ts:21-27` — 结果状态没有媒体 identity reset。
- `src/app/play/page.tsx:455-498` — 短评请求没有 generation/cancel，旧结果可写回。
- `src/app/play/page.tsx:1068-1080` — loading/error 分支会暂时卸掉播放器容器，但旧 ArtPlayer 生命周期不由该分支结束。

## 影响

播放 A 后点击推荐 B，可能短暂或持续显示 A 的详情、推荐、短评或网盘结果；旧播放器实例也可能在新初始化前继续持有已卸载容器。

## 修复方向

低风险方案是推荐入口复用已验证的 document navigation；完整方案是引入统一 `mediaKey` 并原子 reset 所有媒体级状态。

## 修复记录（2026-07-15）

- 推荐卡片不再用 App Router `router.push()` 进行 `/play -> /play` 客户端复用，改为复用首页已验证的 document navigation。
- 点击其它推荐媒体会建立新的文档和 Provider/播放器会话，旧详情、短评、网盘结果和播放器实例不会沿用到目标媒体。
- 已补推荐入口使用 document navigation 的定向测试。统一 `mediaKey` 状态机仍属于 [finding-08.md](finding-08.md) 的后续重构，不影响本触发路径关闭。

## 建议动作

`cs-issue`，因为这是同路由复用导致的跨媒体状态错误。
