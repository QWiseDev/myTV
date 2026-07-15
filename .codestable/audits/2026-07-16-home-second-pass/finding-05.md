---
doc_type: audit-finding
audit: 2026-07-16-home-second-pass
finding_id: bug-05
nature: bug
severity: P2
confidence: high
suggested_action: cs-issue
status: open
---

# Finding 05：收藏补全任务可越过 tab 与组件生命周期

## 速答

收藏读取和播放记录补全在 await 返回后缺少统一 generation/mounted 门禁，cleanup 后仍可能新建 timer、读取数据或尝试写 state。

## 关键证据

- `src/hooks/useFavoriteItems.ts:74-83` — `getAllFavorites()` 返回后先调用 `updateFavoriteItems()`，之后才检查 `cancelled`。
- `src/hooks/useFavoriteItems.ts:31-38` — `getAllPlayRecords()` 返回后没有检查当前 tab、effect generation 或组件是否仍挂载，直接 `setFavoriteItems()`。
- `src/hooks/useFavoriteItems.ts:97-110` — cleanup 只能清理当时已存在的订阅、timer 和 pending payload，无法阻止较晚 await 重新调度工作。

## 影响

切回首页或离开页面后仍可能发起全量播放记录读取；组件卸载后还可能运行无意义状态更新，快速切 tab 时也可能让旧 generation 覆盖新一轮加载。

## 修复方向

让初始读取、防抖补全和订阅事件共享同一 effect generation，并在每个异步边界后验证所有权。

## 建议动作

`cs-issue`，因为这是明确的异步生命周期竞态。
