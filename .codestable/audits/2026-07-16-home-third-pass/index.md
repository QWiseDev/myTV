---
doc_type: audit-index
audit: 2026-07-16-home-third-pass
scope: 首页数据刷新、收藏操作、加载占位、卡片图片与共享缓存边界
created: 2026-07-16
status: active
total_findings: 11
---

# 首页第三轮审计报告

## 范围

扫描首页入口、`useHomeData` / 播放记录 / 收藏 / 追更 hooks、首页横滑区块、`VideoCard` / `MobileActionSheet`、首页聚合缓存及对应 API。逐条与 `2026-07-15-home-deep-review`、`2026-07-16-home-second-pass` 及已完成 issue 去重。

## 总评

旧首页审计已关闭项未发现回退。本轮共确认 11 条：5 条 P1、6 条 P2；其中 6 条 bug、3 条 performance、2 条 maintainability。初始四条 P1 之外，修复复核又确认主 cron 可能覆盖或复活用户播放记录，已作为 #11 纳入同阶段闭环。未发现新的首页安全问题；`.codestable/architecture/ARCHITECTURE.md` 仍为骨架，因此不产 `arch-drift` finding。

## 发现清单

| # | 性质 | 严重度 | 置信度 | 标题 | 文件 |
|---|---|---|---|---|---|
| 1 | bug | P1 | high | 追更刷新在两种存储模式下都可能长期陈旧 | [finding-01.md](finding-01.md) |
| 2 | bug | P1 | high | 清空收藏失败仍可能把页面清成空态 | [finding-02.md](finding-02.md) |
| 3 | bug | P1 | high | 加载骨架被动画容器包成纵向单列 | [finding-03.md](finding-03.md) |
| 4 | bug | P1 | high | 封面 fallback 耗尽后显示坏图并在菜单重复失败 | [finding-04.md](finding-04.md) |
| 5 | bug | P2 | high | 热门区块失败被伪装成真实空数据 | [finding-05.md](finding-05.md) |
| 6 | performance | P2 | high | 完整聚合缓存退出正常首页成功链路 | [finding-06.md](finding-06.md) |
| 7 | performance | P2 | high | 客户端分项超时不取消底层请求 | [finding-07.md](finding-07.md) |
| 8 | performance | P2 | high | 动画 wrapper 的 index key 让排序重挂卡片 | [finding-08.md](finding-08.md) |
| 9 | performance | P2 | high | 数据库模式前台切换会高频读取追更 API | [finding-09.md](finding-09.md) |
| 10 | maintainability | P2 | high | 首页数据上下文与追更模块保留无消费者补丁路径 | [finding-10.md](finding-10.md) |
| 11 | bug | P1 | high | 主 cron 可能覆盖或复活用户播放记录 | [finding-11.md](finding-11.md) |

## 按维度分布

| 性质 | P0 | P1 | P2 | 合计 |
|---|---|---|---|---|
| bug | 0 | 5 | 1 | 6 |
| security | 0 | 0 | 0 | 0 |
| performance | 0 | 0 | 3 | 3 |
| maintainability | 0 | 0 | 2 | 2 |
| arch-drift | 0 | 0 | 0 | 0 |
| **合计** | **0** | **5** | **6** | **11** |

## 修复进展

- **#1 resolved**：统一 storage-aware 检查；播放记录 mutation 同步失效服务端与客户端追更缓存；invalidated 事件跨 tab 排队强制重算；服务端 rebuild 统一由 generation + singleflight 保护。
- **#2 resolved**：收藏 DELETE 成功后才发布空缓存；DELETE 与补偿 GET 同时失败时仍保留旧缓存和 UI。
- **#3 resolved**：loading 时关闭卡片动画；真实 `ScrollableRow → SkeletonRow` 组合验证骨架直接展开为横向卡片。
- **#4 resolved**：普通外图和豆瓣代理链统一以 `/logo.svg` 收尾；操作菜单复用卡片当前 fallback 图片。
- **#11 resolved**：API 与 cron 共用播放记录 mutation 服务；cron 只在记录仍存在且 `save_time` 未变化时更新详情派生字段，避免覆盖进度或删除后复活。

## 下一步建议

- **P1 已完成**：#1、#2、#3、#4、#11 均已修复并通过全量测试、类型检查、production build 与浏览器冒烟。
- **P2 后续处理**：#5 需要新增 section 级错误/重试契约；#6 需要在“恢复聚合预热”和“删除冗余聚合层”之间先定边界。
- **P2 可定点收口**：#7 请求取消、#8 稳定 key、#9 轮询间隔、#10 死路径清理均可分别走小范围回归。

## 范围外线索

- 播放页首批播放记录失败后仍缺少显式重试，留给播放页专项。
- `/api/cron` matcher 与 route 鉴权边界需要独立安全审查，本轮未触发线上 cron。
- `MobileActionSheet` 矮屏滚动边界、partial `initialData` 合并语义与分页 `includeKeys` 重复页属于后续专项，不为凑数扩入本轮。
