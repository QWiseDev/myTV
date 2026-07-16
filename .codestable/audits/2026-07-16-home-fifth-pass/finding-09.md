---
doc_type: audit-finding
audit: 2026-07-16-home-fifth-pass
finding_id: 'maintainability-09'
nature: maintainability
severity: P2
confidence: high
suggested_action: cs-refactor
status: open
---

# Finding 09：移动操作依赖伪造 MouseEvent 调用业务 handler

## 速答

收藏/删除业务命令与桌面事件阻止逻辑绑在同一个 handler，移动菜单只能伪造一个残缺 `React.MouseEvent` 来复用；后续读取任何新事件字段都会让移动路径静默失真。

## 关键证据

- `src/components/VideoCard.tsx:459-517` — 收藏 mutation handler 的第一步是消费 `React.MouseEvent`，随后才进入持久化与 pending 去重。
- `src/components/VideoCard.tsx:534-565` — 删除记录沿用同一耦合形状。
- `src/hooks/useMobileActions.tsx:12-16` — 移动适配层用类型断言伪造只有 `preventDefault` / `stopPropagation` 的 MouseEvent。
- `src/hooks/useMobileActions.tsx:98-136` — 收藏与删除动作都把该伪事件传回桌面 handler。

## 影响

业务命令的真实输入契约被 React 事件类型掩盖；桌面 handler 一旦读取 `currentTarget`、button、modifier 或 pointer 字段，移动端不会得到类型错误，只会在运行时收到缺失值。

## 修复方向

提取无事件的 `toggleFavorite()` / `deleteRecord()` 命令，桌面点击只负责阻止事件后调用命令，移动菜单直接调用同一命令。

## 建议动作

`cs-refactor`，因为行为无需改变，只需删除跨层伪事件补丁。
