---
doc_type: audit-index
audit: 2026-07-16-home-fifth-pass
scope: 首页刷新可靠性、收藏与播放记录并发、横滑交互、首屏调度及多轮补丁冗余
created: 2026-07-16
status: superseded
total_findings: 10
supersedes: 2026-07-16-home-fourth-pass
superseded-by: 2026-07-16-home-sixth-pass
---

# 首页第五轮审计报告

## 范围

沿首页当前生产链路定向扫描：

- `src/app/page.tsx`、`src/lib/home-data.*`、`src/hooks/useHomeData.ts`
- `HomeClient`、`ContinueWatching`、`FavoritesSection`、`ScrollableRow`、`VideoCard` 与移动操作适配层
- 播放记录、收藏、追更 hooks、客户端数据层和对应 API route
- 上述路径的现有测试，以及 2026-07-15 至 2026-07-16 前四轮首页审计

本轮逐条排除前四轮已关闭的 StrictMode 初载、partial snapshot、priority/cursor 会话、移动 ActionSheet、卡片主入口键盘语义、追更 tab 重放等 finding，只记录当前代码仍可独立触发的新问题。

## 总评

共确认 10 条：4 条 P1、6 条 P2；其中 5 条 bug、3 条 performance、2 条 maintainability。最高风险集中在追更失败被误记为成功、收藏清空的持久化并发、播放记录乐观状态与分页门禁分裂，以及横滑覆盖层的键盘/命中边界。性能与结构问题主要来自 SSR 空结果语义、追更首次调度串行耦合、不可见动画和首页 section 双编排。

未发现新的安全问题；`.codestable/architecture/ARCHITECTURE.md` 仍是骨架，因此不产 `arch-drift` finding。

## 发现清单

| #   | 性质            | 严重度 | 置信度 | 标题                                         | 文件                           |
| --- | --------------- | ------ | ------ | -------------------------------------------- | ------------------------------ |
| 1   | bug             | P1     | high   | 追更接口失败被当作成功并触发 30 分钟节流     | [finding-01.md](finding-01.md) |
| 2   | bug             | P1     | high   | 收藏清空缺少原子与用户级串行边界             | [finding-02.md](finding-02.md) |
| 3   | bug             | P1     | high   | 播放记录乐观状态可被分页响应和旧回滚覆盖     | [finding-03.md](finding-03.md) |
| 4   | bug             | P1     | high   | 横滑覆盖层制造不可见焦点与无效点击区         | [finding-04.md](finding-04.md) |
| 5   | bug             | P2     | high   | 收藏首次加载失败没有原地重试入口             | [finding-05.md](finding-05.md) |
| 6   | performance     | P2     | medium | SSR critical 空结果与失败触发重复拉取        | [finding-06.md](finding-06.md) |
| 7   | performance     | P2     | medium | 不可见卡片 shimmer 仍持续运行                | [finding-07.md](finding-07.md) |
| 8   | performance     | P2     | medium | 追更首次调度被 TV 与综艺请求串行阻塞         | [finding-08.md](finding-08.md) |
| 9   | maintainability | P2     | high   | 移动操作依赖伪造 MouseEvent 调用业务 handler | [finding-09.md](finding-09.md) |
| 10  | maintainability | P2     | high   | 首页初载与重试保留两套 section 编排          | [finding-10.md](finding-10.md) |

## 按维度分布

| 性质            | P0    | P1    | P2    | 合计   |
| --------------- | ----- | ----- | ----- | ------ |
| bug             | 0     | 4     | 1     | 5      |
| security        | 0     | 0     | 0     | 0      |
| performance     | 0     | 0     | 3     | 3      |
| maintainability | 0     | 0     | 2     | 2      |
| arch-drift      | 0     | 0     | 0     | 0      |
| **合计**        | **0** | **4** | **6** | **10** |

## 下一步建议

- **P1 待处理**：#2 收藏清空持久化边界仍涉及共享写入 contract，需单独确认方案。
- **P2 待确认**：#6 需要新增 SSR critical 初始状态 contract，区分成功空结果、可重试失败与未请求。
- **结构收口**：#9、#10 已完成行为等价重构；不再保留移动伪事件和双 section 编排。
- **本阶段已完成**：#1 追更失败语义、#4 横滑覆盖层交互、#5 收藏原地重试、#7 卡片动画门禁、#8 追更调度解耦、#9 移动业务命令解耦、#10 section 编排统一。

## 修复进展

- **#1 resolved**：server mode 失败重新向上传播，hook 不再误记成功时间；真实 Redis 模式成功/失败回归已补齐。
- **#3 resolved**：单删/清空在持久化前建立可撤销 barrier，priority intent、分页响应与 rollback 使用 generation/revision 收口；客户端缓存读取、mutation queue、用户切换和服务端 ignored 回源均已补并发回归。
- **#4 resolved**：横滑按钮具名且键盘聚焦可见，断点变化会重测；继续观看角标不再拦截播放命中。
- **#5 resolved**：收藏首次/刷新失败均可原地重试，重复点击去重并保留 stale content。
- **#7 resolved**：卡片 shimmer 默认暂停，仅在 hover/focus 且允许 motion 时运行；reduced-motion 不创建动画。
- **#8 resolved**：追更 idle task 在 StrictMode 门禁后立即创建，不再等待 TV/综艺 fallback 完成，并保留卸载取消。
- **#9 resolved**：收藏/删除业务命令不再依赖 React 事件，移动菜单删除伪事件适配并与桌面入口共享 mutation 去重。
- **#10 resolved**：初载、retry 与 tertiary idle 共用唯一 section 执行器，section/result 类型映射不再依赖动态 data cast。
- **当前验证**：全量 87 suites / 499 tests、目标 ESLint、Prettier、typecheck、`git diff --check` 与 production build 通过；SSH 隧道 Redis `PING=PONG`。真实浏览器首页渲染 12 条继续观看记录，用户菜单可正常打开，console 0 error / 0 warning；未执行真实删除或清空。
