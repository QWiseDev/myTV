---
doc_type: audit-finding
audit: 2026-07-15-playback-deep-review
finding_id: performance-07
nature: performance
severity: P2
confidence: high
suggested_action: cs-refactor
status: open
---

# Finding 07：弹幕默认策略与旧性能结论反向漂移

## 速答

旧播放性能审计记录“未设置偏好时不自动加载弹幕”，当前代码却把无偏好默认成 true，并在 ready 后固定安排加载。

## 关键证据

- `.codestable/audits/2026-06-18-playback-performance/index.md:49-51` — 旧处理结果记录无偏好时不自动加载。
- `src/app/play/page.tsx:110-114` — 当前无偏好时返回 true。
- `src/app/play/page.tsx` — 当前默认策略直接进入 reducer 初始状态，已不再挂载后二次读取。
- `src/app/play/hooks/usePlayerInitializer.ts` — ready 仅在运行时 ref 开启时安排加载，结果提交前再次校验开关。

## 影响

新用户仍会默认请求并渲染弹幕，可能重新引入旧审计指出的持续 CPU/GPU 负载；当前剩余矛盾是产品默认策略与旧审计结论不一致。

## 修复方向

由产品确认新用户默认策略；若继续保持默认开启，应同步修订旧性能结论，若改为默认关闭，则只调整 reducer 初始值及对应测试。

## 本轮进展（2026-07-15）

本轮修复了弹幕请求 abort、跨集/跨播放器 stale result 和 loading 所有权，但没有改变新用户默认值，也没有删除页面与 initializer 的重复偏好读取。性能与产品策略问题仍完整存在，因此保持 open。

## 补充进展（2026-07-16）

- 保持历史提交明确选择的“无偏好默认开启”，未擅自改变产品行为。
- 页面初始化只读取一次持久化偏好，删除挂载后的重复读取；运行时由 `externalDanmuEnabledRef` 持有即时状态，Artplayer 设置不再直接访问 localStorage。
- 用户显式关闭时，player ready 与换集同步不再创建延迟加载任务，不请求、不 reset/load/show 弹幕插件，也不显示“暂无弹幕数据”；ready、手动开启、换集、换源四条在途请求均在结果提交前复核当前开关和媒体 identity。
- 弹幕加载函数集中比较 canonical request identity，封住同一播放器 in-place 换集时“新请求尚未启动、旧请求先返回”的空窗。
- 结构与关闭态行为已收口，finding 仅因“默认开启还是关闭”的产品策略尚未重新拍板而保持 open。

## 建议动作

默认策略需要用户拍板；结构收敛和显式关闭态已完成，不再需要继续改代码。
