---
doc_type: audit-index
audit: 2026-06-18-playback-performance
scope: 播放页电脑播放发热相关性能路径
created: 2026-06-18
status: resolved
total_findings: 3
---

# playback-performance 审计报告

## 范围

用户反馈“电脑播放会很烫”。本次只读扫描聚焦播放页持续运行路径：

- `src/app/play/page.tsx`
- `src/app/play/hooks/usePlayerInitializer.ts`
- `src/app/play/utils/hlsConfig.ts`
- `src/app/play/utils/danmakuConfig.ts`
- `src/app/play/utils/danmakuRuntime.ts`
- `src/components/play/PlayerContainer.tsx`
- `src/components/SkipController.tsx`

## 总评

发现 3 条性能相关问题，均集中在播放时持续运行路径。已做保守缓解：桌面端 HLS 保留播放流畅所需 worker 与带宽测试，但下调缓冲上限、关闭片段预取并减少重试；外部弹幕改为按用户偏好开启，播放器设置中补充“弹幕”开关；`SkipController` 改为监听播放器时间事件，不再由父组件每秒传 `currentTime` 触发 React 重渲染。

## 发现清单

| # | 性质 | 严重度 | 置信度 | 标题 | 文件 |
|---|---|---|---|---|---|
| 1 | performance | P1 | high | 桌面 HLS 缓冲与重试配置偏激进 | [finding-01.md](finding-01.md) |
| 2 | performance | P1 | medium | 弹幕默认开启并在 ready 后自动加载渲染 | [finding-02.md](finding-02.md) |
| 3 | performance | P2 | high | `SkipController` 随播放进度每秒重渲染和扫描片段 | [finding-03.md](finding-03.md) |

## 按维度分布

| 性质 | P0 | P1 | P2 | 合计 |
|---|---|---|---|---|
| bug | 0 | 0 | 0 | 0 |
| security | 0 | 0 | 0 | 0 |
| performance | 0 | 2 | 1 | 3 |
| maintainability | 0 | 0 | 0 | 0 |
| arch-drift | 0 | 0 | 0 | 0 |
| **合计** | **0** | **2** | **1** | **3** |

## 处理结果

- [finding-01.md](finding-01.md)：已下调桌面 HLS 缓冲、预取和重试配置，保留 `enableWorker` 与 `testBandwidth` 以优先保障流畅度。
- [finding-02.md](finding-02.md)：已将外部弹幕默认值改为读取 `enable_external_danmu`，未设置时不自动加载；播放器设置增加“弹幕”开关。
- [finding-03.md](finding-03.md)：已移除 `currentTime` prop 传递，`SkipController` 内部监听播放器 `video:timeupdate`。

## 验证

- `pnpm exec jest src/app/play/utils/hlsConfig.test.ts src/app/play/utils/artplayerConfig.test.ts src/app/play/hooks/usePlayProgress.test.ts src/app/play/hooks/usePlayRecordSync.test.ts --runInBand`
- `pnpm typecheck`
- `pnpm exec eslint src/app/play/page.tsx src/app/play/utils/hlsConfig.ts src/app/play/utils/hlsConfig.test.ts src/app/play/utils/artplayerConfig.ts src/app/play/utils/artplayerConfig.test.ts src/components/play/PlayerContainer.tsx src/components/SkipController.tsx --quiet`

## 后续建议

- 用 Chrome Performance/Activity Monitor 对比同一视频播放 5 分钟的 CPU、Energy Impact、JS Heap、GPU 占用。
- 如果仍然发热，下一步应重点确认片源编码和浏览器硬解状态，而不是继续削减缓冲影响流畅度。
