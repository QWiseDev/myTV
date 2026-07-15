---
doc_type: audit-finding
audit: 2026-07-15-playback-deep-review
finding_id: maintainability-08
nature: maintainability
severity: P2
confidence: high
suggested_action: cs-refactor
status: open
---

# Finding 08：播放状态机与历史 refs/timers 并存

## 速答

播放页已经引入 reducer 和多个 hooks，但旧 aliases、独立 state、44 个 refs、重复 timer/事件和未使用 reducer 分支仍并存，没有形成单一状态所有者。

## 关键证据

- `src/app/play/page.tsx` — 1,156 行，包含 44 个 `useRef`、15 个 `useState`、18 个 `useEffect`。
- `src/app/play/hooks/usePlayerInitializer.ts` — 1,081 行，同时承担运行时加载、HLS、UI 增强、错误恢复、failover、弹幕、进度、Wake Lock 和分析事件。
- `src/app/play/page.tsx:186-244` — 明示保留兼容 aliases。
- `src/app/play/hooks/usePlayerState.ts:37-43`、`61-65`、`276-305`、`355-365` — sources/favorite reducer 分支未被页面采用，页面另有 `availableSources` 与 `useFavorite`。
- `src/app/play/page.tsx:377-381`、`612-614` — `seekResetTimeoutRef`、`resizeResetTimeoutRef`、`sourceSwitchTimeoutRef` 只有清理，没有赋值。
- `src/app/play/hooks/usePlayerInitializer.ts:815-818`、`993-1015` — 同一播放器注册两次 `video:ended`。
- `src/app/play/page.tsx:1022-1049` 与 initializer 原生/ArtPlayer 事件 — 三套路径共同清理 video loading。

## 影响

每次修复都需要跨 reducer、state、ref、timer 和播放器事件推理；新补丁容易继续叠加 stale closure、重复清理和状态互相覆盖。

## 修复方向

先补 player lifecycle/source switch characterization tests，再拆成 playback session、player lifecycle、media metadata、source transaction、progress writer 五个小批次，逐步删除 aliases、write-only refs 和重复 loading/danmu 路径。

## 本轮进展（2026-07-15）

- `page.tsx` 已删除只清理不赋值的 `seekResetTimeoutRef`、`resizeResetTimeoutRef`、`sourceSwitchTimeoutRef` 及其空 cleanup 路径。
- 返回顶部从常驻 RAF + timer 收敛为滚动触发的单 RAF；`SkipController` 删除无效时间 ref/timer；`EpisodeSelector` 删除 attemptedSources 的重复 state/ref 与 write-only videoInfo ref。
- 已新增 initializer、source switch、弹幕同步、推荐导航、选集与 SkipController 的生命周期测试，为后续拆分提供 characterization 基线。
- `page.tsx` 与 `usePlayerInitializer` 仍承担过多职责，reducer/独立 state/aliases、重复 `video:ended` 和多套 loading 清理路径尚未统一。本轮只清理确定性冗余与修复行为，不宣称完成状态机重构，finding 保持 open。

## 建议动作

`cs-refactor`，因为这是跨多文件的行为等价状态所有权收敛，必须分阶段并人工验证。
