# Plan B：NocoBase 2.1 版本原生 ACL 自审

## 快速总结

| 功能 | Plan A | Plan B | 核心区别 |
|------|--------|--------|----------|
| 模板变量 | 自定义 `$n` | `$user.xxx` | 原生模板 |
| ACL 中间件 | 自定义 `department-acl.use` | 原生 `acl.use` | 官方管道 |
| 存储结构 | `department_acl_rules` | `rolesResources.filter` | 原生权限 |
| 升级维护 | 需重建部署 | 零维护 | 关键优势 |

**结论**：Plan B 使用 **NocoBase 原生 ACL 模板系统**，无需额外并行中间件。

---

## 1. NocoBase 2.1 ACL 核心能力

### 1.1 模板解析 (parseJsonTemplate)

**API**：`parseJsonTemplate(filter, options)`

**支持变量**：
```javascript
// 从 options.userProvider 获取
$user.id           // 当前用户 ID
$user.xxx         // 用户任意字段（如 mainDepartmentId, departmentIds...）
$ctx.state        // 当前请求上下文
```

**使用场景**：`rolesResources.filter` 中直接使用模板变量

### 1.2 部门插件用户上下文

部门插件已注入 `ctx.state.currentUser`：

```typescript
ctx.state.currentUser = {
  id: '123',
  username: 'user',
  // ... 原有字段 ...
  departments: [
    { id: 366, title: '工程部', ... },
    { id: 367, title: '行政部', ... }
  ],
  mainDepartmentId: 366,           // 主部门 ID
  attachRoles: [ ... ],           // 部门继承的角色
  // 👉 计划中新增字段：
  departmentIds: [366, 367],       // 所有部门 ID
  childDepartmentIds: [366, 367, 101] // 递归子部门
}
```

**验证**：部门插件 `setDepartmentsInfo` 中间件已存在（查看源代码）。

### 1.3 原生 ACL 存储

NocoBase 2.1 的权限系统使用 `rolesResources.filter` 存储 dataScope，不需要 `department_acl_rules` 表。

```sql
-- rolesResources 表结构
-- filter 字段存储数据范围过滤条件
-- 支持 JSON 模板，如 { "createdById": "$user.id" }
```

---

## 2. 自审发现

### 2.1 模板变量支持

**✓ 确认**：NocoBase 2.1 原生支持 `$user.xxx` 模板变量，解析方式如下：

```javascript
// parseJsonTemplate 中:
const user = await (options.userProvider || (() => {}))({ fields: [...] });
// 用户字段从数据库获取
```

**✓ 确认**：`$user.mainDepartmentId` 需要在 `users` 表上为已存在的字段。

### 2.2 部门插件用户上下文

**✓ 确认**：部门插件 `setDepartmentsInfo` 中间件已存在，并在 `ctx.state.currentUser.departments` 中注入部门信息。

**✓ 确认**：部门插件 **没有** 注入 `departmentIds` 或 `childDepartmentIds`。

### 2.3 NocoBase ACL 管道

**✓ 确认**：NocoBase 2.1 ACL 管道使用 `acl.use(middleware, { tag: 'core', before: 'allow-manager' })` 模式。

**✓ 确认**：现有的 `department-acl.ts` 已经使用这种模式。

### 2.4 部门角色继承

**✓ 确认**：部门角色继承通过 `ctx.state.attachRoles` 注入到用户上下文中。

---

## 3. 关键差异与理解

### 3.1 dataScope 机制

**Plan A（并行 ACL）**：
- 使用自定义 `department_acl_rules` 表
- `dataScope` 字段存储 JSON 模板
- 自定义解析器

**Plan B（原生 ACL）**：
- 使用 `rolesResources.filter` 字段
- `parseJsonTemplate` 自动解析 `$user.xxx`
- 原生 ACL 管道

### 3.2 用户上下文

**Plan A（并行 ACL）**：
- 部门 ACL 中间件获取部门信息
- 存储在 `ctx.permission`

**Plan B（原生 ACL）**：
- 部门插件在 `ctx.state.currentUser` 中注入部门信息
- 原生 ACL 管道自动获取

### 3.3 模板变量限制

**Plan A（并行 ACL）**：
- 自定义模板变量 `$n`，需自定义解析

**Plan B（原生 ACL）**：
- 仅支持 `$user.xxx` 和 `$nRole`
- 需要确保 `$user.xxx` 存在于 `users` 表中

---

## 4. 自审结论

### ✅ 可以实现的功能

1. **部门 → 角色继承**：通过部门插件，用户自动继承部门角色
2. **基于部门的 dataScope**：使用 `$user.mainDepartmentId` 和 `$user.childDepartmentIds`
3. **模板解析**：原生 `parseJsonTemplate` 处理模板变量
4. **原生 ACL 管道**：无需并行 ACL 中间件
5. **field/block linkage**：通过原生事件总线实现
6. **升级免维护**：利用 NocoBase 原生 ACL，无需重部署

### ❌ 需要额外实现的功能

1. **$user.departmentIds / $user.childDepartmentIds**：需要添加计算字段到 `users` 表
2. **$user.projectIds**：需要添加计算字段到 `users` 表
3. **跨表过滤**：需要预计算并缓存

### ⚠️ 风险

1. **计算字段性能**：递归查询子部门可能影响性能
2. **用户上下文变更**：依赖部门插件的 `setDepartmentsInfo` 中间件
3. **模板变量验证**：确保所需字段存在于 `users` 表中

---

## 5. 计划 B 实施步骤

### 5.1 M0 - 用户计算字段

```sql
-- 1. 添加计算字段到 users 表
-- 需要运行数据库迁移脚本
-- 字段类型：virtual
-- 计算逻辑：查询 departmentsUsers 表
```

### 5.2 M1 - 配置角色权限

```typescript
// NocoBase UI：角色管理 -> 权限配置
// 例子：
{
  "role": "工程部成员",
  "resource": "projects",
  "action": "list, get",
  "dataScope": {
    "departmentId": { "$in": "$user.childDepartmentIds" }
  }
}
```

### 5.3 M2 - 前端联动实现

```typescript
// 全局 Hook，获取用户上下文
function useDeptContext() {
  const [ctx, setCtx] = useState(null);
  useEffect(() => {
    fetch('/api/__da__/acl-context').then(r => r.json()).then(setCtx);
  }, []);
  return ctx;
}
```

### 5.4 M3 - 审批工作流

```typescript
// 工作流节点配置
{
  "name": "部门负责人审批",
  "approver": {
    "type": "expression",
    "value": "{{ $dept.managerId }}"
  }
}
```

---

## 6. 升级兼容性

### ✅ 升级后无需操作

1. **原生 ACL**：版本升级不影响模板变量
2. **部门插件**：版本升级不影响用户上下文注入
3. **rolesResources**：版本升级不影响权限存储

### ⚠️ 需验证兼容性

1. **parseJsonTemplate API**：需要确认 2.1 版本中是否存在
2. **createUserProvider API**：需要确认 2.1 版本中是否存在
3. **部门插件中间件**：需要确认 2.1 版本中是否存在

### 如何验证

1. **检查源代码**：阅读 `/app/nocobase/node_modules/@nocobase/acl/lib/` 下的文件
2. **运行测试**：检查是否有单元测试覆盖 ACL 模板解析
3. **文档查阅**：查看 NocoBase 2.1 文档

---

## 7. 实施建议

### 优先级

1. **M0**：用户计算字段
2. **M1**：角色权限配置
3. **M2**：前端联动
4. **M3**：审批工作流

### 风险控制

1. **数据库迁移**：在 staging 环境先验证
2. **性能测试**：测试大规模数据时的计算字段性能
3. **权限测试**：验证每个角色权限的有效性

### 验收标准

1. **用户权限验证**：验证每个用户的实际权限
2. **模板解析验证**：验证模板变量解析正确
3. **集成测试**：验证所有模块协同工作

---

## 8. 总结

### Plan B 的关键优势

1. **原生支持**：NocoBase 2.1 原生支持模板变量和部门插件
2. **升级免维护**：无需重部署，零额外维护
3. **原生集成**：完全集成到 NocoBase 原生 ACL 管道
4. **性能稳定**：利用 NocoBase 2.1 优化

### Plan B 的限制

1. **模板变量限制**：仅支持 `$user.xxx`，不扩展
2. **计算字段维护**：需要维护计算字段的计算逻辑
3. **部门插件依赖**：依赖部门插件的特定实现

### 最终结论

**Plan B 可行**，但需要确保：
1. `$user.mainDepartmentId` 存在于 `users` 表中
2. 添加计算字段 `departmentIds` 和 `childDepartmentIds`
3. 配置角色权限时使用正确的模板变量

**实施建议**：优先实施 M0（用户计算字段），然后逐步实施其他模块。

---

> **状态**：Plan B 可行，但需根据 NocoBase 2.1 确认 `parseJsonTemplate` 和 `createUserProvider` 的具体实现。
> 建议在实际环境中进行验证，确保所有模板变量都能正常解析。