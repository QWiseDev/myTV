---
doc_type: audit-finding
audit: 2026-06-27-home-review
finding_id: maintainability-06
nature: maintainability
severity: P2
confidence: high
suggested_action: cs-refactor
status: resolved
---

# Finding 06：首页复用 PlayPageProvider 暴露播放页历史包袱

## 速答

首页和播放页共用名为 `PlayPageProvider` 的上下文，里面既有首页继续观看需要的数据，也有播放页历史状态；文件内还保留 no-op 调试函数和无实际抽象价值的 helper，维护边界不清晰。

## 关键证据

- `src/components/HomeClient.tsx:172` — 首页 `HomeClient` 包裹 `PlayPageProvider`。
- `src/app/play/page.tsx:1154` — 播放页也包裹同一个 `PlayPageProvider`。
- `src/contexts/PlayPageContext.tsx:19` — `INIT_REF_DEFAULT` 根据 `window` 做三元判断。
- `src/contexts/PlayPageContext.tsx:20` — true 分支是 `{ playRecords: false, watchingUpdates: false }`。
- `src/contexts/PlayPageContext.tsx:22` — false 分支也是同一个形状，判断没有实际意义。
- `src/contexts/PlayPageContext.tsx:24` — 注释说明调试输出已清理。
- `src/contexts/PlayPageContext.tsx:25` — `debugLog` 保留为 no-op。
- `src/contexts/PlayPageContext.tsx:62` — `usePlayPageData` 注释说“接收 props 而不是直接调用 Context”。
- `src/contexts/PlayPageContext.tsx:67` — 实际只把传入 props 原样返回。

## 影响

后续维护首页继续观看时，需要理解一个播放页命名的 Provider；清理或扩展播放页状态时，也容易误伤首页。当前没有直接功能错误，但这是典型历史包袱。

## 修复方向

将“最近播放记录 + 追更缓存”抽成更中性的 `PlaybackDataProvider` 或 hook；删除 no-op 调试函数、无意义环境判断和无实际价值的 helper。

## 处理结果

已将导出的 Provider / hook 改为 `PlaybackDataProvider` / `usePlaybackData`，并删除无意义初始化判断、no-op 调试函数和未使用 helper。

## 建议动作

`cs-refactor`，因为这是行为不变的边界收敛。
