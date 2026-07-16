---
doc_type: audit-finding
audit: 2026-07-16-home-sixth-pass
finding_id: 'maintainability-10'
nature: maintainability
severity: P2
confidence: high
suggested_action: cs-refactor
status: open
---

# Finding 10：远程版本功能永久禁用但整套补丁仍保留

## 速答

VersionPanel 和 version_check 都在入口处永久禁用远程请求，却继续保留状态、解析器、比较器、不可达分支和全局 eslint disable。

## 关键证据

- src/components/VersionPanel.tsx:1-42、72-182 — 远程状态固定为空/false，effect 不执行请求，fetch 入口立即 return，但解析器仍完整保留。
- src/components/VersionPanel.tsx:333-529 — hasUpdate 为常量 false，却保留约 190 行远程更新 UI；面板固定宣称“当前为最新版本”。
- src/lib/version_check.ts:14-46 — URL 数组为空，checkForUpdates 立即返回 NO_UPDATE，原网络逻辑整块注释保留。
- src/components/UserMenu.tsx:126-180、406-409 — 每次挂载仍执行无网络价值的异步版本检查并维护状态。

## 影响

约 700 行版本相关代码大部分不可达，维护者需要同时理解本地 changelog、假远程状态和注释掉的旧实现；固定“最新版本”文案也把“未检查”误表述为“已确认无更新”。

## 修复方向

以本地 CURRENT_VERSION + changelog 为唯一现状，删除远程状态、不可达 UI、空检查 effect 和注释旧实现；版本卡只陈述“当前版本”。

## 建议动作

cs-refactor，因为行为事实已经是本地静态版本面板，当前任务是删除历史补丁并简化结构。
