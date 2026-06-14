# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

卡拉米影视 (KLMTV) 是基于 Next.js 14 构建的全功能影视聚合播放平台，深度二次开发自 MoonTV。这是一个现代化的大规模视频流媒体应用，集成了 YouTube、网盘搜索、AI 推荐、短剧功能、IPTV 直播、Bangumi 动漫等 50+ 项核心功能。

## Development Commands

### Core Development
- `pnpm dev` - 启动开发服务器并自动生成 manifest (监听所有接口)
- `pnpm build` - 构建生产版本
- `pnpm start` - 启动生产服务器
- `pnpm lint` - 运行 ESLint 检查
- `pnpm lint:fix` - 自动修复 ESLint 问题并格式化代码
- `pnpm lint:strict` - 严格模式 ESLint 检查 (零警告)
- `pnpm typecheck` - TypeScript 类型检查

### Testing
- `pnpm test` - 运行 Jest 测试
- `pnpm test:watch` - 监听模式运行测试

### Code Quality
- `pnpm format` - 使用 Prettier 格式化代码
- `pnpm format:check` - 检查代码格式

### Deployment Prep
- `pnpm gen:manifest` - 生成 PWA manifest 文件

## Architecture Overview

### Next.js App Router Structure
- **App Router**: 使用 Next.js 14 App Router (`src/app/`)
- **Dynamic Rendering**: 强制所有页面动态渲染，避免构建时数据库访问
- **Standalone Output**: 配置为独立输出，支持 Docker 部署

### Key Directories
- `src/app/` - Next.js App Router 页面和 API 路由
- `src/components/` - React 组件库
- `src/lib/` - 工具函数和客户端库
- `src/hooks/` - 自定义 React Hooks
- `src/styles/` - 全局样式和 CSS

### Core Technologies
- **Frontend**: Next.js 14 + React 18 + TypeScript
- **UI**: Tailwind CSS + Headless UI + Framer Motion
- **Video Player**: ArtPlayer 5.3.0 + HLS.js 1.6.13
- **Virtualization**: react-window for 大量内容渲染
- **State Management**: React Context API + Hooks
- **Storage**: Kvrocks/Redis/Upstash + localStorage

### Database & Storage
- **Primary**: Redis 兼容存储 (Kvrocks/Redis/Upstash)
- **Cache**: 统一缓存管理系统
- **Client Storage**: localStorage for 用户偏好设置

### Key Features Architecture

#### 视频播放系统
- ArtPlayer with HLS.js support
- Chromecast 投屏支持
- iPad/iOS 优化播放
- 弹幕系统集成 (Web Worker 加速)
- 跳过片头片尾功能

#### 内容聚合
- 多源影视聚合搜索
- YouTube Data API v3 集成
- 网盘搜索 (PanSou API)
- 短剧功能 (专用移动端 API)
- IPTV 直播 (m3u/m3u8 + EPG)
- Bangumi 动漫信息

#### 用户管理
- Telegram Magic Link 认证
- 用户等级系统
- 播放统计追踪
- 用户组权限控制

#### 智能推荐
- AI 内容推荐 (GPT-5/o 支持)
- TMDB 演员搜索
- 发布日历
- 豆瓣详情增强

### API Structure
- `/api/search/` - 搜索相关接口
- `/api/douban/` - 豆瓣数据接口
- `/api/youtube/` - YouTube 集成
- `/api/shortdrama/` - 短剧功能
- `/api/tvbox/` - TVBox API 兼容
- `/api/telegram/` - Telegram 认证

### Performance Optimizations
- 虚拟滚动 (react-window + ResizeObserver)
- 响应式网格布局
- 智能缓存机制
- Web Worker 弹幕渲染
- 分段加载和懒加载

### Development Notes
- 使用 pnpm 作为包管理器 (指定版本 10.14.0)
- ESLint + Prettier 代码规范
- Husky Git hooks
- TypeScript 严格模式
- 构建时移除 console.log (保留 error 和 warn)

### Security Considerations
- TVBox IP 白名单和 Token 认证
- 用户权限分组控制
- 内容过滤系统
- API 端点权限验证

### Deployment
- Docker 优先部署策略
- 支持 Zeabur、Vercel 等平台
- 环境变量配置驱动
- Kvrocks 推荐用于生产环境

## Development Guidelines

### Project Structure & Module Organization
- `src/app/`: Next.js App Router 路由与布局，每个子目录对应独立业务流，跨页面逻辑下沉至 `src/lib/`
- `src/components/` & `src/hooks/`: 通用组件和自定义 Hook，组件命名使用帕斯卡格式 (PascalCase.tsx)，Hook 使用 `use` 前缀
- `src/lib/`, `src/types/`, `src/styles/`: 领域工具、共享类型以及 Tailwind 配置
- 静态资源存放在 `public/`，构建脚本位于 `scripts/`
- 优先使用 `@/` 路径别名进行导入

### Coding Standards & Naming Conventions
- **TypeScript**: 缩进 2 空格，单引号结尾分号，Prettier 配置位于 `.prettierrc.js`
- **组件命名**: PascalCase.tsx (如 VideoPlayer.tsx)
- **库文件**: kebab-case.ts (如 api-client.ts)
- **ESLint**: 集成 `@typescript-eslint`、`simple-import-sort`、`unused-imports`
- **提交前检查**: 确保导入有序且无冗余符号

### Testing Strategy
- **Framework**: Jest + Testing Library (jest-environment-jsdom)
- **Test Files**: `*.test.ts(x)` 或与源码同级，或放入 `__tests__/` 目录
- **Testing Focus**: UI 行为通过用户视角断言，避免快照依赖
- **Routing Tests**: 使用 `next-router-mock` 进行路由相关测试
- **Priority**: 单元与集成测试组合，关注播放器、缓存与并发请求场景

### Git Workflow & Commit Standards
- **Commit Format**: 遵循 Conventional Commits (参见 `commitlint.config.js`)
- **Message Format**: `type(scope): description` (如 `feat(player): 添加 HLS 回退`)
- **Types**: feat, fix, docs, style, refactor, test, chore
- **Pre-commit**: Husky hooks with lint-staged 自动化代码质量检查
- **PR Requirements**: 变更概述、关联 issue、关键页面截图 (UI 改动)、潜在风险说明

### Code Quality Pipeline
```bash
# 提交前验证
pnpm lint:strict    # 零警告检查
pnpm typecheck      # TypeScript 类型检查
pnpm test           # 测试执行

# 代码格式化
pnpm lint:fix       # ESLint 修复 + Prettier 格式化
pnpm format         # 仅 Prettier 格式化
```

## Working with This Codebase

### Adding New Features
1. 遵循现有的 App Router 结构
2. 使用 TypeScript 和现有的类型定义
3. 新组件放在 `src/components/` 下
4. API 路由放在 `src/app/api/` 下
5. 使用 Tailwind CSS 进行样式设计

### Video Player Integration
- 使用 ArtPlayer 作为主要播放器
- HLS.js 用于流媒体支持
- 考虑移动端兼容性
- 实现弹幕系统集成

### Database Operations
- 使用统一的缓存管理系统
- 所有存储操作通过 `lib/database-cache.ts`
- 注意 Redis/Kvrocks 连接配置
- 实现适当的缓存过期策略

### UI/UX Guidelines
- 响应式设计优先
- 使用现有的设计系统组件
- 保持移动端友好
- 实现虚拟滚动处理大量数据