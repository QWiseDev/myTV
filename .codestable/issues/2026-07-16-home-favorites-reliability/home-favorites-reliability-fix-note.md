---
doc_type: issue-fix
issue: 2026-07-16-home-favorites-reliability
path: fast-track
fix_date: 2026-07-16
tags: [home, favorites, lifecycle, concurrency, error-state]
---

# 首页收藏夹可靠性修复记录

## 1. 问题描述

收藏 tab 把未加载和加载失败都显示为真实空收藏；基础收藏 payload 还要等待播放记录补全才可见。切换 tab 或卸载后，旧初始读取和补全 worker 可能继续调度工作或覆盖新 generation；较旧的初始 GET 也可能覆盖更晚到达的收藏事件。清空收藏失败时，点击处理器没有消费底层重新抛出的 Promise。

## 2. 根因

- `useFavoriteItems` 只有数组 state，没有独立的 loading/error 状态，并把播放记录补全放在基础收藏展示之前。
- 防抖 timer、pending payload 和 worker 使用跨 effect 的 refs，共享“正在补全”标记；异步边界缺少统一 generation 所有权。
- 初始读取先于事件订阅，且没有 revision 门禁，无法表达“事件 payload 比初始 GET 更新”。
- `FavoritesSection` 的 async 点击处理器直接等待 `clearAllFavorites()`，失败 rejection 没有事件边界所有者。

## 3. 修复方案

- 收藏加载使用 `idle/loading/loaded/error` 四态；基础收藏到达后立即生成卡片，播放记录作为 300ms 防抖的 best-effort 补全。
- 把订阅、timer、pending payload 和 worker 收进单个 effect closure；所有 await 返回后检查 `cancelled`，新 tab generation 与旧未决 worker 相互独立。
- 先订阅 `favoritesUpdated` 再发初始 GET，并用 revision 阻止旧 GET 覆盖新事件；空收藏跳过播放记录读取。
- 加载失败时区分首次错误与 stale 内容错误；清空失败在点击边界消费，只有持久层成功后才清本地列表。
- `getAllFavorites()` 在初始 API 或 localStorage 读取失败时继续抛出，让收藏列表调用方显示真实错误态，不再伪装成 `{}`。

## 4. 改动文件清单

- `src/lib/db.client.ts`
- `src/hooks/useFavoriteItems.ts`
- `src/hooks/useFavoriteItems.test.ts`
- `src/components/HomeClient.tsx`
- `src/components/FavoritesSection.tsx`
- `src/components/FavoritesSection.test.tsx`
- `.codestable/audits/2026-07-16-home-second-pass/index.md`
- `.codestable/audits/2026-07-16-home-second-pass/finding-04.md`
- `.codestable/audits/2026-07-16-home-second-pass/finding-05.md`
- `.codestable/audits/2026-07-16-home-second-pass/finding-08.md`

## 5. 验证结果

- `pnpm exec jest src/hooks/useFavoriteItems.test.ts src/components/FavoritesSection.test.tsx --runInBand`：2 suites / 18 tests 通过。
- `pnpm exec jest --runInBand`：69 suites / 305 tests 通过。
- `pnpm typecheck`：通过。
- 修改文件 ESLint 与 `git diff --check`：通过。
- 构建命令仅把当前进程的 `REDIS_URL` 改写到 `127.0.0.1:16379` SSH 隧道；带认证 Redis `PING` 返回 `PONG`，`pnpm build` 无 Redis 配置/连接错误并通过。

## 6. 遗留事项

- 收藏卡的播放记录补全仍只由收藏变化触发；若后续要求收藏 tab 常驻时实时反映播放进度，应单独定义 `playRecordsUpdated` 的刷新频率与成本边界。
- 本阶段未调整远端 Redis 公网暴露，也未修改本地 `.env`。
