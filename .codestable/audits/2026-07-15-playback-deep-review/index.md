---
doc_type: audit-index
audit: 2026-07-15-playback-deep-review
scope: 播放页媒体身份、初始化、换源、弹幕、跳过配置、进度保存、播放器生命周期与直接 UI 链路
created: 2026-07-15
status: active
total_findings: 8
---

# playback-deep-review 审计报告

## 范围

本次沿 `/play` 的真实运行链审查：

- `src/app/play/page.tsx`、`hooks/`、`utils/`、`types/`
- `src/components/play/`，以及直接挂载的 `EpisodeSelector.tsx`、`SkipController.tsx`
- `PlaybackDataProvider`、播放记录分页/保存 API 和推荐卡片同路由导航
- 初始化、换集、换源、自动 failover、弹幕/跳过配置、进度落库、Wake Lock 和播放器清理
- 现有测试、2026-06-18 播放性能审计及后续相关提交

## 总评

HLS 缓冲、关闭预取、移除父级 `currentTime` 回灌等历史优化仍有效。本轮对 8 条 finding 完成了定点修复与复核：#1-#6 已解决，#7、#8 保持 open。同路由推荐跳转、后台补源旧快照、换源 hydrate 离页提交、same-URL 换源复用旧播放器、旧初始化晚到、弹幕/跳过配置旧结果覆盖、单进程播放记录乱序和常驻 RAF 均已收口。2026-07-16 再复核发现 #3 的 in-place switch 内部提交仍有 generation 漏口，现已补齐两阶段提交与重叠切换降级重建。

剩余风险主要是策略与更大范围状态所有权问题：新用户弹幕默认策略仍待确认；`page.tsx`、initializer、reducer/state/ref/event 仍未重构成清晰的播放会话边界。播放记录的本轮修复保证当前进程内的 mutation 顺序并拒绝更旧 `save_time`，但多实例部署仍需要存储层 CAS/事务；换源为避免数据丢失不再提前删除旧记录，因此跨源重复继续观看记录仍是明确残余。

当前未发现新的明确安全问题；架构文档仍是骨架，无法以现有文档为依据正式定级 `arch-drift`。

## 发现清单

| #   | 状态     | 性质            | 严重度 | 置信度 | 标题                                   | 文件                           |
| --- | -------- | --------------- | ------ | ------ | -------------------------------------- | ------------------------------ |
| 1   | resolved | bug             | P1     | medium | 同路由推荐跳转不重置媒体状态           | [finding-01.md](finding-01.md) |
| 2   | resolved | bug             | P1     | medium | 后台补源后的 failover 使用旧源快照     | [finding-02.md](finding-02.md) |
| 3   | resolved | bug             | P1     | medium | 播放器旧初始化可晚到覆盖新会话         | [finding-03.md](finding-03.md) |
| 4   | resolved | bug             | P1     | high   | 旧媒体异步结果可覆盖当前弹幕与跳过配置 | [finding-04.md](finding-04.md) |
| 5   | resolved | bug             | P1     | medium | 播放进度乱序写入可回退集数和时间       | [finding-05.md](finding-05.md) |
| 6   | resolved | performance     | P2     | high   | 返回顶部同时常驻 RAF 与 scroll timer   | [finding-06.md](finding-06.md) |
| 7   | open     | performance     | P2     | high   | 弹幕默认策略与旧性能结论反向漂移       | [finding-07.md](finding-07.md) |
| 8   | open     | maintainability | P2     | high   | 播放状态机与历史 refs/timers 并存      | [finding-08.md](finding-08.md) |

## 按维度分布

| 性质            | P0    | P1    | P2    | 合计  |
| --------------- | ----- | ----- | ----- | ----- |
| bug             | 0     | 5     | 0     | 5     |
| security        | 0     | 0     | 0     | 0     |
| performance     | 0     | 0     | 2     | 2     |
| maintainability | 0     | 0     | 1     | 1     |
| arch-drift      | 0     | 0     | 0     | 0     |
| **合计**        | **0** | **5** | **3** | **8** |

## 历史补丁核对

- 2026-06-18 的 HLS 保守调参与 `SkipController` 不再由父级每秒传 `currentTime` 仍然有效。
- “直达源快速开播、后台补其它源”仍在；本轮已修复错误回调读取旧源快照、hydrate 离页提交和失败锁未释放问题。
- “未设置偏好时不自动加载弹幕”的旧审计结论与当前默认 true 的实现不一致，需要重新确认产品策略。
- reducer、ref、timer 和 manager 仍未完整收敛为单一状态所有者；本轮只删除确定性无效路径并补生命周期保护。

## 修复进展

| Finding | 状态     | 本轮结果                                                                                                                                                             |
| ------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #1      | resolved | 推荐卡片改为 document navigation，避免 `/play -> /play` 复用旧媒体级状态。                                                                                           |
| #2      | resolved | 换源读取最新 sources ref，hydrate/验证后才提交；旧 hydrate 在卸载或离开 `/play` 后不能写回，URL 同步 title/poster/douban_id，空集 URL 会失败并释放锁。               |
| #3      | resolved | initializer 增加 generation/cleanup；in-place switch 两阶段提交并等待 episode URL 对齐，重叠切换重建播放器；HLS/timeout 按当前媒体 identity 判定。                   |
| #4      | resolved | 弹幕 manager 在 reset/新 key 时 abort；旧请求、旧集、旧播放器均不能渲染或清空新弹幕；SkipController 配置请求增加 identity/generation 并在换源时立即清旧配置。        |
| #5      | resolved | API 在当前进程内按 username 串行 POST/单条 DELETE/clear-all，并按 `save_time` 拒绝旧写。多实例最终一致性与跨源重复记录不在本轮闭环内。                               |
| #6      | resolved | 返回顶部收敛为 passive scroll 触发、单 RAF 合并；无滚动时不再常驻执行。                                                                                              |
| #7      | open     | 偏好读取与运行时 owner 已收口，显式关闭时不再加载/渲染；仅“无偏好默认 true”是否继续保留仍待产品决策。                                                                |
| #8      | open     | 已删只清不写的 timer refs、SkipController 无效 refs、EpisodeSelector 重复 state/ref，并补多组生命周期测试；大文件职责、重复事件/loading 路径和统一播放状态机仍未拆。 |

## 验证基线

- 已知阶段性结果：播放核心 6 个 suites / 20 个 tests 通过；弹幕、initializer、source switch 组合 5 个 suites / 19 个 tests 通过；playrecords route 4 个 tests 通过；initializer/source switch 锁相关 2 个 suites / 6 个 tests 通过。
- 独立 reviewer 对 same-URL 换源路径复核为 clear，并定向复跑 10 个 tests 通过。
- 选集/跳过分组 3 个 suites / 14 个 tests 通过；返回顶部已补滚动合并与卸载清理测试。
- 当前已补 `usePlayerInitializer`、`useSourceSwitcher`、`useEpisodeDanmuSync`、`RecommendationsSection`、`SkipController` 的跨请求/跨媒体生命周期测试，旧“没有这些测试”的表述已过期。
- 最新门禁：`pnpm exec jest --runInBand` 通过（69 suites / 324 tests），`pnpm typecheck`、`pnpm build`、本轮全部 TS/TSX 文件的 `eslint --max-warnings=0` 与 `git diff --check` 通过；production build 通过本机 SSH tunnel 复用 `136.175.83.3` Redis，构建后已关闭 tunnel。
- 仓库级 `pnpm lint:strict` 仍被 147 条既有 warning 阻断；`pnpm format:check` 仍命中数百个历史未格式化文件。本轮新增测试与 CodeStable 文档已单独通过 Prettier。
- 本地生产包此前已完成登录页与 `/play?...` 认证重定向冒烟；当前仍无可复用的本地登录态，未完成登录后播放器目视验收，核心换集竞态由 initializer 回归测试覆盖。

## 下一步建议

- **仓库基线另行治理**：全仓 ESLint warning 与 Prettier 历史债务不属于本轮首页/播放页修复范围。
- **产品策略确认**：#7 的重复读取和关闭态已修复，只需明确新用户默认是否加载弹幕，并同步修订历史审计口径。
- **分批继续重构**：#8 按 playback session、player lifecycle、source transaction、progress writer 拆小批次，不把多实例 CAS 或跨源记录迁移塞进当前补丁。
