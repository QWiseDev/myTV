---
doc_type: audit-finding
audit: 2026-06-27-home-review
finding_id: bug-05
nature: bug
severity: P2
confidence: medium
suggested_action: cs-issue
status: resolved
---

# Finding 05：播放数据 Provider 的定时任务缺少卸载清理

## 速答

首页复用的 `PlayPageProvider` 内部有防抖刷新定时器和初始化延迟任务，但 effect 没有返回 cleanup；用户快速切页时可能在组件卸载后继续执行加载与状态更新。

## 关键证据

- `src/contexts/PlayPageContext.tsx:90` — `refreshTimeoutRef` 保存刷新防抖定时器。
- `src/contexts/PlayPageContext.tsx:153` — `refreshPlayRecords` 会清理上一轮 timer。
- `src/contexts/PlayPageContext.tsx:158` — 随后创建新的 500ms timer。
- `src/contexts/PlayPageContext.tsx:163` — timer 触发后会调用 `loadPlayRecords()`。
- `src/contexts/PlayPageContext.tsx:165` — timer 触发后还会调用 `loadWatchingUpdates(true)`。
- `src/contexts/PlayPageContext.tsx:179` — 初始化加载的 effect 开始。
- `src/contexts/PlayPageContext.tsx:187` — 支持 `requestIdleCallback` 时安排 `loadPlayRecords()`。
- `src/contexts/PlayPageContext.tsx:190` — fallback 分支用 `setTimeout(() => loadPlayRecords(), 200)`。
- `src/contexts/PlayPageContext.tsx:192` — 初始化 effect 没有返回 cleanup。

## 影响

常规使用影响有限；在首页、播放页快速切换或组件卸载时，定时任务仍可能执行，造成无意义请求和卸载后状态更新风险。

## 修复方向

为初始化 effect 和刷新 timer 增加 cleanup，或统一改用已有 `scheduleIdleTask` 封装返回取消函数。

## 处理结果

已改用 `scheduleIdleTask()` 安排初始化加载，并在 effect cleanup 中取消 idle 任务和刷新防抖 timer。

## 建议动作

`cs-issue`，因为这是生命周期缺口，修复范围小且可回归验证。
