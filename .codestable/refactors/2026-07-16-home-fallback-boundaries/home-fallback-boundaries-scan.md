---
doc_type: refactor-scan
refactor: 2026-07-16-home-fallback-boundaries
status: user-reviewed
scope: 首页数据 loader、useHomeData 与 HomeClient 直接渲染边界
summary: 3 条可读性优化，低风险 2 条、中风险 1 条
---

# home fallback boundaries scan

## 总览

- 扫描范围：`src/lib/home-data-loader.ts`、`src/hooks/useHomeData.ts`、`src/components/HomeClient.tsx`、`src/components/HomeTabContent.tsx`、`src/components/BangumiSection.tsx`、`src/components/FavoritesSection.tsx` 及对应测试
- 发现 3 条优化点：可读性 3 / 结构 0 / 性能 0
- 按风险：低 2 / 中 1 / 高 0
- 建议先做：#1、#2、#3；均可由测试、类型检查与构建自证
- 建议慎做 / 后做：Bangumi 8 秒等待会改变请求时序，另走 performance issue，不纳入本次 refactor
- 前置检查 7 条全过：✓
- 用户放行依据：会话指令“提交本阶段后继续处理首页”

## 条目

### #1 删除 loader 的重复 settled 分支 ✓

- **位置**：`src/lib/home-data-loader.ts:105-158`
- **分类**：可读性
- **现状**：secondary 与 tertiary 在 `withTimeout()` 外再套 `Promise.allSettled()`，随后重新判断 fulfilled/rejected。
- **问题**：`withTimeout()` 已把超时和 rejection 都归一为 resolve；这里重复了 2 组 settled 分支，tertiary 甚至只有 1 个 Promise。
- **建议**：secondary 改为直接 `Promise.all()`，tertiary 直接 await，并保持现有 fallback 值不变。
- **建议映射的方法**：M-L2-02
- **风险**：低；已有 timeout/rejection 契约测试可覆盖返回形状。
- **验证**：AI 自证（`home-data-loader.test.ts`、typecheck）
- **范围**：约 30 行 / 1 文件

### #2 删除聚合 loader 外不可达 catch ✓

- **位置**：`src/hooks/useHomeData.ts:192-204`
- **分类**：可读性
- **现状**：`loadHomeDataFromApi()` 已将 fetch、abort、解析失败归一为空数据，hook 又重复捕获同一错误。
- **问题**：相同错误所有权存在 2 层，维护者无法从调用点判断 loader 的 never-reject 契约。
- **建议**：用 characterization test 固化 loader 的错误归一化契约后，删除 hook 外层 catch；保留 fallback 编排 catch 与 fire-and-forget rejection sink。
- **建议映射的方法**：M-L2-02
- **风险**：低；仅删除当前契约下不可达分支。
- **验证**：AI 自证（`home-data-loader.test.ts`、`useHomeData.test.ts`）
- **范围**：约 15 行 / 2 文件

### #3 收口首页重复 Suspense 与 lazy 边界 ✓

- **位置**：`src/components/HomeClient.tsx:181-192`、`src/components/HomeTabContent.tsx:77-139`、`src/components/BangumiSection.tsx:15-87`、`src/components/FavoritesSection.tsx:16-61`
- **分类**：可读性
- **现状**：5 个 `Suspense` 直接包同步子树；Bangumi/Favorites 又 lazy 导入已被首页静态依赖图加载的模块。
- **问题**：共 8 组边界没有独立加载收益，且最外层 `fallback={null}` 可能在未来未局部处理的 suspension 时清空整个首页。
- **建议**：删除同步边界；将重复 lazy 的 `ScrollableRow`/`VideoCard` 改为静态导入；保留 5 个真实 lazy 组件的局部边界和数据 loading skeleton。
- **建议映射的方法**：M-L2-02
- **风险**：中；需验证 lazy pending 时其它首页区块仍可见，以及 Bangumi/Favorites 数据 loading 行为不变。
- **验证**：AI 自证（组件测试、typecheck、production build）
- **范围**：约 60 行 / 6 文件
