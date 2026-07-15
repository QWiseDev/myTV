---
doc_type: audit-finding
audit: 2026-07-15-playback-deep-review
finding_id: bug-03
nature: bug
severity: P1
confidence: medium
suggested_action: cs-issue
status: resolved
---

# Finding 03：播放器旧初始化可晚到覆盖新会话

## 速答

播放器初始化 effect 会异步加载三个运行时并创建/切换播放器，但没有 cleanup、request ID 或 generation；快速换集/换源时旧 run 仍可继续执行。

## 关键证据（修复前）

- `src/app/play/hooks/usePlayerInitializer.ts:252` — 初始化 effect 启动。
- `src/app/play/hooks/usePlayerInitializer.ts:1057-1073` — 异步加载 Artplayer、HLS runtime 和 hls.js 后执行初始化。
- `src/app/play/hooks/usePlayerInitializer.ts:1074-1080` — effect 没有返回 cleanup，也没有失效标识。
- `src/app/play/hooks/usePlayerInitializer.ts:164-170` — `latestParamsRef` 不会使已启动 run 捕获的 `videoUrl/loading/currentEpisodeIndex` 自动失效。

## 影响

首次模块加载或媒体切换未完成时连续操作，旧 run 可能晚到调用 `cleanupPlayer()`、创建旧 URL 播放器或覆盖新会话的 loading/error。

## 修复方向

增加单调 generation；每次 effect cleanup 使旧 run 失效，并在每个 await 后检查当前 generation，必要时销毁刚创建的旧实例。

## 修复记录（2026-07-15）

- initializer effect 增加单调 generation；cleanup 与后续媒体初始化会失效旧 run，各异步 runtime import、switch/rebuild 和错误路径在提交前校验 generation。
- 已经提交的播放器实例事件不再绑定 effect generation，而是校验 player identity，避免换集复用播放器后事件全部失效。
- effect identity 增加 source/id；即使目标源 URL 与当前 URL 相同，换源也会重新运行 initializer，并在 source identity 变化时重建旧播放器，避免复用旧 source/id 闭包。
- 独立 reviewer 已复核 same-URL 路径为 clear，并定向复跑 10 个 tests 通过；最终全量 Jest、typecheck 与 build 已通过。

## 补充修复记录（2026-07-16）

- 第二轮复核发现 `switchPlayerMedia()` 在 `await switchUrl()` 后、initializer generation 校验前直接写 title/poster/currentTime；快速连续换集仍可由旧 Promise 晚到覆盖新 metadata。
- media switch 改为两阶段：工具函数只等待 URL 切换并返回待提交结果，initializer 同时确认 generation、active player 和 promise identity 后才应用 metadata/time。
- 普通单次换集继续复用播放器；若同一实例已有未决 switch，新 generation 会销毁旧实例并为最新媒体重建，避免对 opaque `switchUrl()` 发起并发操作。
- `switchPromiseRef` 现在只表示真实未决任务，成功、失败和失效路径均按 identity 清理。
- 两阶段选集状态先校验当前 `detail/index` 对应 URL；`episodeIndex` 已更新但 `videoUrl` 仍旧的过渡 render 不启动 switch，空集地址也不会误播上一集。
- 复用播放器后的 HLS fatal callback 与加载超时不再绑定创建时 generation；HLS 同时校验 media session、HLS instance 和 active player video，超时按当前媒体重新计时并读取最新参数。
- 新增重叠换集降级重建、旧 Promise 不提交/不清新 ownership、正常快路径、两阶段换集/换源、旧新 HLS session 和当前媒体超时回归；定向 Jest 2 suites / 16 tests、全量 Jest 69 suites / 317 tests、typecheck、目标 ESLint 与 production build 通过。

## 建议动作

`cs-issue`，因为这是播放器核心生命周期竞态。
