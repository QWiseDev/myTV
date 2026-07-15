---
doc_type: audit-finding
audit: 2026-07-15-playback-deep-review
finding_id: bug-02
nature: bug
severity: P1
confidence: medium
suggested_action: cs-issue
status: resolved
---

# Finding 02：后台补源后的 failover 使用旧源快照

## 速答

快速开播后后台新增的源保存在 ref 中，但播放器错误回调调用的是创建播放器时捕获的 `handleSourceChange`；该函数又从旧数组查目标，可能“找到下一源却切换时报未找到”，并提前删除旧播放记录。

## 关键证据（修复前）

- `src/app/play/hooks/useSourceInitialization.ts:631-635` — 直达源开播后异步补全其它源。
- `src/app/play/hooks/usePlayerInitializer.ts:317-335` — failover 从最新 `availableSourcesRef` 找下一源，却调用闭包中的 `handleSourceChange`。
- `src/app/play/hooks/usePlayerInitializer.ts:1074-1080` — 补源变化不会重装播放器错误回调。
- `src/app/play/hooks/useSourceSwitcher.ts:119-126` — switcher 从闭包中的 `availableSources` 查目标。
- `src/app/play/hooks/useSourceSwitcher.ts:108-117` — 确认新源前先删除旧播放记录。
- `src/app/play/hooks/useSourceSwitcher.ts:185-189` — URL 只更新 source/id/year，未同步新 title/poster/douban_id。

## 影响

当前源失败时自动换源可能报“未找到匹配结果”；即使切换失败，旧进度记录也已经被删除，造成续播数据丢失。

## 修复方向

换源全程读取 `availableSourcesRef`；先 hydrate/验证目标，再原子提交详情、URL 和状态，记录迁移成功或新源就绪后再删除旧 key。

## 修复记录（2026-07-15）

- `useSourceSwitcher` 持有最新 `availableSources` ref，旧播放器错误回调触发 failover 时也从最新源列表解析目标。
- 目标详情先 hydrate，再校验当前集存在非空 URL；只有当前 operation generation 仍有效且页面仍位于 `/play` 时才提交状态。卸载或 hydrate 期间离开播放页后，旧操作不会写回 React 状态或 URL。
- 提交时同步 source/id/title/year/poster/douban_id，并清理 `prefer`；目标源无当前集 URL、最后一个源失败或初始化错误时都会释放换源锁。
- 为避免失败前丢数据，已删除“确认新源前先删除旧记录”的路径。残余是新源成功保存后旧/新 source key 可能同时存在，需后续设计“新源首次保存成功后再迁移/删除旧记录”的安全闭环。
- 已补最新源快照、hydrate 后提交、卸载/离页失效、空 URL 和锁生命周期测试；最终全量 Jest、typecheck 与 build 已通过。

## 建议动作

`cs-issue`，因为这是后台补源与错误恢复组合出的真实状态竞态。
