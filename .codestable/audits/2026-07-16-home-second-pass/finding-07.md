---
doc_type: audit-finding
audit: 2026-07-16-home-second-pass
finding_id: bug-07
nature: bug
severity: P2
confidence: medium
suggested_action: cs-issue
status: open
---

# Finding 07：新 initialData 不会同步到现有首页 state

## 速答

`initialData` 只在 Hook 初次挂载时写入 state；`router.refresh()` 等 RSC 合并若保留客户端组件实例，新服务端数据不会替换旧首页内容。

## 关键证据

- `src/hooks/useHomeData.ts:45-50` — `homeData/loading` 仅在 `useState` initializer 消费 `initialData`。
- `src/hooks/useHomeData.ts:183-190` — effect 虽依赖新 prop，但新 snapshot 完整时直接 return，不调用 `applyHomeData()`。
- `src/hooks/useHomeData.ts:192-210` — 新 snapshot 部分完整时只用来决定缺失请求，已有区块也没有同步进 state。
- `src/hooks/useHomeData.test.ts` — 当前没有 rerender 新 `initialData` 的回归用例。

## 影响

同一路由 refresh 后可能继续显示旧热门内容与旧 loading 状态。仓内暂未找到主动调用 `router.refresh()` 的首页入口，因此实际触发频率未确认。

## 修复方向

先补 prop rerender characterization test，再定义新 SSR snapshot 与客户端已加载数据的合并规则。

## 建议动作

`cs-issue`，因为 prop 已变化但可见 state 不更新；触发频率未证实，所以置信度为 medium。
