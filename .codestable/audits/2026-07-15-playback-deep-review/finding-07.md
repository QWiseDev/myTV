---
doc_type: audit-finding
audit: 2026-07-15-playback-deep-review
finding_id: performance-07
nature: performance
severity: P2
confidence: high
suggested_action: cs-refactor
status: open
---

# Finding 07：弹幕默认策略与旧性能结论反向漂移

## 速答

旧播放性能审计记录“未设置偏好时不自动加载弹幕”，当前代码却把无偏好默认成 true，并在 ready 后固定安排加载。

## 关键证据

- `.codestable/audits/2026-06-18-playback-performance/index.md:49-51` — 旧处理结果记录无偏好时不自动加载。
- `src/app/play/page.tsx:110-114` — 当前无偏好时返回 true。
- `src/app/play/page.tsx:323-329` — 挂载后又重复读取同一偏好。
- `src/app/play/hooks/usePlayerInitializer.ts:737-760` — ready 后 1 秒固定安排弹幕加载。

## 影响

新用户会默认请求并渲染弹幕，重新引入旧审计指出的持续 CPU/GPU 负载；同时实现、测试/文档和历史结论不一致。

## 修复方向

先由产品确认新用户默认策略；随后删除重复读取并让实现、测试和审计记录保持一致。

## 本轮进展（2026-07-15）

本轮修复了弹幕请求 abort、跨集/跨播放器 stale result 和 loading 所有权，但没有改变新用户默认值，也没有删除页面与 initializer 的重复偏好读取。性能与产品策略问题仍完整存在，因此保持 open。

## 建议动作

`cs-refactor`，因为默认策略需要用户拍板，结构收敛本身应保持选定行为不变。
