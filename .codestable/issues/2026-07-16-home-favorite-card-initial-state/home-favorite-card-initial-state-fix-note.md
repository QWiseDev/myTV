---
doc_type: issue-fix
issue: 2026-07-16-home-favorite-card-initial-state
path: fast-track
fix_date: 2026-07-16
tags: [home, favorite, video-card, initial-state]
---

# 首页收藏卡首帧状态修复记录

## 1. 问题描述

收藏 tab 的卡片在延迟收藏查询完成前显示“添加收藏”，立即操作会再次保存已有收藏。

## 2. 根因

useVideoCardFavoriteStatus 的 state 初值固定为 false，没有使用 from='favorite' 这一条已经确定的页面事实；收藏查询又被 idle/400ms 延迟调度。

## 3. 修复方案

source-backed 的 favorite 卡片首帧初始化为已收藏，保留既有 isFavorited 延迟同步和 revision 门禁，让外部删除或缓存变化仍可把状态更新为未收藏。

## 4. 改动文件清单

- src/components/VideoCard.tsx
- src/components/VideoCard.test.tsx
- .codestable/audits/2026-07-16-home-sixth-pass/finding-02.md
- .codestable/audits/2026-07-16-home-sixth-pass/index.md

## 5. 验证结果

- 新增回归在旧实现稳定失败：首帧只能查询到“收藏”按钮。
- 修复后 VideoCard 35/35、合并定向 3 suites / 59 tests、全量 87 suites / 506 tests 通过。
- typecheck、目标 ESLint、production build 与 git diff 检查通过。
- 浏览器 Redis 实例当前收藏为空，未进行真实写入；首页/收藏 tab 往返和用户菜单冒烟正常，console 0 error / 0 warning。

## 6. 遗留事项

收藏全局 revision、mutation queue 与失败 rollback 属于第六轮 finding-01，下一阶段单独处理。
