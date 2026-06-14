# 深度优化计划（2026-06-07）

## 1. 当前基线

- 项目：Next.js 14 + React 18 + TypeScript 4.9，包管理器 pnpm。
- 代码规模：`src` 下 TS/TSX/JS/JSX 约 110581 行。
- 构建基线：`pnpm build` 通过。
- 类型基线：`pnpm typecheck` 通过。
- 测试基线：`pnpm exec jest --runInBand` 通过，13 个 test suite，57 个测试。
- Lint 基线：已清掉阻断 error；剩余 warning 473 个。

Lint warning 分布：

| 规则                                       | 数量 | 处理策略                                       |
| ------------------------------------------ | ---: | ---------------------------------------------- |
| `@typescript-eslint/no-explicit-any`       |  315 | 分模块补类型，不全仓库一次性替换               |
| `unused-imports/no-unused-vars`            |   84 | 优先清运行路径和大文件中的无用符号             |
| `react-hooks/exhaustive-deps`              |   30 | 逐处确认闭包语义后修，不盲目加依赖             |
| `@typescript-eslint/no-non-null-assertion` |   23 | 只在能明确空值路径时替换                       |
| `@next/next/no-img-element`                |   17 | 仅对影响 LCP 或可安全迁移的图片改 `next/image` |
| `simple-import-sort/imports`               |    4 | 可随模块修改时顺手修                           |

构建包体热点：

| 路由           | First Load JS | 优先级 |
| -------------- | ------------: | ------ |
| `/play`        |        378 kB | P1     |
| `/live`        |        351 kB | P1     |
| `/source-test` |        310 kB | P1     |
| `/search`      |        209 kB | P2     |
| `/douban`      |        196 kB | P2     |

超长文件热点：

| 文件                                  | 行数 | 问题类型                                        |
| ------------------------------------- | ---: | ----------------------------------------------- |
| `src/components/SlotMachine.tsx`      | 3044 | 组件职责过多、维护成本高                        |
| `src/app/live/page.tsx`               | 2312 | 页面、数据、播放器、EPG、收藏逻辑耦合           |
| `src/components/UserMenu.tsx`         | 2282 | 菜单、版本、播放记录、收藏等逻辑耦合            |
| `src/components/SourceTestModule.tsx` | 2031 | 源测试、播放抽屉、HLS 探测混在一个组件          |
| `src/app/search/page.tsx`             | 1972 | 搜索状态、筛选、渲染和副作用混合                |
| `src/app/play/page.tsx`               | 1134 | 已拆 hook，但仍静态引入播放依赖和较多运行时状态 |

## 2. 已完成 quick wins

1. 修复 `pnpm exec eslint src --quiet` 的 13 个阻断 error。

   - 空函数改成显式 `undefined` no-op。
   - `switch case` 中的词法声明加块作用域。
   - 无限 `while (true)` 改为更清晰的无条件 `for` 循环。
   - 移除可推断默认参数类型注解。

2. 修复 Jest 扫描 `.next/standalone/package.json` 导致的 haste collision 警告。
   - 在 `jest.config.js` 增加 `modulePathIgnorePatterns: ['<rootDir>/.next/']`。

验证：

```bash
pnpm exec eslint src --quiet
pnpm typecheck
pnpm exec jest --runInBand
```

## 3. 分阶段计划

### 阶段 1：质量门禁稳定化

目标：让常规验证命令稳定、低噪音，避免后续重构在脏基线上推进。

范围：

- `jest.config.js`
- 当前 lint error 文件
- 直接阻断 `pnpm lint` 的 error

不做：

- 不一次性消灭全部 473 个 warning。
- 不把 `any` 全仓库批量替换成 `unknown`。

验收：

```bash
pnpm exec eslint src --quiet
pnpm typecheck
pnpm exec jest --runInBand
pnpm build
```

状态：已完成主要阻断项；剩余 `pnpm lint` 仍会因为 warning 以非零退出，这是下一阶段任务。

### 阶段 2：播放页包体与播放器依赖按需加载

目标：降低 `/play` 首屏 JS，减少进入播放页前加载播放器重依赖。

当前证据：

- `/play` First Load JS 为 378 kB。
- `src/app/play/page.tsx` 顶层静态引入 `hls.js`。
- `usePlayerInitializer` 已经支持 `loadArtplayerModules()` 动态加载 ArtPlayer 和弹幕插件。

执行结果：

- 已将 `/play` 顶层 `hls.js` import 移入播放器初始化时动态加载。
- 已将 `hlsConfig` 从 `usePlayerInitializer` 静态 import 改为初始化时动态加载。
- `pnpm build` 显示 `/play` First Load JS 从 378 kB 降到 219 kB，减少约 159 kB。
- `.next/app-build-manifest.json` 中 `/play/page` 已不再包含 503K 的 `hls.js` 相关大 chunk；`/live` 和 `/source-test` 仍包含，待后续阶段处理。

建议动作：

1. 将 `Hls` 从 `src/app/play/page.tsx` 顶层静态 import 改为按播放器初始化时动态加载。
2. 把 `typeof import('hls.js').default` 类型保留为 type-only，避免运行时进首屏 chunk。
3. 对 `preloadArtplayerModules()` 的触发时机做一次梳理，避免首屏过早预加载。

风险：

- HLS 初始化、iOS/Safari 兜底、换源恢复是外部可见行为，必须保留回归测试和浏览器目视验证。

验收：

```bash
pnpm exec jest src/app/play/utils/hlsConfig.test.ts src/app/play/utils/artplayerLoader.test.ts --runInBand
pnpm typecheck
pnpm build
```

人工验证：

- 打开 `/play?source=...&id=...`，验证 HLS 播放、换集、换源、弹幕开关。
- 对 iOS/Safari 行为不能仅靠本地桌面验证，需要单独设备验收。

状态：代码级验证已通过；仍建议做一次真实播放页面目视验证，尤其是 HLS 播放、换源、换集和 iOS/Safari 行为。

### 阶段 3：直播页拆分和按需播放器加载

目标：降低 `/live` 首屏 JS 和维护风险。

当前证据：

- `/live` First Load JS 为 351 kB。
- `src/app/live/page.tsx` 2312 行，顶层静态引入 `hls.js`，同时承担直播源、频道、EPG、收藏、播放器、键盘事件等职责。

已完成子项：

- 已将 `/live` 顶层 `hls.js` import 改为播放器初始化时动态加载。
- 已将 HLS 错误守卫从静态 import 改为播放器初始化时动态加载。
- `pnpm build` 显示 `/live` First Load JS 从 351 kB 降到 192 kB，减少约 159 kB。
- `.next/app-build-manifest.json` 中 `/live/page` 已不再包含 503K 的 `hls.js` 相关大 chunk。

建议拆分顺序：

1. 抽出纯数据函数：EPG 清洗、频道分组、频道过滤。
2. 抽出状态 hook：直播源加载、频道加载、收藏状态。
3. 抽出播放器 hook：ArtPlayer/HLS 初始化与错误恢复。
4. 最后处理 `hls.js` 动态加载，避免行为变化和结构拆分混在同一步。

其中第 4 项已完成；其余结构拆分仍待后续单独推进。

验收：

```bash
pnpm typecheck
pnpm exec eslint src/app/live/page.tsx src/app/live --quiet
pnpm build
```

人工验证：

- `/live` 初次加载。
- 切换直播源和频道。
- 搜索频道。
- 收藏/取消收藏。
- EPG 展示。
- HLS 错误恢复路径至少做一次模拟或手动观察。

### 阶段 4：源测试模块拆分

目标：降低 `/source-test` 维护成本和包体风险。

当前证据：

- `/source-test` First Load JS 为 310 kB。
- `SourceTestModule.tsx` 2031 行，顶层静态引入 `hls.js`，同时包含源测试、结果解析、播放测试抽屉、HLS 流信息探测。

建议拆分顺序：

1. 抽出解析纯函数：播放线路解析、匹配率、top matches。
2. 为解析函数补 Jest 测试。
3. 抽出播放测试抽屉组件。
4. 将 HLS 探测改为用户点击播放测试后动态 import。

验收：

```bash
pnpm exec jest --runInBand
pnpm typecheck
pnpm build
```

人工验证：

- `/source-test` 搜索源。
- 展开测试结果。
- 打开播放测试抽屉。
- 查看 HLS 流信息。

### 阶段 5：Lint warning 分模块清理

目标：逐步恢复 `pnpm lint` 可作为有效门禁，而不是被 warning 淹没。

建议顺序：

1. 清未使用符号：优先 `src/app/play`、`src/app/live`、`src/components/SourceTestModule.tsx`。
2. 修 Hook 依赖：每处必须说明闭包语义，不允许机械加依赖导致循环请求。
3. 类型收敛：先给播放器、HLS、ArtPlayer、源测试结果补共享类型。
4. 最后处理 `.d.ts` 中合理存在的 `any`，必要时对第三方插件类型保留局部豁免。

验收：

```bash
pnpm exec eslint src -f json
pnpm lint
pnpm lint:strict
```

阶段目标不是一次清零，而是每轮 warning 数下降且不引入行为变化。

### 阶段 6：大组件重构

目标：降低长期维护成本，不以包体为唯一目标。

优先对象：

1. `src/components/SlotMachine.tsx`
2. `src/components/UserMenu.tsx`
3. `src/app/search/page.tsx`

执行原则：

- 一次只拆一个模块。
- 先抽纯函数和无副作用展示组件。
- 每步都跑定向验证。
- UI 行为需要浏览器目视，不用类型检查代替。

## 4. 不建议立即做的事

- 不建议全仓库批量 `eslint --fix`，容易混入大面积格式和 import 顺序改动。
- 不建议直接升级 Next/React/TypeScript，当前问题主要是结构和包体，不是版本阻塞。
- 不建议把全部 `any` 替换成 `unknown`，播放器和第三方插件边界需要先建类型。
- 不建议同时重构 `/play` 和 `/live` 的播放器逻辑，两者共享 HLS 语义但行为细节不同。

## 5. 下一轮推荐入口

推荐从阶段 2 开始：`/play` 播放器依赖按需加载。

原因：

- `/play` 是当前最大 First Load JS 热点。
- 已有 `artplayerLoader` 和相关测试，验证基础相对完整。
- 改动可以控制在播放页和播放器初始化 hook 内，不需要先拆完整页面结构。
