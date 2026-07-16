---
doc_type: audit-finding
audit: 2026-07-16-home-fifth-pass
finding_id: 'maintainability-10'
nature: maintainability
severity: P2
confidence: high
suggested_action: cs-refactor
status: open
---

# Finding 10：首页初载与重试保留两套 section 编排

## 速答

同一四区块加载语义分别由 `loadSingleSection()` 和 effect 内的 `loadFallbackBatches()` 实现，结果类型又被折成联合类型后强制映射；多轮补丁让 timeout、错误和 abort 规则需要在多处同步。

## 关键证据

- `src/hooks/useHomeData.ts:30-48` — section/data 对应关系被压成 `HomeData[keyof HomeData]` 与两个独立 map，类型无法证明 `section` 和 `result.data` 配对正确。
- `src/hooks/useHomeData.ts:102-158` — 重试路径通过 `loadSingleSection()` 分派并用动态 key + cast 提交结果。
- `src/hooks/useHomeData.ts:244-329` — 初载路径再次手写 tertiary、critical、TV、综艺的加载、fallback error 和 apply 逻辑。
- `src/lib/home-data-client.ts:51-64` — 通用 patch 最终仍依赖 `Object.fromEntries` 与 `as HomeData` 断言。

## 影响

修改某一区块的 loader、timeout、error 或取消语义时，需要同步重试分派、初载批次、section map 和 cast；遗漏会形成只有某条入口触发的行为漂移。当前 384 行 Hook 的主要复杂度来自这套双编排。

## 修复方向

建立 typed section descriptor，让初载和重试共用同一“开始 → 加载 → 提交”原语；批次层只决定并发/idle 顺序，不再复制区块实现。

## 建议动作

`cs-refactor`，因为目标是行为等价地收口多轮补丁和类型断言。
