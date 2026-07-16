---
doc_type: refactor-apply-notes
refactor: 2026-07-16-version-panel-cleanup
---

# version panel cleanup apply notes

## 步骤 1：固化当前本地版本行为

- 完成时间：2026-07-16
- 改动文件：`src/components/VersionPanel.test.tsx`、`src/components/user-menu/UserMenuPanels.test.tsx`
- 验证结果：旧实现上定向 Jest 2 suites / 9 tests 通过；覆盖本地版本、changelog、无远程内容、关闭、滚动恢复和绿色状态点。
- 偏离：无。

## 步骤 2：收口 VersionPanel 为本地 changelog 面板

- 完成时间：2026-07-16
- 改动文件：`src/components/VersionPanel.tsx`、`src/components/VersionPanel.test.tsx`
- 验证结果：删除远程状态、空 effect、fetch/parser 与恒假 JSX；`VersionPanel` 定向 Jest 2 tests、目标 ESLint、`pnpm typecheck` 通过。
- 偏离：无；固定绿色状态卡及文案原样保留。

## 步骤 3：移除 UserMenu 版本检查状态与废弃模块

- 完成时间：2026-07-16
- 改动文件：`src/components/UserMenu.tsx`、`src/components/UserMenu.test.tsx`、`src/components/user-menu/UserMenuDropdownPanel.tsx`、`src/components/user-menu/UserMenuPanels.test.tsx`、`src/lib/version_check.ts`
- 验证结果：移除挂载异步检查、2 个状态和 2 个 props；顶部提醒只保留追更未读；绿色点改为固定渲染；删除零引用模块。定向 Jest 3 suites / 23 tests、目标 ESLint、`pnpm typecheck` 通过，相关版本检查符号全仓零残留。
- 偏离：无。

## 步骤 4：完整回归与页面复验

- 完成时间：2026-07-16
- 改动文件：无新增运行时代码改动。
- 验证结果：
  - 全量 Jest：88 suites / 508 tests 通过。
  - `pnpm typecheck`、`pnpm build`、目标 ESLint、目标 Prettier、`git diff --check` 通过。
  - 全仓 `lint:strict` 仍被既有 145 条 warning 阻断，本阶段目标文件 0 warning。
  - SSH 隧道 Redis `PING=PONG`；未修改 Redis、防火墙或 `.env`，未开放公网 6379。
  - 浏览器首页真实数据正常；菜单版本绿点保留；版本面板只显示本地 changelog，打开锁定滚动、关闭恢复；console 0 warning / 0 error。
- 偏离：`pnpm build` 收集页面数据时因 tracked `.env` 仍指向公网地址而记录 Redis `ECONNREFUSED`，但最终退出码为 0；真实页面验证使用进程级 `REDIS_URL` 隧道覆盖。
