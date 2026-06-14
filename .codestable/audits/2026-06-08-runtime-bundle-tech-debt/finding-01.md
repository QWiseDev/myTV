---
doc_type: audit-finding
audit: 2026-06-08-runtime-bundle-tech-debt
finding_id: performance-01
nature: performance
severity: P1
confidence: high
suggested_action: cs-refactor
status: resolved
---

# Finding 01：`/source-test` 顶层加载 HLS 运行时

## 速答

`SourceTestModule` 顶层静态引入 `hls.js`，导致源检测页面即使只展示表单和结果列表，也会把播放器运行时带进首屏包体。

## 关键证据

- `src/components/SourceTestModule.tsx:13` — `import Hls from 'hls.js';` —— 顶层静态 import 会进入组件所在 chunk。
- `src/app/source-test/page.tsx:11` — `import SourceTestModule from '@/components/SourceTestModule';` —— `/source-test` 页面直接渲染该组件。
- `src/components/SourceTestModule.tsx:783` — `if (isHlsStream && Hls.isSupported())` —— HLS 只在播放检测 HLS 流时才需要，首屏不需要。

## 影响

影响 `/source-test` 首屏 JS 和管理员进入源检测工具的加载成本。前序 `/play`、`/live` 已通过相同方向降低约 159 kB First Load JS，本页面仍保留同类债务。

## 修复方向

把 `hls.js` 构造器动态 import 到 HLS 播放检测分支内；非 HLS 仍使用原生 video 播放路径。

## 建议动作

`cs-refactor`，因为这是行为等价的运行时依赖延迟加载，验证可通过 lint/typecheck/build/build manifest 完成。

## 处理结果

已在 `src/components/SourceTestModule.tsx` 将 `hls.js` 改为 HLS 播放检测分支内动态加载。`pnpm build` 后 `/source-test` First Load JS 为 154 kB，`.next/app-build-manifest.json` 中 `/source-test/page` 的 `hlsLike` chunk 为空。
