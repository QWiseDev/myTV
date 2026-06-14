# Supabase 集成文档

## 快速开始

### 1. 创建 Supabase 项目

1. 访问 [Supabase](https://supabase.com) 并创建新项目
2. 复制项目 URL 和 anon public key

### 2. 配置环境变量

复制模板文件并配置：

```bash
cp .env.supabase.example .env.local
```

编辑 `.env.local`，添加以下配置：

```env
NEXT_PUBLIC_STORAGE_TYPE=supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### 3. 执行数据库迁移

在 Supabase SQL Editor 中依次执行：

1. `src/lib/supabase/schema-final.sql` - 创建表和索引（推荐使用此版本）
2. `src/lib/supabase/functions.sql` - 创建函数和触发器

> **注意**：如果之前使用了 `schema-v2.sql` 或 `schema-v3.sql`（基于 username 的结构），
> 请先执行 `scripts/migrate-schema-to-user-id.sql` 进行数据迁移。

#### Schema 版本说明

| 文件               | 说明                        | 状态      |
| ------------------ | --------------------------- | --------- |
| `schema-final.sql` | 统一版本，使用 user_id 关联 | ✅ 推荐   |
| `schema.sql`       | 原始版本，依赖 auth.users   | ⚠️ 已废弃 |
| `schema-v2.sql`    | 基于 username 的版本        | ⚠️ 已废弃 |
| `schema-v3.sql`    | 基于 username 的版本        | ⚠️ 已废弃 |

### 4. 启用 Realtime (可选)

在 Supabase Dashboard 中：

1. 进入 Database → Replication
2. 启用需要实时订阅的表

## 配置说明

### 环境变量

| 变量名                          | 说明                      | 必填 |
| ------------------------------- | ------------------------- | ---- |
| `NEXT_PUBLIC_STORAGE_TYPE`      | 存储类型，设为 `supabase` | 是   |
| `NEXT_PUBLIC_SUPABASE_URL`      | Supabase 项目 URL         | 是   |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 匿名公钥 (客户端使用)     | 是   |

### 数据模型

```
profiles           - 用户信息 (关联 auth.users)
play_records       - 播放记录
favorites          - 收藏夹
episode_skip_configs - 跳过配置
search_history     - 搜索历史
user_statistics    - 用户统计
access_logs        - 访问日志
admin_config       - 管理员配置
```

### Row Level Security (RLS)

所有用户数据表均已启用 RLS 策略，确保用户只能访问自己的数据。

## 从其他存储迁移

### 从 Upstash Redis 迁移

1. 导出 Upstash 数据
2. 使用 Supabase Dashboard 或 psql 导入
3. 或使用数据迁移脚本

## 故障排除

### 问题：用户找不到 profile

**原因**：用户通过旧系统注册，未在 Supabase Auth 中创建

**解决**：在 Supabase Dashboard → Authentication → Users 中确认用户存在

### 问题：RLS 权限错误

**解决**：检查 RLS 策略是否正确应用

```sql
SELECT * FROM pg_policies WHERE tablename = 'play_records';
```

### 问题：实时订阅不工作

**解决**：在 Supabase Dashboard 中启用表的 replication

## 切换存储类型

```bash
# 使用 Supabase
NEXT_PUBLIC_STORAGE_TYPE=supabase

# 使用 Upstash Redis
NEXT_PUBLIC_STORAGE_TYPE=upstash

# 使用本地存储
NEXT_PUBLIC_STORAGE_TYPE=localstorage
```
