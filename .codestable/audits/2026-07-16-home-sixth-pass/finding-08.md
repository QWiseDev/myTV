---
doc_type: audit-finding
audit: 2026-07-16-home-sixth-pass
finding_id: 'performance-08'
nature: performance
severity: P2
confidence: medium
suggested_action: cs-refactor
status: open
---

# Finding 08：收藏 tab 可见时首页低优先级加载仍继续

## 速答

HomeTabContent 会在收藏 tab 下卸载，但 useHomeData 始终挂在 HomeClient；已启动的 TV、综艺和 tertiary idle 加载不会因 tab 隐藏而暂停。

## 关键证据

- src/components/HomeClient.tsx:77-93、167-185 — useHomeData 位于 tab 条件渲染之外，只有首页展示树被卸载。
- src/hooks/useHomeData.ts:307-343 — fallback 请求与 tertiary idle 调度不检查 activeTab。
- src/hooks/useHomeData.ts:371-386 — 只有主 effect cleanup 才 abort；activeTab 不直接参与该 effect 依赖。

## 影响

用户进入首页后立即切到收藏夹，隐藏的首页仍会完成缺失分区请求、缓存写入和 Hook state 更新，继续消耗网络与上游配额。

## 修复方向

先确认收藏 tab 期间是否有意预取首页；若没有，让 hidden 状态取消或暂停低优先级加载，并在回到首页时按缺失 section 恢复。

## 建议动作

cs-refactor，因为是否预取是产品取舍；确认后再做生命周期收口。
