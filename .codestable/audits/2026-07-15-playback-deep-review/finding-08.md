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

播放页已经引入 reducer 和多个 hooks，但旧 aliases、独立 state、37 个 refs 和多套播放器 loading/事件路径仍并存，没有形成清晰的播放会话边界。

## 关键证据

- `src/app/play/page.tsx` — 1,138 行，包含 37 个 `useRef`、12 个 `useState`、16 个 `useEffect`。
- `src/app/play/hooks/usePlayerInitializer.ts` — 1,220 行，同时承担运行时加载、HLS、UI 增强、错误恢复、failover、弹幕、进度、Wake Lock 和分析事件。
- `src/app/play/page.tsx:186-244` — 明示保留兼容 aliases。
- `src/app/play/page.tsx:1002` 与 `src/app/play/hooks/usePlayerInitializer.ts:382-384`、`626-627`、`707-708`、`746-748`、`948-952`、`1095-1109` — 页面 cleanup、原生 video 事件和 ArtPlayer 事件均会清理 loading/source switch。

## 影响

每次修复都需要跨 reducer、state、ref、timer 和播放器事件推理；新补丁容易继续叠加 stale closure、重复清理和状态互相覆盖。

## 修复方向

先补 player lifecycle/source switch characterization tests，再拆成 playback session、player lifecycle、media metadata、source transaction、progress writer 五个小批次，逐步删除 aliases、write-only refs 和重复 loading/danmu 路径。

## 本轮进展（2026-07-15）

- `page.tsx` 已删除只清理不赋值的 `seekResetTimeoutRef`、`resizeResetTimeoutRef`、`sourceSwitchTimeoutRef` 及其空 cleanup 路径。
- 返回顶部从常驻 RAF + timer 收敛为滚动触发的单 RAF；`SkipController` 删除无效时间 ref/timer；`EpisodeSelector` 删除 attemptedSources 的重复 state/ref 与 write-only videoInfo ref。
- 已新增 initializer、source switch、弹幕同步、推荐导航、选集与 SkipController 的生命周期测试，为后续拆分提供 characterization 基线。
- 2026-07-16：两个 `video:ended` handler 已合并为单一具名事务，并用重复 ended、SkipController、analytics 后失活和最后一集测试锁住原顺序；`usePlayerState` 中零读写的 source/favorite 分支及专属遗留类型已删除，真实 owner 保持不变。
- `page.tsx` 与 `usePlayerInitializer` 仍承担过多职责，reducer/独立 state/aliases 和多套 loading owner 尚未统一。本轮只清理确定性冗余，不宣称完成状态机重构，finding 保持 open。

## 建议动作

`cs-refactor`，因为这是跨多文件的行为等价状态所有权收敛，必须分阶段并人工验证。
