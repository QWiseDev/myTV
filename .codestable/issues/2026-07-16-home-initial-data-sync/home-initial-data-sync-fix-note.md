---
doc_type: issue-fix
issue: 2026-07-16-home-initial-data-sync
path: fast-track
fix_date: 2026-07-16
tags: [home, initial-data, rsc, state-sync, concurrency]
---

# 首页完整 initialData 同步修复记录

## 1. 问题描述

`useHomeData` 只在 `useState` initializer 中消费一次 `initialData`。当 `router.refresh()` 或其它 RSC 合并给现有 Client Component 传入新的完整首页 snapshot 时，effect 会因为数据完整直接 return，页面继续显示旧 state 和旧 loading。

仓内当前没有主动调用 `router.refresh()` 的首页入口，因此触发频率未确认；但 prop 更新后 state 永久不更新的路径可由 Hook rerender 稳定复现。

## 2. 根因

Hook 虽把 `initialData` 放进 effect 依赖，但完整数据分支只调度追更检查，没有把新 snapshot 提交到现有 state。直接每次无条件提交又会让首次完整 SSR 挂载多一次无意义渲染。

## 3. 修复方案

- 用 ref 记录上一版 `initialData` 引用，只识别真正的新 prop snapshot。
- 新引用到达且 snapshot 完整时，复用 `applyHomeData()` 整体同步数据和 loading，再按原路径调度追更检查。
- 把新完整 RSC snapshot 视为权威输入；旧 effect cleanup 后，迟到的 aggregate/secondary Promise 继续由现有 `cancelled` 门禁拦截。
- 不同步 partial snapshot 的已有区块，也不改 availability、merge、fallback 或空数组语义，避免把修复扩大成缓存策略重构。

## 4. 改动文件清单

- `src/hooks/useHomeData.ts`
- `src/hooks/useHomeData.test.ts`
- `.codestable/audits/2026-07-16-home-second-pass/index.md`
- `.codestable/audits/2026-07-16-home-second-pass/finding-07.md`

## 5. 验证结果

- `pnpm exec jest src/hooks/useHomeData.test.ts --runInBand`：1 suite / 9 tests 通过。
- `pnpm exec jest --runInBand`：69 suites / 310 tests 通过。
- `pnpm typecheck`：通过。
- 修改文件 ESLint、Prettier check 与 `git diff --check`：通过。
- 通过 `127.0.0.1:16379` SSH 隧道执行 `pnpm build`：无 Redis 配置/连接错误并通过。

## 6. 遗留事项

- 同一个 `initialData` 对象被原地 mutation 不会触发同步；Next RSC 以新对象传递 snapshot，符合当前 immutable props 前提。
- partial snapshot 的权威性和区块级 merge 仍未定义版本/时间戳契约；若未来需要支持 partial RSC refresh，应单独设计，不能只把空数组直接覆盖到现有有效数据。
