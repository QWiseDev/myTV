---
doc_type: audit-finding
audit: 2026-07-16-home-fourth-pass
finding_id: 'maintainability-05'
nature: maintainability
severity: P2
confidence: medium
suggested_action: cs-refactor
status: open
---

# Finding 05：partial initialData 与现有 state 产生双重真相

## 速答

新 partial `initialData` 会参与缺失区块判断，却只有完整 snapshot 才写入现有 state；hook 因此可能既忽略新数据，又重复补载已成功区块。

## 关键证据

- `src/hooks/useHomeData.ts:55-63` — `initialData` 只在 `useState` 首次初始化时写入 `homeData` / loading。
- `src/hooks/useHomeData.ts:310-320` — 后续 prop 变化按新 snapshot 判 availability，但只有 `isComplete` 时调用 `applyHomeData()`。
- `src/hooks/useHomeData.ts:322-329` — partial snapshot 直接按 incoming 缺失项补载，没有先与当前成功 state 做区块级 reconcile。

## 影响

RSC refresh 传入新的 critical-only snapshot 时，新电影可能不进入 state；已经由客户端加载完成的 TV、综艺和 Bangumi 又会重新请求。快速刷新还可能持续 abort/restart 低优先级加载。

## 修复方向

先定义“incoming 非空区块覆盖、当前成功区块保留”的单一 reconcile 结果，再从该结果派生 state 与缺失加载。

## 建议动作

`cs-refactor`，因为核心问题是同一数据的 state 与 prop 双路径语义不一致；置信度为 medium 是因为仓内未发现主动 `router.refresh()` 调用。
