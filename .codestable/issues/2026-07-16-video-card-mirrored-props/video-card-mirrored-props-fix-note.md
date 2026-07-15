---
doc_type: issue-fix
issue: 2026-07-16-video-card-mirrored-props
path: fast-track
fix_date: 2026-07-16
tags: [home, video-card, search, performance, state]
---

# VideoCard 镜像 props 与搜索 imperative 补丁修复记录

## 1. 问题描述

每个 `VideoCard` 都为 `episodes`、`source_names`、`douban_id` 创建本地 state 和同步 effect；流式搜索又维护 `groupRefs/groupStatsRef`，在最新 group props 已经传入卡片后再通过 imperative handle 写入相同数据。首页通常挂载约 48-60 张卡，因此这条只服务搜索聚合的历史补丁会放大为每页约 144-180 个无用 state 与同量同步 effect。

## 2. 根因

搜索聚合结果每次随 `searchResults` 重算，`VirtualSearchGrid` 已从最新 group 计算三个统计字段，并通过 `react-window` 的 `cellProps` 直接传给可见卡片。`VideoCardHandle + useSyncedState` 并不是异步更新的必要通道，只会先用旧镜像 render，再由 effect/ref setter 触发第二次 commit；`groupRefs/groupStatsRef` 还会随搜索 key 累积且从未清理。

## 3. 修复方案

- 删除 `VideoCardHandle`、三份 `useSyncedState`、`useImperativeHandle` 和 dynamic 字段，`episodes/source_names/douban_id` 直接以 props 为单一事实源。
- 搜索页删除 `groupRefs`、`groupStatsRef`、`getGroupRef` 与聚合结果同步 effect。
- `VirtualSearchGrid` 删除对应 ref/cache props 和 render 阶段 map 写入，继续把最新 group stats 直接传给 `VideoCard`。
- 保留 `VideoCard` 现有视觉、收藏、图片 fallback、ActionSheet 与播放 URL 行为。

## 4. 改动文件清单

- `src/components/VideoCard.tsx`
- `src/components/VideoCard.test.tsx`
- `src/components/VirtualSearchGrid.tsx`
- `src/components/VirtualSearchGrid.test.tsx`
- `src/app/search/page.tsx`

## 5. 验证结果

- 修复前新增 Profiler 测试稳定复现：聚合 props 更新产生 2 次 `update` commit。
- 修复后聚合卡只产生 1 次 commit，并同步更新 `12集`、2 个来源与新的豆瓣详情链接。
- `VirtualSearchGrid` 测试确认同一可见 cell 的 group 扩容后，最新 `episodes/source_names/douban_id` 直接到达卡片。
- `rg 'VideoCardHandle|useSyncedState|groupRefs|groupStatsRef|getGroupRef|dynamicEpisodes|dynamicSourceNames|dynamicDoubanId|useImperativeHandle'` 在目标链路零残留。
- 定向 Jest：3 suites / 31 tests 通过；全量 Jest：68 suites / 287 tests 通过。
- 变更文件 ESLint `--max-warnings=0`、`pnpm typecheck`、`git diff --check` 与 `pnpm build` 通过。
- `/search` 构建产物由约 `29.7 kB / 213 kB First Load JS` 降为 `29.4 kB / 212 kB`。
- SSH Redis 隧道下最新生产包：首页 `HTTP 200`、总耗时 `1.161s` 且 SSR 含热门电影；带查询的 `/search` 返回 `HTTP 200`。

## 6. 遗留事项

- `VideoCard` 的普通收藏与搜索收藏仍是两套 state/hook；逐卡 `favoritesUpdated` 底层监听尚未复用。
- 打开过 ActionSheet 的卡片关闭后仍保留隐藏组件 fiber，后续可在 200ms 退场动画结束后真正卸载。
- 顺手发现：虚拟 cell 从搜索卡 A 复用为 B 时，`searchFavorited` 不会按新 `source/id` 重置，A 的迟到查询也可能写入 B；这是独立状态正确性 bug，不在本阶段修改范围。
