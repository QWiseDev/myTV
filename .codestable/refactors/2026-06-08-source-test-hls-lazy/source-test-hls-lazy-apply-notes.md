---
doc_type: refactor-apply-notes
refactor: 2026-06-08-source-test-hls-lazy
---

# source-test-hls-lazy apply notes

## 步骤 1: 源检测 HLS 运行时按需加载

- 完成时间: 2026-06-08
- 改动文件:
  - `src/components/SourceTestModule.tsx`
  - `src/app/play/utils/hlsStreamInfo.ts`
- 验证结果:
  - `node` 读取 `hls.js` 的 `Events` 常量，确认事件名为 `hlsManifestParsed`、`hlsLevelLoaded`、`hlsLevelSwitched`、`hlsLevelsUpdated`
  - `pnpm exec eslint src/components/SourceTestModule.tsx src/app/play/utils/hlsStreamInfo.ts --quiet` 通过
  - `pnpm typecheck` 通过
  - `pnpm exec jest --runInBand` 通过，13 个 test suite / 57 个测试
  - `pnpm exec eslint src --quiet` 通过
  - `pnpm build` 通过，`/source-test` First Load JS 为 154 kB
  - `.next/app-build-manifest.json` 中 `/source-test/page`、`/play/page`、`/live/page` 的 `hlsLike` chunk 均为空
- 偏离: 执行中发现 HLS 不支持 fallback 路径一度会提前返回，已修正为设置 `video.src` 后继续走统一 `video.play()` 路径
