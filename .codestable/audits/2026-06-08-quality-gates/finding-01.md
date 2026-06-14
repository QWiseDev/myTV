---
doc_type: audit-finding
audit: 2026-06-08-quality-gates
finding_id: maintainability-01
nature: maintainability
severity: P1
confidence: high
suggested_action: cs-issue
status: resolved
---

# Finding 01：Jest 扫描 `.next` 产物

## 速答

Jest 未排除 `.next`，构建后的产物可能参与测试发现，导致 haste collision 或缓存噪音。

## 关键证据

- `jest.config.js` 原配置只设置 `testEnvironment` 与 alias，未通过 `modulePathIgnorePatterns` 排除 `.next`。
- 前序验证中已出现 `.next/standalone/package.json` 与项目 `package.json` 相关扫描冲突风险。

## 影响

测试结果会受本地构建产物影响，导致同一代码在 clean workspace 和 build 后 workspace 的测试表现不一致。

## 修复方向

在 Jest 配置中排除 `<rootDir>/.next/`。

## 建议动作

`cs-issue`，因为这是验证环境 bug 修复。

## 处理结果

已在 `jest.config.js` 增加 `modulePathIgnorePatterns: ['<rootDir>/.next/']`。
