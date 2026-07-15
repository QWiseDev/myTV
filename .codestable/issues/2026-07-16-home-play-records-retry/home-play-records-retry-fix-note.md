---
doc_type: issue-fix
issue: 2026-07-16-home-play-records-retry
path: fast-track
fix_date: 2026-07-16
tags: [home, play-records, pagination, retry, concurrency]
---

# 首页继续观看分页失败与重试修复记录

## 1. 问题描述

继续观看分页请求失败时，客户端数据层会把异常转换成空页。首屏失败因此被当成真实空记录并隐藏整个区块，追加失败则会把 `hasMore` 提交为 `false`，用户无法使用原 cursor 重试。当前已加载记录全部删除后，即使后端仍有下一页，组件也会提前返回，分页入口同样不可达。

## 2. 根因

- `getPlayRecordsPage()` 在远端请求和 localStorage 解析失败后返回 synthetic empty page，调用方无法区分真实空数据与读取失败。
- `usePlaybackRecords` 只有 loading 与 `hasMore`，没有首屏、静默刷新、追加三种错误阶段；cursor 和分页状态只适合成功响应，没有失败恢复契约。
- `ContinueWatching` 用“非 loading 且无当前记录”直接判定真实空态，没有把失败重试和未加载完的下一页纳入渲染条件。
- append 只依赖 React state 防重，同一 render 内的重复调用仍可发出相同 cursor 请求；等价 priority key 数组也会重复调度首屏读取。

## 3. 修复方案

- 数据层继续触发全局错误提示，但重新抛出原异常，不再制造空页。
- Hook 增加 `initial / refresh / append` 错误阶段；失败只更新错误与 loading，保留最后成功的 records、cursor 和 `hasMore`，首屏成功后再清除首屏错误。
- 首次或 priority 刷新失败时提供首屏重试；追加失败继续使用原 cursor；`refresh` 未恢复前阻止 append 覆盖错误。
- 为 append 与用户首屏重试分别增加 Promise ownership，阻止提交前双击产生重复请求；clear-all 同步失效旧请求、锁和错误。
- priority keys 先去重排序形成稳定 signature，相同集合的新数组不再重复拉取，真实集合变化仍立即刷新首屏。
- 继续观看在当前记录删空但 `hasMore=true` 时保留“更多”；首次/刷新失败显示“加载失败/刷新失败 + 重试”，追加失败显示“重试”。

## 4. 改动文件清单

- `src/lib/db.client.ts`
- `src/lib/db.client.play-records-page.test.ts`
- `src/hooks/usePlaybackRecords.ts`
- `src/hooks/usePlaybackRecords.test.ts`
- `src/contexts/PlayPageContext.tsx`
- `src/contexts/PlayPageContext.test.tsx`
- `src/components/HomeClient.tsx`
- `src/components/HomeTabContent.tsx`
- `src/components/HomeTabContent.test.tsx`
- `src/components/ContinueWatching.tsx`
- `src/components/ContinueWatching.test.tsx`

## 5. 验证结果

- 首轮回归先确认现状失败：数据层错误被转为空页、空记录分页入口消失、append/首屏重复请求和等价 priority keys 重拉均被测试复现。
- `pnpm exec jest --runInBand`：70 suites / 337 tests 通过。
- `pnpm typecheck`：通过。
- 修改文件 ESLint、Prettier check 与 `git diff --check`：通过。
- 使用 `127.0.0.1:16379` SSH 隧道连接 `136.175.83.3` Redis，带认证 `PING` 返回 `PONG`，`pnpm build` 通过；未修改 `.env` 或远端 Redis 配置，验证后已关闭隧道。
- 最新生产包浏览器冒烟：真实登录首页可见继续观看与热门电影，收藏夹切换及返回正常，console 无 warning/error；验证后本地服务已关闭。

## 6. 遗留事项

- 浏览器冒烟没有通过故障注入强制展示三种错误卡；错误传播、保留快照、同 cursor 重试和 UI 操作分别由数据层、Hook 与组件回归覆盖。
- 本阶段未调整播放记录全量缓存语义；分页结果仍不会写入依赖完整 map 的 `cacheManager.playRecords`。
