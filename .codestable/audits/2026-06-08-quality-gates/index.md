---
doc_type: audit-index
audit: 2026-06-08-quality-gates
scope: 质量门禁、lint 阻断项与 Jest 缓存扫描
created: 2026-06-08
status: resolved
total_findings: 2
---

# quality-gates 审计报告

## 范围

本轮审计限定在直接影响验证命令稳定性的文件：

- `jest.config.js`
- `src/hooks/useMobileActions.tsx`
- `src/lib/access-log-db.ts`
- `src/lib/bangumi.client.ts`
- `src/lib/douban-anti-crawler.ts`
- `src/lib/slot-machine-utils.ts`

## 总评

共发现 2 条 P1 级质量门禁债务：Jest 会扫描 `.next` 产物导致缓存/包名冲突风险；若干运行路径里存在 ESLint quiet 阻断项。修复目标不是清空所有 warning，而是先恢复 `eslint --quiet`、类型检查和测试的可信基线。

## 发现清单

| # | 性质 | 严重度 | 置信度 | 标题 | 文件 |
|---|---|---|---|---|---|
| 1 | maintainability | P1 | high | Jest 扫描 `.next` 产物，验证结果受构建产物干扰 | [finding-01.md](finding-01.md) |
| 2 | maintainability | P1 | high | ESLint quiet 存在阻断项，影响后续重构验证 | [finding-02.md](finding-02.md) |

## 按维度分布

| 性质 | P0 | P1 | P2 | 合计 |
|---|---:|---:|---:|---:|
| bug | 0 | 0 | 0 | 0 |
| security | 0 | 0 | 0 | 0 |
| performance | 0 | 0 | 0 | 0 |
| maintainability | 0 | 2 | 0 | 2 |
| arch-drift | 0 | 0 | 0 | 0 |
| **合计** | **0** | **2** | **0** | **2** |

## 验证计划

1. 修复 Jest 产物扫描 -> verify: `pnpm exec jest --runInBand`。
2. 修复 ESLint quiet 阻断项 -> verify: `pnpm exec eslint src --quiet`。
3. 确认未破坏类型 -> verify: `pnpm typecheck`。

## 处理结果

已完成修复；验证结果记录在提交前终端输出。
