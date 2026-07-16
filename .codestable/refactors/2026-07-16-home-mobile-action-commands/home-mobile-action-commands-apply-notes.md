---
doc_type: refactor-apply-notes
refactor: 2026-07-16-home-mobile-action-commands
---

# home mobile action commands apply notes

## 步骤 1：固化跨入口 mutation 行为

- 完成时间：2026-07-16
- 改动文件：`src/components/VideoCard.test.tsx`
- 验证结果：新增跨桌面/移动 pending 收藏去重和移动自定义删除两条测试；旧实现定向 Jest 34/34 通过。
- 偏离：无。

## 步骤 2：提取无事件业务命令

- 完成时间：2026-07-16
- 改动文件：`src/components/VideoCard.tsx`
- 验证结果：收藏与删除 mutation 主体改为无事件 callback，桌面 wrapper 保留 `preventDefault` / `stopPropagation`；定向 Jest 34/34 通过。
- 偏离：无。

## 步骤 3：删除移动端伪事件适配

- 完成时间：2026-07-16
- 改动文件：`src/hooks/useMobileActions.tsx`
- 验证结果：移动收藏/删除直接调用业务命令；`createMobileActionEvent` 和事件型参数签名零引用，目标 ESLint 通过。
- 偏离：无。

## 步骤 4：完整回归

- 完成时间：2026-07-16
- 改动文件：审计 finding/index 与本 refactor 记录。
- 验证结果：
  - 重构前后 `VideoCard.test.tsx` 均为 34/34 通过。
  - 全量 Jest：82 suites / 424 tests 通过。
  - 目标 ESLint、`pnpm typecheck` 与 `pnpm build` 通过。
  - checklist YAML 校验通过；旧 helper/事件签名零引用。
  - build 期间 `.env` 直连 `136.175.83.3:6379` 仍打印 `ECONNREFUSED`，最终退出码为 0。
- 偏离：`VideoCard.tsx` 与测试保留历史 Prettier 漂移，本次不运行整文件 `prettier --write`，避免带入无关机械格式化。
