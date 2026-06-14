---
doc_type: audit-finding
audit: 2026-06-08-runtime-bundle-tech-debt
finding_id: maintainability-02
nature: maintainability
severity: P2
confidence: high
suggested_action: cs-refactor
status: open
---

# Finding 02：多个页面/组件超过 1900 行

## 速答

多个前端入口组件承担过多职责，长期维护和行为等价重构成本高。

## 关键证据

- `src/components/SlotMachine.tsx` — `wc -l` 显示 3044 行。
- `src/components/UserMenu.tsx` — `wc -l` 显示 2282 行。
- `src/components/SourceTestModule.tsx` — `wc -l` 显示 2031 行。
- `src/app/search/page.tsx` — `wc -l` 显示 1972 行。
- `src/app/live/page.tsx` — `wc -l` 显示 2324 行。

## 影响

这些文件通常混合数据加载、状态、副作用和 UI，后续修 bug 或调性能时容易扩大改动面。由于 UI 行为复杂，拆分需要独立设计和人工目视验证。

## 修复方向

按模块逐个处理，优先抽纯函数和无副作用展示组件；每轮只拆一个入口，不和性能修复混做。

## 建议动作

`cs-refactor`，因为这是行为等价的结构优化，需要 scan/design/apply 分阶段推进。
