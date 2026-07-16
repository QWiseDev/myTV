---
doc_type: audit-finding
audit: 2026-07-16-home-fourth-pass
finding_id: 'bug-01'
nature: bug
severity: P1
confidence: high
suggested_action: cs-issue
status: resolved
---

# Finding 01：StrictMode 取消播放记录唯一一次初载

## 速答

`usePlaybackRecords` 在 StrictMode 首轮 cleanup 中取消 idle task，但第二轮 setup 因 signature 已记录而直接返回，导致播放记录永久保持 loading。

## 关键证据

- `src/hooks/usePlaybackRecords.ts:206-220` — effect 在调度前先写入 `lastPriorityKeySignatureRef`，相同 signature 随后命中 `if (!isInitialLoad) return`。
- `src/hooks/usePlaybackRecords.ts:222-234` — 首轮 setup 的唯一 idle task 会在 StrictMode cleanup 中被 `cancelLoad()` 取消。
- `src/hooks/usePlaybackRecords.test.ts:715` — 现有卸载测试只覆盖普通 cleanup，没有 StrictMode setup-cleanup-setup 时序。

## 影响

开发环境以及采用 Strict Effects 的运行边界中，首页“继续观看”可能一直显示加载态，`getPlayRecordsPage()` 一次也不会执行。

## 修复方向

让相同 signature 的 StrictMode 第二次 setup 能重新保留一个 live idle task，同时保持真实 priority 变化立即刷新。

## 处理进展（2026-07-16）

- 新增 StrictMode setup-cleanup-setup 回归，旧实现稳定复现 `getPlayRecordsPage()` 为 0 次。
- 删除阻断同 signature 第二次 setup 的 early return；真实 priority 变化仍走立即刷新，普通等价 signature 不新增请求。
- 定向 Jest 19 tests、全量 Jest 79 suites / 383 tests、typecheck、目标 ESLint、Prettier 与 `git diff --check` 通过。
- SSH 隧道下 Redis `PING=PONG`，production build 无连接错误并通过；浏览器首页继续观看渲染 12 张记录卡，console 0 warning / 0 error。

## 建议动作

`cs-issue`，因为这是可稳定复现的 effect 生命周期 bug。
