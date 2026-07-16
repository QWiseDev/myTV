---
doc_type: refactor-apply-notes
refactor: 2026-07-16-user-menu-decomposition
---

# user menu decomposition apply notes

## 步骤 1：补齐展示与持久化边界刻画

- 完成时间：2026-07-16
- 改动文件：`src/components/UserMenu.test.tsx`
- 验证结果：新增菜单导航后关闭 Portal、版本面板开关、设置恢复默认与图片代理事件、自定义豆瓣代理条件输入框、改密 API 拒绝保留面板 5 类刻画；`UserMenu.test.tsx` 13/13、目标 ESLint、`pnpm typecheck`、YAML 校验与 `git diff --check` 通过。
- 偏离：首次 YAML 验证使用 `python` 时因当前 pyenv 未配置该命令失败，改用 `python3` 后通过；未修改生产行为。
