---
doc_type: audit-index
audit: 2026-07-16-home-sixth-pass
scope: 首页收藏一致性、用户菜单状态与模态交互、卡片触摸、动画和历史补丁冗余
created: 2026-07-16
status: active
total_findings: 11
supersedes: 2026-07-16-home-fifth-pass
---

# 首页第六轮审计报告

## 范围

沿首页当前生产链路继续定向扫描：

- HomeClient、HomeTabContent、ContinueWatching、FavoritesSection、ScrollableRow、VideoCard
- useHomeData、useLongPress、用户菜单数据 Hook 与全部用户菜单弹层
- db.client 收藏缓存/写入链路、favorites API、收藏领域类型
- VersionPanel、version_check 与前五轮首页审计、对应测试

本轮逐条排除了已关闭的播放记录 mutation、横滑覆盖层、卡片 shimmer 门禁、收藏重试和用户菜单拆分 finding；只保留当前代码仍可独立触发的新问题或旧 finding 中未真正关闭的残留。

## 总评

共确认 11 条：4 条 P1、7 条 P2；其中 5 条 bug、3 条 performance、3 条 maintainability。最高风险集中在收藏客户端缺少统一 revision/rollback、收藏卡初始状态误判、多指触摸误播放，以及用户菜单模态框缺少完整键盘语义。性能和历史包袱主要来自共享收藏请求的重复副作用、未遵循 reduced-motion、隐藏 tab 继续加载，以及永久禁用但仍保留的远程版本分支。

未发现新的安全问题；.codestable/architecture/ARCHITECTURE.md 仍是骨架，因此不产 arch-drift finding。

## 发现清单

| #   | 性质            | 严重度 | 置信度 | 标题                                     | 文件                           |
| --- | --------------- | ------ | ------ | ---------------------------------------- | ------------------------------ |
| 1   | bug             | P1     | high   | 收藏客户端缺少统一新鲜度与失败回滚协议   | [finding-01.md](finding-01.md) |
| 2   | bug             | P1     | high   | 收藏页卡片初始被误判为未收藏             | [finding-02.md](finding-02.md) |
| 3   | bug             | P1     | high   | 多指触摸可提前结束长按并误触播放         | [finding-03.md](finding-03.md) |
| 4   | bug             | P1     | high   | 用户菜单模态框缺少 dialog 与焦点生命周期 | [finding-04.md](finding-04.md) |
| 5   | bug             | P2     | high   | 追更事件更新数据但不重算未读状态         | [finding-05.md](finding-05.md) |
| 6   | performance     | P2     | high   | 共享收藏请求仍为每张卡重复执行完成副作用 | [finding-06.md](finding-06.md) |
| 7   | performance     | P2     | high   | reduced-motion 未覆盖续播脉冲与平滑滚动  | [finding-07.md](finding-07.md) |
| 8   | performance     | P2     | medium | 收藏 tab 可见时首页低优先级加载仍继续    | [finding-08.md](finding-08.md) |
| 9   | maintainability | P2     | high   | 收藏领域保留三份已经漂移的类型定义       | [finding-09.md](finding-09.md) |
| 10  | maintainability | P2     | high   | 远程版本功能永久禁用但整套补丁仍保留     | [finding-10.md](finding-10.md) |
| 11  | maintainability | P2     | high   | VideoCard 同时保留覆盖链接与根节点导航   | [finding-11.md](finding-11.md) |

## 按维度分布

| 性质            | P0    | P1    | P2    | 合计   |
| --------------- | ----- | ----- | ----- | ------ |
| bug             | 0     | 4     | 1     | 5      |
| security        | 0     | 0     | 0     | 0      |
| performance     | 0     | 0     | 3     | 3      |
| maintainability | 0     | 0     | 3     | 3      |
| arch-drift      | 0     | 0     | 0     | 0      |
| **合计**        | **0** | **4** | **7** | **11** |

## 延续中的已知事项

- 第五轮 [finding-02](../2026-07-16-home-fifth-pass/finding-02.md)：收藏服务端清空的原子与用户级串行边界仍需单独确认共享写入 contract。
- 第五轮 [finding-06](../2026-07-16-home-fifth-pass/finding-06.md)：SSR critical 成功空结果与失败语义仍需产品侧确认自动重试 contract。
- 首页/收藏 tab 往返会重建 HomeTabContent 并丢失横滑位置；是否保活首页 DOM 或显式恢复 scrollLeft，需要先确认 tab 浏览上下文产品预期，本轮不静默定案。

## 下一步建议

- **P1 优先修**：#1 收藏客户端一致性协议；#4 用户菜单模态语义。
- **P2 可直接收口**：#6 共享请求副作用；#7 reduced-motion。
- **P2 重构阶段**：#9 收藏类型统一；#10 删除永久禁用的版本补丁；#11 收口 VideoCard 单一导航所有权。
- **需先确认**：#8 收藏 tab 下是否继续预取首页数据，以及上面的两个延续事项。

## 修复进展

- **#2 resolved**：收藏来源卡片以已收藏为首帧状态，延迟 isFavorited 仍可同步真实结果。
- **#3 resolved**：长按手势记录活动 touch identifier，并在手势期间用临时 document capture guard 捕获页面任意位置的第二触点；取消后持续压制合成 click，下一次确认的单指手势会清理外部末指结束留下的抑制状态。
- **#5 resolved**：正常 watching-updates 事件复用唯一 snapshot + unread 计算；只有事件 payload 有新集、snapshot 晚于 lastViewed 且超过一分钟抑制窗口时才重新显示未读。
- **当前验证**：定向 3 suites / 59 tests、全量 87 suites / 506 tests、typecheck、目标 ESLint、production build 与 git diff 检查通过。全仓 lint:strict 仍被既有 145 条 warning 阻断。
- **真实浏览器**：首页 12 条继续观看、收藏空态和用户菜单均正常，console 0 error / 0 warning；未执行收藏、删除或清空写操作。
