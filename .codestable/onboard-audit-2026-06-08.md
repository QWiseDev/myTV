# CodeStable 接入审计报告

> 项目：myTV / KLMTV
> 日期：2026-06-08
> 结论：当前仓库存在多批零散 Markdown 文档，因此走迁移路径。本次只创建 CodeStable 骨架和映射报告，不移动、不删除、不重命名现有文档。

## 1. 扫描结论

- `.codestable/`：接入前不存在，本次新建。
- 旧版 `codestable/` / `easysdd/`：未发现。
- 已发现现有文档：根目录 README / 优化总结，`docs/` 下模块与重构文档，`.serena/memories/` 与 `.trae/documents/` 下外部代理记录，以及局部模块 README。
- 三方依赖文档：`venv_convert/lib/python3.13/site-packages/.../LICENSE.md` 属于虚拟环境依赖许可证，不建议纳入 CodeStable。

## 2. 迁移映射建议

| 现有文件 | 推测内容类型 | 建议归入 CodeStable | 置信度 | 本次处理 |
|---|---|---|---|---|
| `README.md` | 项目说明、部署与使用入口 | 保留为对外 README；后续可抽取稳定系统信息到 `.codestable/architecture/ARCHITECTURE.md` | 高 | 保留原位 |
| `README_EN.md` | 英文项目说明 | 保留为对外 README；不纳入 CodeStable 主线 | 高 | 保留原位 |
| `AGENTS.md` | 当前仓库协作规则 | 保留原位；CodeStable 子技能仍以 `.codestable/attention.md` 为项目注意事项入口 | 高 | 保留原位 |
| `CLAUDE.md` | 其他代理协作规则 | 保留原位；如有仍适用的硬约束，后续用 `cs-note` 追加到 `.codestable/attention.md` | 中 | 保留原位，待确认 |
| `OPTIMIZATION_SUMMARY.md` | 历史优化总结 | 可作为一次历史优化沉淀，候选 `.codestable/compound/` | 中 | 保留原位，待确认 |
| `test-bet-limit.md` | 局部测试或问题记录 | 候选 `.codestable/issues/` 或保留为临时说明 | 低 | 保留原位，待确认 |
| `docs/deep-optimization-plan-2026-06-07.md` | 深度优化计划 | 候选 `.codestable/compound/` 或后续 refactor 记录 | 中 | 保留原位，待确认 |
| `docs/REFACTOR_COMPLETE.md` | 重构完成记录 | 候选 `.codestable/compound/` | 中 | 保留原位，待确认 |
| `docs/REFACTOR_PROGRESS.md` | 重构进度记录 | 候选 `.codestable/compound/` | 中 | 保留原位，待确认 |
| `docs/refactor-summary.md` | 重构总结 | 候选 `.codestable/compound/` | 中 | 保留原位，待确认 |
| `docs/jsx-refactor-example.md` | 重构示例 / 技巧 | 候选 `.codestable/compound/` | 中 | 保留原位，待确认 |
| `docs/play-page-refactor-plan.md` | 播放页重构计划 | 候选 `.codestable/compound/` 或未来 refactor 档案 | 中 | 保留原位，待确认 |
| `docs/play-module-optimization-plan.md` | 播放模块优化计划 | 候选 `.codestable/compound/` 或未来 refactor 档案 | 中 | 保留原位，待确认 |
| `docs/play-module-optimization-summary.md` | 播放模块优化总结 | 候选 `.codestable/compound/` | 中 | 保留原位，待确认 |
| `docs/play-module-optimization-2024-11.md` | 播放模块历史优化记录 | 候选 `.codestable/compound/` | 中 | 保留原位，待确认 |
| `docs/play-page-optimization-summary.md` | 播放页优化总结 | 候选 `.codestable/compound/` | 中 | 保留原位，待确认 |
| `docs/play-optimization-commit-checklist.md` | 播放优化提交检查表 | 候选 `.codestable/compound/` 或保留为 docs 检查表 | 中 | 保留原位，待确认 |
| `docs/initPlayer-optimization-status.md` | 播放初始化优化状态 | 候选 `.codestable/compound/` | 中 | 保留原位，待确认 |
| `docs/danmaku-migration-guide.md` | 弹幕迁移指南 | 候选 `docs/` 用户/开发指南；也可抽取架构信息 | 中 | 保留原位，待确认 |
| `docs/danmaku-quick-start.md` | 弹幕快速开始 | 保留为指南类文档，暂不纳入 CodeStable | 中 | 保留原位，待确认 |
| `docs/danmaku-refactor-plan.md` | 弹幕重构计划 | 候选 `.codestable/compound/` 或未来 refactor 档案 | 中 | 保留原位，待确认 |
| `docs/danmaku-refactor-summary.md` | 弹幕重构总结 | 候选 `.codestable/compound/` | 中 | 保留原位，待确认 |
| `docs/advanced-analytics-integration.md` | 高级分析集成说明 | 候选 `.codestable/features/` 或 `docs/` 指南 | 中 | 保留原位，待确认 |
| `docs/analytics-integration-guide.md` | 分析集成指南 | 候选 `docs/` 指南；可抽取需求到 `.codestable/requirements/` | 中 | 保留原位，待确认 |
| `docs/cache-configuration.md` | 缓存配置说明 | 候选 `.codestable/architecture/` 约束或 `docs/` 运维指南 | 中 | 保留原位，待确认 |
| `docs/slot-machine-backend.md` | Slot machine 后端说明 | 候选 `.codestable/architecture/` 或 `.codestable/features/` | 中 | 保留原位，待确认 |
| `src/lib/supabase/README.md` | Supabase 局部模块说明 | 保留在模块目录；可抽取持久化架构信息到 `.codestable/architecture/` | 高 | 保留原位 |
| `.serena/memories/*.md` | Serena 代理记忆 | 外部代理记忆，不建议直接迁入 CodeStable；有价值结论可人工挑选后用 `cs-learn` / `cs-note` 沉淀 | 高 | 保留原位 |
| `.trae/documents/*.md` | Trae 计划文档 | 外部代理计划，语义需人工确认 | 低 | 保留原位，待确认 |

## 3. 已新建 / 刷新的 CodeStable 骨架

- `.codestable/attention.md`
- `.codestable/architecture/ARCHITECTURE.md`
- `.codestable/requirements/.gitkeep`
- `.codestable/roadmap/.gitkeep`
- `.codestable/features/.gitkeep`
- `.codestable/issues/.gitkeep`
- `.codestable/compound/.gitkeep`
- `.codestable/tools/`：从 `cs-onboard/tools/` 整目录复制
- `.codestable/reference/`：从 `cs-onboard/reference/` 整目录复制

## 4. 后续建议

1. 先确认是否要把历史优化 / 重构类文档迁入 `.codestable/compound/`。
2. 若项目有每次启动都必须知道的命令、路径禁区、凭证规则，用 `cs-note` 逐条追加到 `.codestable/attention.md`。
3. 等架构现状需要固化时，用 `cs-arch update` 补充 `.codestable/architecture/ARCHITECTURE.md`，不要在 onboard 阶段凭空代填。
