# 弹幕管理系统重构方案

## 一、现状分析

### 1.1 当前架构问题

**核心问题：**
- 弹幕逻辑与 Artplayer 插件深度耦合，难以独立测试和维护
- 数据加载、渲染、配置管理混杂在一起，职责不清
- 缺乏统一的弹幕数据模型和状态管理
- 性能优化分散在多处，缺乏系统性方案

**具体表现：**

1. **紧耦合问题** ([useDanmakuManager.ts:32-257](src/app/play/hooks/useDanmakuManager.ts#L32-L257))
   - 直接依赖 `player.plugins.artplayerPluginDanmuku`
   - 无法在播放器初始化前进行弹幕预加载
   - 切换播放器实现需要大量改动

2. **数据流混乱** ([useDanmakuManager.ts:106-176](src/app/play/hooks/useDanmakuManager.ts#L106-L176))
   - 缓存、API、本地数据库三层加载逻辑耦合
   - 缺乏统一的数据源抽象
   - 错误处理不完善

3. **性能瓶颈** ([route.ts:548-735](src/app/api/danmu-external/route.ts#L548-L735))
   - XML 解析在主线程阻塞
   - 大量弹幕（2万+）导致内存占用高
   - 缺乏虚拟化和分段加载机制

4. **类型定义分散**
   - [artplayer.d.ts:194-240](src/types/artplayer.d.ts#L194-L240)
   - [index.ts:39-58](src/app/play/types/index.ts#L39-L58)
   - 类型定义重复且不一致

### 1.2 功能需求梳理

**核心功能：**
1. 弹幕加载（外部API + 本地数据库）
2. 弹幕发送和保存
3. 弹幕渲染和显示
4. 弹幕配置管理（透明度、字号、速度等）
5. 弹幕过滤和屏蔽
6. 弹幕缓存管理

**性能需求：**
- 支持 2万+ 弹幕流畅播放
- 首屏加载时间 < 500ms
- 内存占用 < 50MB
- 渲染帧率 ≥ 60fps

**扩展需求：**
- 支持多种弹幕源
- 支持弹幕导入/导出
- 支持弹幕统计和分析
- 支持自定义渲染样式

## 二、重构架构设计

### 2.1 分层架构

```
┌─────────────────────────────────────────┐
│         UI Layer (React Components)      │
│  - DanmakuPanel                          │
│  - DanmakuSettings                       │
│  - DanmakuInput                          │
└─────────────────┬───────────────────────┘
                  │
┌─────────────────▼───────────────────────┐
│      Business Layer (Hooks & Logic)      │
│  - useDanmakuManager                     │
│  - useDanmakuConfig                      │
│  - useDanmakuFilter                      │
└─────────────────┬───────────────────────┘
                  │
┌─────────────────▼───────────────────────┐
│       Core Layer (DanmakuEngine)         │
│  - DanmakuManager (状态管理)             │
│  - DanmakuRenderer (渲染引擎)            │
│  - DanmakuPool (对象池)                  │
└─────────────────┬───────────────────────┘
                  │
┌─────────────────▼───────────────────────┐
│       Data Layer (Data Sources)          │
│  - DanmakuAPI (外部API)                  │
│  - DanmakuDB (本地数据库)                │
│  - DanmakuCache (缓存层)                 │
└─────────────────────────────────────────┘
```

### 2.2 核心模块设计

#### 2.2.1 DanmakuEngine (核心引擎)

**职责：** 弹幕生命周期管理、渲染调度、性能优化

**接口设计：**
```typescript
interface DanmakuEngine {
  // 初始化
  init(container: HTMLElement, config: DanmakuConfig): void;

  // 数据管理
  load(danmakus: Danmaku[]): void;
  emit(danmaku: Danmaku): void;
  clear(): void;

  // 播放控制
  play(): void;
  pause(): void;
  seek(time: number): void;

  // 配置管理
  updateConfig(config: Partial<DanmakuConfig>): void;

  // 生命周期
  destroy(): void;
}
```

#### 2.2.2 DanmakuDataSource (数据源抽象)

**职责：** 统一数据源接口，支持多种数据来源

**接口设计：**
```typescript
interface DanmakuDataSource {
  fetch(params: FetchParams): Promise<Danmaku[]>;
  save(danmaku: Danmaku): Promise<void>;
  cache(key: string, data: Danmaku[]): Promise<void>;
}

// 实现类
class ExternalAPISource implements DanmakuDataSource { }
class LocalDBSource implements DanmakuDataSource { }
class CacheSource implements DanmakuDataSource { }
```

#### 2.2.3 DanmakuRenderer (渲染引擎)

**职责：** 高性能弹幕渲染，支持 Canvas/CSS 双模式

**技术选型：**
- **Canvas 模式**：适用于大量弹幕（>1000条）
- **CSS 模式**：适用于少量弹幕，更好的可访问性

**优化策略：**
- 虚拟化渲染（只渲染可见区域）
- 对象池复用（减少 GC）
- RAF 调度（60fps 流畅渲染）
- 分段加载（按时间分段）

### 2.3 数据模型设计

```typescript
// 统一弹幕数据模型
interface Danmaku {
  id: string;
  text: string;
  time: number;
  color: string;
  mode: DanmakuMode;
  size: number;
  border: boolean;
  userId?: string;
  timestamp: number;
}

enum DanmakuMode {
  SCROLL = 0,    // 滚动
  TOP = 1,       // 顶部
  BOTTOM = 2,    // 底部
}

// 弹幕配置
interface DanmakuConfig {
  enabled: boolean;
  opacity: number;
  fontSize: number;
  speed: number;
  unlimited: boolean;
  maxOnScreen: number;
  filter: DanmakuFilter;
}

// 弹幕过滤器
interface DanmakuFilter {
  keywords: string[];
  users: string[];
  modes: DanmakuMode[];
  minLength: number;
  maxLength: number;
}
```

## 三、实施计划

### 3.1 第一阶段：核心引擎 (2-3天)

**目标：** 实现独立的弹幕引擎，解耦播放器依赖

**任务：**
1. 创建 `DanmakuEngine` 核心类
2. 实现基础渲染引擎（Canvas 模式）
3. 实现对象池和虚拟化
4. 编写单元测试

**产出：**
- `src/lib/danmaku/engine/DanmakuEngine.ts`
- `src/lib/danmaku/engine/DanmakuRenderer.ts`
- `src/lib/danmaku/engine/DanmakuPool.ts`

### 3.2 第二阶段：数据层 (1-2天)

**目标：** 统一数据源接口，优化数据加载

**任务：**
1. 抽象 `DanmakuDataSource` 接口
2. 实现各数据源适配器
3. 优化缓存策略
4. 实现数据预加载

**产出：**
- `src/lib/danmaku/data/DanmakuDataSource.ts`
- `src/lib/danmaku/data/ExternalAPISource.ts`
- `src/lib/danmaku/data/LocalDBSource.ts`
- `src/lib/danmaku/data/CacheSource.ts`

### 3.3 第三阶段：业务层 (1-2天)

**目标：** 重构 Hook，适配新架构

**任务：**
1. 重构 `useDanmakuManager`
2. 创建 `useDanmakuConfig`
3. 创建 `useDanmakuFilter`
4. 更新类型定义

**产出：**
- `src/app/play/hooks/useDanmakuManager.ts` (重构)
- `src/app/play/hooks/useDanmakuConfig.ts` (新增)
- `src/lib/danmaku/types.ts` (统一类型)

### 3.4 第四阶段：集成测试 (1天)

**目标：** 集成到播放器，验证功能和性能

**任务：**
1. 适配 Artplayer 插件
2. 性能测试和优化
3. 兼容性测试
4. 文档编写

**产出：**
- 集成测试报告
- 性能对比数据
- 使用文档

## 四、技术细节

### 4.1 性能优化方案

#### 4.1.1 虚拟化渲染

```typescript
class VirtualizedRenderer {
  private visibleDanmakus: Danmaku[] = [];

  update(currentTime: number) {
    // 只渲染当前时间 ±5秒的弹幕
    const timeWindow = 5;
    this.visibleDanmakus = this.allDanmakus.filter(
      d => Math.abs(d.time - currentTime) <= timeWindow
    );
  }
}
```

#### 4.1.2 对象池复用

```typescript
class DanmakuPool {
  private pool: DanmakuElement[] = [];

  acquire(): DanmakuElement {
    return this.pool.pop() || this.create();
  }

  release(element: DanmakuElement) {
    element.reset();
    this.pool.push(element);
  }
}
```

#### 4.1.3 分段加载

```typescript
class SegmentLoader {
  private segments: Map<number, Danmaku[]> = new Map();
  private readonly SEGMENT_DURATION = 300; // 5分钟

  load(danmakus: Danmaku[]) {
    danmakus.forEach(d => {
      const segmentId = Math.floor(d.time / this.SEGMENT_DURATION);
      if (!this.segments.has(segmentId)) {
        this.segments.set(segmentId, []);
      }
      this.segments.get(segmentId)!.push(d);
    });
  }

  getSegment(time: number): Danmaku[] {
    const segmentId = Math.floor(time / this.SEGMENT_DURATION);
    return this.segments.get(segmentId) || [];
  }
}
```

### 4.2 渲染引擎选择

**Canvas 模式优势：**
- 高性能，适合大量弹幕
- 完全控制渲染流程
- 更好的动画性能

**CSS 模式优势：**
- 实现简单
- 更好的可访问性
- 支持复杂样式

**推荐方案：** 根据弹幕数量自动切换
- < 500 条：CSS 模式
- ≥ 500 条：Canvas 模式

### 4.3 与 Artplayer 集成

```typescript
// 适配器模式
class ArtplayerDanmakuAdapter {
  private engine: DanmakuEngine;

  constructor(art: Artplayer) {
    this.engine = new DanmakuEngine();
    this.engine.init(art.$container, config);

    // 同步播放器状态
    art.on('play', () => this.engine.play());
    art.on('pause', () => this.engine.pause());
    art.on('seek', () => this.engine.seek(art.currentTime));
  }

  // 暴露 Artplayer 插件接口
  load(danmakus: Danmaku[]) {
    this.engine.load(danmakus);
  }

  emit(danmaku: Danmaku) {
    this.engine.emit(danmaku);
  }
}
```

## 五、风险评估

### 5.1 技术风险

| 风险 | 影响 | 概率 | 应对措施 |
|------|------|------|----------|
| Canvas 渲染兼容性 | 高 | 低 | 提供 CSS 降级方案 |
| 性能不达标 | 高 | 中 | 分阶段优化，保留旧实现 |
| 数据迁移问题 | 中 | 低 | 保持数据格式兼容 |

### 5.2 进度风险

- **预计工期：** 5-7 天
- **关键路径：** 核心引擎实现
- **缓冲时间：** 2 天

## 六、验收标准

### 6.1 功能验收

- [ ] 支持外部弹幕加载
- [ ] 支持本地弹幕发送和保存
- [ ] 支持弹幕配置调整
- [ ] 支持弹幕过滤
- [ ] 支持弹幕缓存

### 6.2 性能验收

- [ ] 2万弹幕加载时间 < 1s
- [ ] 渲染帧率 ≥ 55fps
- [ ] 内存占用 < 50MB
- [ ] 首屏显示时间 < 500ms

### 6.3 质量验收

- [ ] 单元测试覆盖率 > 80%
- [ ] 无 TypeScript 类型错误
- [ ] 通过 ESLint 检查
- [ ] 代码审查通过

## 七、后续优化方向

1. **WebGL 渲染**：进一步提升性能
2. **弹幕特效**：支持更多样式和动画
3. **智能过滤**：基于 AI 的内容过滤
4. **弹幕互动**：点赞、回复等社交功能
5. **弹幕分析**：热度图、词云等可视化

## 八、参考资料

- [Artplayer 官方文档](https://artplayer.org/)
- [DPlayer 弹幕实现](https://github.com/DIYgod/DPlayer)
- [Bilibili 弹幕协议](https://github.com/SocialSisterYi/bilibili-API-collect)
- [Canvas 性能优化](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas)
