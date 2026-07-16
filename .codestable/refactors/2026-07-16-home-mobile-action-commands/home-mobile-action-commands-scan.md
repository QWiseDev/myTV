---
doc_type: refactor-scan
refactor: 2026-07-16-home-mobile-action-commands
status: user-reviewed
scope: VideoCard 收藏/删除命令、移动操作适配层及组件回归测试
summary: 1 条结构优化，低风险 1 条
---

# home mobile action commands scan

## 总览

- 扫描范围：`src/components/VideoCard.tsx`、`src/hooks/useMobileActions.tsx`、`src/components/VideoCard.test.tsx`。
- 发现 1 条优化点：结构 1 / 性能 0 / 可读性 0。
- 按风险：低 1 / 中 0 / 高 0。
- 建议先做：#1，把业务命令从 React 事件适配中分离。
- 建议慎做 / 后做：不扩到 `MobileActionSheet`、持久层接口或 `VideoCardProps`。
- 前置检查：目标路径已有收藏、删除、移动 ActionSheet 和 pending 去重测试；范围 3 文件且不涉及公开 contract、生成代码或风格项。该条来自第五轮审计已确认 finding，不是开放式扫描，因此不因候选少于 3 条继续扩项。
- 用户放行依据：会话要求去掉多次优化形成的冗余与复杂补丁，并在每阶段提交后继续处理首页。

## 条目

### #1 分离业务命令与桌面事件适配 ✓

- **位置**：`src/components/VideoCard.tsx:459-565`、`src/hooks/useMobileActions.tsx:12-136`
- **分类**：结构
- **现状**：收藏和删除业务 handler 都接收 `React.MouseEvent`，仅先调用 `preventDefault` / `stopPropagation`；移动端 3 个动作通过一次类型断言伪造残缺事件再调用它们。
- **问题**：2 个业务命令被 React 事件签名污染，移动层维护 1 个不完整事件对象和 3 个伪事件调用点；以后读取新事件字段时类型系统无法保护移动路径。
- **建议**：提取无事件参数的 `toggleFavorite()` / `deleteRecord()`，桌面 wrapper 只阻止事件后调用命令，移动层直接调用命令并删除伪事件 helper。
- **建议映射的方法**：M-L2-01 Extract Function
- **风险**：低；mutation、pending map、错误消费和持久层参数均留在原组件，只有内部回调签名变化。
- **验证**：AI 自证（重构前后 `VideoCard.test.tsx`、目标 ESLint、typecheck、全量 Jest、build、旧 helper 零引用）。
- **范围**：约 35 行 / 3 文件。
