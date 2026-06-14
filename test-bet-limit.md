# 老虎机投注限制测试（考虑倍率）

## 更新说明
**重要更新**：现在投注限制考虑倍率影响，总投注金额 = 基础投注 × 倍率，最大100,000金币。

## 测试用例

### 1. 正常投注（应该成功）
```bash
# 1倍率，基础投注1000，总投注1000
curl -X POST http://localhost:3000/api/slot/spin \
  -H "Content-Type: application/json" \
  -H "Cookie: user_auth=..." \
  -d '{"betAmount": 1000, "multiplier": 1}'
```

### 2. 倍率导致的超额投注（应该失败）
```bash
# 5倍率，基础投注30000，总投注150000（超出限制）
curl -X POST http://localhost:3000/api/slot/spin \
  -H "Content-Type: application/json" \
  -H "Cookie: user_auth=..." \
  -d '{"betAmount": 30000, "multiplier": 5}'
```

预期响应：
```json
{
  "error": "总投注金额（基础投注×倍率）超出限制，最大允许投注 100,000 金币",
  "baseBetAmount": 30000,
  "multiplier": 5,
  "totalBetAmount": 150000,
  "maxAllowed": 100000,
  "suggestion": "建议基础投注不超过 20000 金币"
}
```

### 3. 倍率格式错误（应该失败）
```bash
curl -X POST http://localhost:3000/api/slot/spin \
  -H "Content-Type: application/json" \
  -H "Cookie: user_auth=..." \
  -d '{"betAmount": 1000, "multiplier": 6}'
```

预期响应：
```json
{
  "error": "倍率必须是1-5之间的整数",
  "received": 6
}
```

### 4. 边界值测试（刚好100,000，应该成功）
```bash
# 5倍率，基础投注20000，总投注100000
curl -X POST http://localhost:3000/api/slot/spin \
  -H "Content-Type: application/json" \
  -H "Cookie: user_auth=..." \
  -d '{"betAmount": 20000, "multiplier": 5}'
```

### 5. 智能建议测试
```bash
# 基础投注合理但倍率过高
curl -X POST http://localhost:3000/api/slot/spin \
  -H "Content-Type: application/json" \
  -H "Cookie: user_auth=..." \
  -d '{"betAmount": 10000, "multiplier": 5}'
```

预期响应：
```json
{
  "error": "总投注金额（基础投注×倍率）超出限制，最大允许投注 100,000 金币",
  "baseBetAmount": 10000,
  "multiplier": 5,
  "totalBetAmount": 50000,
  "maxAllowed": 100000,
  "suggestion": "建议将倍率降低到 10 倍或以下"
}
```

## 前端更新内容

1. **智能投注选项**: 100, 500, 1000, 5000, 10000, 20000
   - 最大基础投注20000（5倍率时刚好10万）
2. **动态UI显示**: 根据倍率显示最大允许投注提示
3. **智能验证**: 考虑倍率的前端投注验证
4. **友好错误提示**: 提供具体的改进建议

## 后端更新内容

1. **双重验证**: 基础投注 + 倍率验证
2. **智能错误响应**: 包含具体数值和改进建议
3. **倍率范围检查**: 限制倍率在1-5之间
4. **实际投注计算**: 所有计算基于总投注金额

## 安全保障

- **前后端双重验证**: 确保用户无法绕过限制
- **智能提示**: 帮助用户理解限制原因和解决方法
- **响应式设计**: 适应不同倍率的投注需求