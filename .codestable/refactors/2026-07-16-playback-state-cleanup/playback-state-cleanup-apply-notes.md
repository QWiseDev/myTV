---
doc_type: refactor-apply-notes
refactor: 2026-07-16-playback-state-cleanup
---

# playback state cleanup apply notes

## 步骤 1：固化 ended 事务边界

- 完成时间：2026-07-16
- 改动文件：`src/app/play/hooks/usePlayerInitializer.test.ts`
- 验证结果：测试 harness 可记录同名事件的全部 handler；新增重复 ended、SkipController、analytics 后 player 失活和最后一集 4 组场景，并显式约束 release → analytics → 二次 active 校验与换集去重。
- 偏离：fake timer 调整到播放器初始化前，避免真实 10 秒 loading timer 跨测试残留。

## 步骤 2：合并 ended 注册

- 完成时间：2026-07-16
- 改动文件：`src/app/play/hooks/usePlayerInitializer.ts`
- 验证结果：每个 ArtPlayer 实例只注册一个具名 `handleVideoEnded`；重复事件仍重复释放 Wake Lock 和上报 100%，但只安排一次自动下一集。
- 偏离：首版合并遗漏 analytics 后的第二次 active-player 校验；独立复核发现后已补回，并新增同步替换 player 的回归测试。

## 步骤 3：删除 source/favorite 假 owner

- 完成时间：2026-07-16
- 改动文件：`src/app/play/hooks/usePlayerState.ts`、`src/app/play/page.tsx`、`src/app/play/types/index.ts`
- 验证结果：删除零读写的 reducer state、action、case、creator、无效页面初值与专属遗留类型；全仓 production 搜索确认旧 action/state/type 零引用，真实 source owner 与 favorite owner 未修改。
- 偏离：无。

## 步骤 4：完整回归

- 完成时间：2026-07-16
- 改动文件：审计 finding/index 与本 refactor 记录。
- 验证结果：
  - 播放定向 Jest：3 suites / 30 tests 通过。
  - 全量 Jest：83 suites / 441 tests 通过。
  - `pnpm typecheck`、本批播放文件 ESLint `--max-warnings=0`、YAML、文档/测试 Prettier 与 `git diff --check` 通过。
  - `pnpm build` 通过；本次构建只在进程内覆盖 `REDIS_URL`，经临时 SSH tunnel 连接 `136.175.83.3:127.0.0.1:6379`，未修改 `.env` 或远端 Redis 配置，构建后端口已关闭。
- 偏离：无可见 UI 变化；本批以事件顺序、状态零引用、source/favorite 回归与 production build 作为行为等价门禁。
