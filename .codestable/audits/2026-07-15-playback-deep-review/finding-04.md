---
doc_type: audit-finding
audit: 2026-07-15-playback-deep-review
finding_id: bug-04
nature: bug
severity: P1
confidence: high
suggested_action: cs-issue
status: resolved
---

# Finding 04：旧媒体异步结果可覆盖当前弹幕与跳过配置

## 速答

弹幕 manager 的 reset 只丢引用不 abort，`SkipController` 的配置请求也没有 request identity；快速换集/换源时旧结果可晚到写入当前媒体。

## 关键证据（修复前）

- `src/app/play/utils/danmakuRuntime.ts:151-153` — `reset()` 只把 `inFlight` 设为 null。
- `src/app/play/utils/danmakuRuntime.ts:176-186` — 新 key 直接替换 in-flight 引用。
- `src/app/play/utils/danmakuRuntime.ts:204-218` — AbortController 只存在于局部请求，manager 无法在 reset 时 abort。
- `src/app/play/utils/danmakuRuntime.ts:268-275` — 请求完成后无当前 key 校验即渲染。
- `src/app/play/hooks/useEpisodeDanmuSync.ts:88-113` — cleanup 只能取消尚未启动的 timer，不能取消已发请求。
- `src/components/SkipController.tsx:332-340`、`794-797` — `getSkipConfig()` 完成后无条件 `setSkipConfig()`。

## 影响

慢请求期间切换媒体，旧集弹幕可能覆盖当前集；旧跳过配置可能在新视频上按错误时间自动跳片头/片尾。

## 修复方向

manager 持有并 abort 上一个 controller；弹幕渲染和 skip config setState 前都比较当前 request key/generation。

## 修复记录（2026-07-15）

- `DanmakuLoadManager` 现在持有 controller/token；reset 或新 request key 会 abort 旧请求，旧 promise 的 finally 不能清掉新请求状态。
- AbortError 不再被 controller 层吞成空数组；旧集、旧播放器和旧 generation 的结果不会渲染、报错或清空新弹幕，旧请求也不能提前清除新请求 loading。
- `SkipController` 用 source/id identity 与 request generation 管理配置；换源立即让旧配置失效，旧请求晚到不能覆盖当前 source。
- 同轮修复还校正 absolute 片尾 start/end round-trip，并在关闭重开设置面板时恢复当前已保存配置。
- 已补 reset/new-key abort、旧集弹幕、loading 所有权、旧 skip 请求、换源清旧配置和设置 round-trip 测试；最终全量 Jest、typecheck 与 build 已通过。

## 建议动作

`cs-issue`，因为这是高置信度的跨请求错误写回。
