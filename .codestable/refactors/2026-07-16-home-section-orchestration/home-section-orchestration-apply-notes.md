---
doc_type: refactor-apply-notes
refactor: 2026-07-16-home-section-orchestration
---

# home section orchestration apply notes

## 步骤 1：固化 section 编排边界

- 完成时间：2026-07-16
- 改动文件：`src/hooks/useHomeData.test.ts`
- 验证结果：新增 critical 独立提交、secondary 整批拒绝、TV/综艺/tertiary retry 映射、缺失结果隔离和 retry rerender abort 5 条测试；旧实现定向 Jest 21/21 通过。
- 偏离：无。

## 步骤 2：建立统一 section 执行器

- 完成时间：2026-07-16
- 改动文件：`src/hooks/useHomeData.ts`
- 验证结果：新增 `executeSections()`，集中 critical、secondary、tertiary 的 begin/load/apply/catch；TV/综艺仍只发一次 batch。
- 偏离：首版用额外微任务启动 loader，刻画测试发现同步调用时点漂移；已删除该微任务并恢复原启动时点。

## 步骤 3：迁移入口并收口类型映射

- 完成时间：2026-07-16
- 改动文件：`src/hooks/useHomeData.ts`
- 验证结果：retry、initial fallback 与 tertiary idle 全部切到统一执行器；`HomeSectionDataMap + HOME_SECTION_CONFIG` 替代动态 data key/cast，controller、generation 和 idle cleanup 仍由入口持有。
- 偏离：不删除 `patchHomeData()` 导出；它已无生产调用，但共享接口删除留待 finding #6 决策。

## 步骤 4：完整回归

- 完成时间：2026-07-16
- 改动文件：审计 finding/index 与本 refactor 记录。
- 验证结果：
  - Hook 定向 Jest：1 suite / 21 tests 通过。
  - 全量 Jest：82 suites / 429 tests 通过。
  - 目标 ESLint、`pnpm typecheck`、源码/文档 Prettier 与 `git diff --check` 通过。
  - `pnpm build` 通过；构建期 `.env` 直连 `136.175.83.3:6379` 仍打印 `ECONNREFUSED`，最终退出码为 0。
  - checklist YAML 校验通过。
- 偏离：无可见 UI 变更，本轮以 Hook 时序、取消、错误隔离和 production build 自动验证为验收门禁。
