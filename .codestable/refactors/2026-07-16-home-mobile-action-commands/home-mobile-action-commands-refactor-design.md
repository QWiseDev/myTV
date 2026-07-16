---
doc_type: refactor-design
refactor: 2026-07-16-home-mobile-action-commands
status: approved
scope: VideoCard 收藏/删除业务命令与桌面/移动交互适配解耦
summary: 删除移动端伪 MouseEvent，让桌面和移动入口复用无事件业务命令
---

# home mobile action commands refactor design

## 1. 本次范围

- 执行 scan #1。
- 保留收藏与删除的 mutation 去重、错误消费、状态更新、ActionSheet 关闭和播放命中行为。
- 不改 `MobileAction`、`VideoCardProps`、数据库客户端或 API contract。
- 总风险：低；内部回调签名变化，有组件测试和 TypeScript 覆盖全部调用点。

## 2. 前置依赖

- 先补桌面与移动入口共享 pending 收藏、移动自定义删除两条刻画测试。
- 在旧实现上确认 `VideoCard.test.tsx` 34/34 通过，作为行为等价基线。
- 搜索确认 `UseMobileActionsParams` 未导出，`useMobileActions` 只有 `VideoCard` 调用。

## 3. 执行顺序

### 步骤 1：固化跨入口 mutation 行为

- 引用方法：M-L1-04 Characterization Test
- 具体操作：覆盖桌面 pending 收藏后移动入口重复触发仍只写一次，以及移动删除优先调用 `onDelete` 且不播放。
- 退出信号：旧实现定向 Jest 34/34 通过。
- 验证责任：AI 自证。
- 回滚：删除新增测试。

### 步骤 2：提取无事件业务命令

- 引用方法：M-L2-01 Extract Function
- 具体操作：把收藏/删除 mutation 主体改为无参数 callback；桌面 click wrapper 保留事件阻止逻辑并转调命令。
- 退出信号：桌面收藏、删除、pending 去重和失败消费测试不变。
- 验证责任：AI 自证。
- 回滚：把事件参数和阻止逻辑合回原 handler。

### 步骤 3：删除移动端伪事件适配

- 引用方法：M-L2-01 Extract Function
- 具体操作：把移动 action 参数改成无事件 callback，直接调用命令，删除 `createMobileActionEvent`。
- 退出信号：移动收藏/删除测试通过，旧 helper 与事件型参数签名零引用。
- 验证责任：AI 自证。
- 回滚：恢复移动适配 helper 和旧参数签名。

### 步骤 4：完整回归

- 引用方法：M-L1-04 Characterization Test
- 具体操作：运行目标 Jest/ESLint、typecheck、全量 Jest、build、Prettier 和 diff check。
- 退出信号：质量门禁通过且变更仅限本 refactor 代码、测试与记录。
- 验证责任：AI 自证。
- 回滚：整体 revert 本次独立提交。

## 4. 风险与看点

- 桌面 wrapper 必须继续阻止事件冒泡，否则操作按钮会触发卡片播放。
- 移动 action 继续用 `void` 消费 Promise；业务命令内部维持现有错误边界。
- 不抽象两个短桌面 wrapper，避免为两次事件阻止引入新的通用 helper。
