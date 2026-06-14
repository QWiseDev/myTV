---
doc_type: audit-finding
audit: 2026-06-08-quality-gates
finding_id: maintainability-02
nature: maintainability
severity: P1
confidence: high
suggested_action: cs-issue
status: resolved
---

# Finding 02：ESLint quiet 存在阻断项

## 速答

若 `pnpm exec eslint src --quiet` 不能稳定通过，后续每个功能点的重构验证都会被旧噪音污染。

## 关键证据

- `src/hooks/useMobileActions.tsx` 存在空函数 no-op。
- `src/lib/bangumi.client.ts` 存在空函数 no-op。
- `src/lib/access-log-db.ts` 的 `switch case` 中存在词法声明作用域问题。
- `src/lib/douban-anti-crawler.ts` 使用无限 `while (true)`。
- `src/lib/slot-machine-utils.ts` 存在可推断默认参数类型注解。

## 影响

这些问题会阻断 quiet 级 lint，导致后续无法区分新改动引入的问题和历史问题。

## 修复方向

只修阻断项：显式 `undefined` no-op、补 `case` 块作用域、改清晰的无条件 `for` 循环、移除可推断默认参数类型。

## 建议动作

`cs-issue`，因为这是验证门禁修复。

## 处理结果

已完成定向修复，未尝试清空全仓库 warning。
