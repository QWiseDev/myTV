---
doc_type: audit-index
audit: 2026-07-16-home-fourth-pass
scope: 首页播放记录、移动卡片操作、分区数据合并与追更调度边界
created: 2026-07-16
status: active
total_findings: 7
supersedes: 2026-07-16-home-third-pass
---

# 首页第四轮审计报告

## 范围

扫描 `usePlaybackRecords`、`VideoCard`、`MobileActionSheet`、`useLongPress`、`useHomeData`、`useWatchingUpdatesRefresh` 与播放记录分页 helper。逐条与前三轮首页审计及已关闭 finding 去重；本轮只记录仍可由当前代码触发的新问题。

## 总评

本轮共确认 7 条：4 条 P1、3 条 P2；其中 5 条 bug、1 条 performance、1 条 maintainability。最高优先级集中在 StrictMode 初载、移动操作面板的矮屏/焦点边界、卡片键盘语义和动作生命周期。未发现新的安全问题；架构文档仍是骨架，因此不产 `arch-drift` finding。

## 发现清单

| #   | 性质            | 严重度 | 置信度 | 标题                                          | 文件                           |
| --- | --------------- | ------ | ------ | --------------------------------------------- | ------------------------------ |
| 1   | bug             | P1     | high   | StrictMode 取消播放记录唯一一次初载           | [finding-01.md](finding-01.md) |
| 2   | bug             | P1     | high   | 移动操作面板在矮屏下存在不可达内容            | [finding-02.md](finding-02.md) |
| 3   | bug             | P1     | high   | 卡片与图标操作缺少键盘语义                    | [finding-03.md](finding-03.md) |
| 4   | bug             | P1     | high   | 移动操作关闭期与长按缺少生命周期门禁          | [finding-04.md](finding-04.md) |
| 5   | maintainability | P2     | medium | partial initialData 与现有 state 产生双重真相 | [finding-05.md](finding-05.md) |
| 6   | bug             | P2     | high   | 收藏夹可消费唯一一次常规追更检查              | [finding-06.md](finding-06.md) |
| 7   | performance     | P2     | high   | priority 项与 cursor 分页状态未隔离           | [finding-07.md](finding-07.md) |

## 按维度分布

| 性质            | P0    | P1    | P2    | 合计  |
| --------------- | ----- | ----- | ----- | ----- |
| bug             | 0     | 4     | 1     | 5     |
| security        | 0     | 0     | 0     | 0     |
| performance     | 0     | 0     | 1     | 1     |
| maintainability | 0     | 0     | 1     | 1     |
| arch-drift      | 0     | 0     | 0     | 0     |
| **合计**        | **0** | **4** | **3** | **7** |

## 下一步建议

- **P1 已完成**：#1—#4 均已 resolved，并通过全量、production build 与浏览器门禁。
- **P2 下一阶段修**：#5—#7 分别收口区块级 state reconcile、tab 返回调度和分页会话语义。

## 审计关系

`2026-07-16-home-third-pass` 的 11 条 finding 已全部 resolved；本审计接替后续首页深审，不重新打开旧 finding。
