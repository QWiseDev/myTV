---
doc_type: issue-fix
issue: 2026-07-16-video-card-action-rejections
path: fast-track
fix_date: 2026-07-16
tags: [home, video-card, favorites, play-records, promise, error-boundary]
---

# VideoCard 操作 Promise 泄漏修复记录

## 1. 问题描述

`VideoCard` 添加/取消收藏或删除播放记录失败时，会在底层错误提示与缓存回滚之后再次抛出新的 Error。桌面 SVG 点击和移动操作菜单都不会消费 React 事件处理器返回的 Promise，因此失败会形成 `unhandledrejection`。

## 2. 根因

- `handleToggleFavorite()` 与 `handleDeleteRecord()` catch 后重新抛错，且新 Error 丢失原始 cause。
- 桌面端把 async handler 直接交给 `onClick`；React 不等待或捕获返回 Promise。
- `useMobileActions` 把两个 async 入参声明成返回 `void`，wrapper 调用后丢弃返回值，TypeScript 无法提示所有权缺失。
- `MobileActionSheet` 另有一份重复 action 类型，声明允许 `Promise<void>`，但通用点击边界同样没有 await/catch；重复契约已发生漂移。

## 3. 修复方案

- 把两个 `VideoCard` handler 作为终端 UI 事件边界：失败后由此消费 rejection，不再二次包装和抛错；底层 `db.client` 或上层 `onDelete` 继续负责全局提示与回滚。
- `useMobileActions` 明确要求收藏/删除 handler 返回 `Promise<void>`，移动 action 用显式 `void` 触发已经自行消费错误的 handler。
- 删除 `MobileActionSheet` 内重复的 `ActionItem`，直接复用 `MobileAction`；菜单 action 收口为同步触发契约，不再虚假声明可返回未处理 Promise。
- 新增桌面添加收藏、取消收藏、直接删除、自定义 `onDelete` 和移动收藏五条失败回归。

## 4. 改动文件清单

- `src/components/VideoCard.tsx`
- `src/components/VideoCard.test.tsx`
- `src/hooks/useMobileActions.tsx`
- `src/components/MobileActionSheet.tsx`

## 5. 验证结果

- 回归先在旧实现稳定失败，三条初始用例分别捕获“切换收藏状态失败”和“删除播放记录失败”的未处理 rejection。
- `pnpm exec jest src/components/VideoCard.test.tsx --runInBand`：1 suite / 20 tests 通过。
- `pnpm exec jest --runInBand`：70 suites / 342 tests 通过。
- `pnpm typecheck`：通过。
- 四个目标文件 ESLint、非既有格式漂移文件的 Prettier check、`git diff --check`：通过。
- 使用 `127.0.0.1:16379` SSH 隧道连接 `136.175.83.3` Redis，`pnpm build` 通过；未修改 `.env` 或远端 Redis 配置，构建后已关闭隧道。
- 最新生产包浏览器冒烟：首页继续观看正常渲染，卡片操作菜单可打开且包含收藏/删除 action，console 无 warning/error；验证后本地服务已关闭。

## 6. 遗留事项

- `VideoCard.tsx` 在本阶段开始前就存在整文件 Prettier 漂移；直接格式化会产生 500+ 行纯缩进 diff，本次未混入。若后续拆分该大组件，可在独立 refactor 提交中统一格式化。
- 浏览器冒烟未人为制造持久层失败；五条 rejection 回归覆盖真实桌面/移动事件边界，正常交互由浏览器验证。
