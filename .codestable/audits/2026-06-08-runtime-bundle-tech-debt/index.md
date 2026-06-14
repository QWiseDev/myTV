---
doc_type: audit-index
audit: 2026-06-08-runtime-bundle-tech-debt
scope: 播放/直播/源检测运行时包体、超长组件与当前高风险改动文件
created: 2026-06-08
status: partially-resolved
total_findings: 3
---

# runtime-bundle-tech-debt 审计报告

## 范围

本轮审计限定在用户要求的深度调优方向中最可能影响体验和稳定性的路径：

- `src/app/play/page.tsx`
- `src/app/play/hooks/usePlayerInitializer.ts`
- `src/app/live/page.tsx`
- `src/components/SourceTestModule.tsx`
- `src/app/play/utils/hlsStreamInfo.ts`
- 当前工作树内已发生优化改动的 `src/hooks/`、`src/lib/` 文件

不做全仓库盲扫；`SlotMachine`、`UserMenu`、`search/page` 只记录为后续专项，不在本轮直接重构。

## 总评

共发现 3 条主要技术债：1 条 P1 性能债、2 条 P2 可维护性债。最值得本轮立刻解决的是 `/source-test` 仍把 `hls.js` 带进首屏包体，因为它和前序 `/play`、`/live` 的优化目标一致，且可通过 `pnpm build` 和 build manifest 直接验证。超长组件拆分风险较高，需要独立 refactor 设计和人工目视验证，本轮不混入。

## 发现清单

| # | 性质 | 严重度 | 置信度 | 标题 | 文件 |
|---|---|---|---|---|---|
| 1 | performance | P1 | high | `/source-test` 顶层加载 HLS 运行时，首屏包体过重 | [finding-01.md](finding-01.md) |
| 2 | maintainability | P2 | high | 多个页面/组件超过 1900 行，职责过多 | [finding-02.md](finding-02.md) |
| 3 | maintainability | P2 | medium | HLS 流信息工具为事件常量静态依赖 `hls.js` | [finding-03.md](finding-03.md) |

## 按维度分布

| 性质 | P0 | P1 | P2 | 合计 |
|---|---:|---:|---:|---:|
| bug | 0 | 0 | 0 | 0 |
| security | 0 | 0 | 0 | 0 |
| performance | 0 | 1 | 0 | 1 |
| maintainability | 0 | 0 | 2 | 2 |
| arch-drift | 0 | 0 | 0 | 0 |
| **合计** | **0** | **1** | **2** | **3** |

## 可验证调优/修复/重构计划

1. 已修复 P1：`/source-test` HLS 运行时按需加载 -> verify: `pnpm exec eslint src/components/SourceTestModule.tsx src/app/play/utils/hlsStreamInfo.ts --quiet`、`pnpm typecheck`、`pnpm build`，并检查 `.next/app-build-manifest.json` 的 `/source-test/page` 不再包含 `hls.js` 大 chunk。
2. 保留 P2 计划：超长组件拆分 -> verify: 单模块 refactor scan/design/apply，逐步抽纯函数/展示组件，完成后跑定向测试与浏览器目视。
3. 保留 P2 计划：HLS 工具类型收敛 -> verify: 给 `hlsStreamInfo` 补单元测试，再减少 `any`，不在本轮无测试基础上扩大改动。

## 下一步建议

- **P1 已修**：Finding 1，见 `.codestable/refactors/2026-06-08-source-test-hls-lazy/source-test-hls-lazy-apply-notes.md`。
- **P2 已顺手收敛**：Finding 3，仅移除工具模块对 `hls.js` 的顶层事件常量依赖。
- **P2 后续专项**：Finding 2。建议拆成独立 refactor，不和包体优化混做。
