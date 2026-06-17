# Plan B：原生 ACL + 最小扩展（升级免疫方案）

> **基于可行性验证报告修订** · 验证日期：2026-06-14 · NocoBase 2.1.0 ✅
> 详见 [`PLAN-B-FEASIBILITY.md`](./PLAN-B-FEASIBILITY.md)

## 核心思路

**不建并行体系，完全复用 NocoBase 原生 ACL**，仅做两件事：
1. 给 `users` 表加计算字段，让 `$user.departmentIds`、`$user.childDepartmentIds` 可用
2. 在 `rolesResourcesScopes.scope` 中存储 filter 模板，由原生 ACL 管道自动解析注入

---

## 可行性验证确认

| # | 前提条件 | 验证结果 | 证据位置 |
|---|----------|----------|----------|
| 1 | `parseJsonTemplate` 存在 | ✅ 已验证 | `@nocobase/acl` 导出为 function |
| 2 | `createUserProvider` 存在 | ✅ 已验证 | 同上，ACL 中间件核心依赖 |
| 3 | `parseFilter` 存在 | ✅ 已验证 | `@nocobase/utils` 导出 |
| 4 | `setDepartmentsInfo` 注入 `departments` | ✅ 已验证 | 源码确认注入 `ctx.state.currentUser.departments` |
| 5 | `ctx.state.currentUser.mainDepartmentId` | ✅ 已验证 | 原生字段已存在 |
| 6 | `ctx.state.attachRoles` | ✅ 已验证 | 部门插件注入 |
| 7 | `rolesResourcesScopes.scope` 为 json 列 | ✅ 已验证 | 当前为空，待配置 |
| 8 | `rolesResourcesActions.scopeId` FK | ✅ 已验证 | 指向 `rolesResourcesScopes` |
| 9 | `projects.departmentId` | ❌ 需新增 | P0 数据库变更 |
| 10 | `users.departmentIds`/`childDepartmentIds` (virtual) | ❌ 需新增 | P0 计算字段 |

**结论：核心前提 1-8 全部验证通过，仅需补充 2 个数据库字段即可实施。**

---

## 架构图

```
用户登录
    ↓
部门插件 setDepartmentsInfo 中间件
    ↓ 注入
ctx.state.currentUser = {
  id, username,
  mainDepartmentId,           ← ✅ 原生字段（已验证存在）
  departments: [...],         ← ✅ 已验证注入
  attachRoles: [...],         ← ✅ 已验证注入
  departmentIds: [...],       ← 【M0 计算字段】
  childDepartmentIds: [...]   ← 【M0 计算字段】
}
    ↓
NocoBase ACL 中间件
    ↓ 读取
rolesResourcesActions.scopeId → rolesResourcesScopes.scope (json)
    ↓
scope = { "departmentId": { "$in": "$user.childDepartmentIds" } }
    ↓ 解析
parseJsonTemplate(scope, { $user: userProvider, $nRole: roleName })
    ↓ 输出（确认链路完整，详见 FEASIBILITY.md Part 4）
最终 filter = { "departmentId": { "$in": [366, 367, 101] } }
    ↓
mergeParams → SQL WHERE departmentId IN (...)
```

---

## 实施清单

### M0 用户上下文计算字段（核心，~1h）✅ 链路已验证

在 `index.ts` 的 `load()` 中，给 `users` 集合注册 2 个计算字段（`users` 集合 API 已验证可用）：

```typescript
// 1. departmentIds：用户所属所有部门 ID
//    优先从 ctx.state.currentUser.departments 取（已验证注入），减少 DB 查询
usersCol.addField('departmentIds', {
  type: 'virtual',
  async value(user, ctx) {
    const departments = ctx?.state?.currentUser?.departments;
    if (departments) return departments.map(d => d.id);
    // fallback：直接从数据库查（计算字段首次初始化时使用）
    const dus = await ctx.db.getRepository('departmentsUsers').find({
      filter: { userId: user.id },
      fields: ['departmentId']
    });
    return dus.map(d => d.departmentId);
  }
});

// 2. childDepartmentIds：用户所属部门 + 所有子部门 ID（递归）
usersCol.addField('childDepartmentIds', {
  type: 'virtual',
  async value(user, ctx) {
    const deptIds = user.departmentIds || [];
    const allIds = new Set(deptIds);
    const queue = [...deptIds];
    // 递归查子部门（深度不限）
    while (queue.length) {
      const pid = queue.shift();
      const children = await ctx.db.getRepository('departments').find({
        filter: { parentId: pid },
        fields: ['id']
      });
      for (const c of children) {
        if (!allIds.has(c.id)) { allIds.add(c.id); queue.push(c.id); }
      }
    }
    return Array.from(allIds);
  }
});
```

### M1 管理界面配置（~1h）✅ scope 列已验证

`rolesResourcesScopes.scope` 为 json 列（已验证存在，当前为空），直接在原生 UI 操作：

进入 **系统设置 → 角色管理 → 权限配置**，每行对应的数据范围选「自定义」→ 填入 filter 模板 JSON。

**推荐 scope 模板配置：**

| 角色 | 资源 | 操作 | 数据范围（scope JSON） |
|------|------|------|------------------------|
| 工程部成员 | projects | list, get | `{ "departmentId": { "$in": "$user.childDepartmentIds" } }` |
| 工程部成员 | briefings | list, get | `{ "project_id": { "$in": "$user.accessibleProjectIds" } }`（需 M1b） |
| 行政部成员 | attendance_records | list, get | `{ "departmentId": { "$in": "$user.childDepartmentIds" } }` |
| 领导层 | * | * | `{}` (全部数据) |
| 普通员工 | * | list, get | `{ "createdById": "$user.id" }` |

> **注意**：briefings 的 `accessibleProjectIds` 需注册额外计算字段（见 M1b），或直接用 `$user.childDepartmentIds` + 通过 `projects.departmentId` 间接过滤（需 briefings 表有 `project_id` 关联）。

### M1b 跨表计算字段（可选，0.5h）

若 briefing 需要按部门过滤（briefings → projects → departments），注册计算字段：

```typescript
usersCol.addField('accessibleProjectIds', {
  type: 'virtual',
  async value(user, ctx) {
    const deptIds = await user.childDepartmentIds;
    if (!deptIds?.length) return [];
    const projects = await ctx.db.getRepository('projects').find({
      filter: { departmentId: { $in: deptIds } },
      fields: ['id']
    });
    return projects.map(p => p.id);
  }
});
```

scope 模板：`{ "project_id": { "$in": "$user.accessibleProjectIds" } }`

### M2 项目 departmentId 字段（~0.5h）⚠️ 经验证缺失，P0 必做

```sql
ALTER TABLE projects ADD COLUMN "departmentId" BIGINT REFERENCES departments(id);
-- 回填：按项目负责人所在部门（取第一个匹配的部门）
UPDATE projects p
SET "departmentId" = du."departmentId"
FROM departments_users du
WHERE p."ownerId" = du."userId" AND p."departmentId" IS NULL;

-- 验证回填
SELECT COUNT(*) FROM projects WHERE "departmentId" IS NULL;
```

### M3 前端上下文 API（~0.5h，P2 可选但推荐）

`ctx.state.currentUser.departments`（已验证注入）和 `ctx.state.attachRoles`（已验证注入）可直接从已存在的 `GET /api/users:check` 响应中获取，不一定要新建端点。如需定制：

```typescript
// GET /api/__da__/acl-context
app.use(async (ctx, next) => {
  if (ctx.method !== 'GET' || ctx.state.reqPath !== '/__da__/acl-context') return next();
  const user = ctx.state.currentUser;
  ctx.body = {
    user: {
      id: user.id,
      mainDepartmentId: user.mainDepartmentId,
      departmentIds: user.departments?.map(d => d.id) || [],
      departments: user.departments || [],
    },
    attachRoles: ctx.state.attachRoles || [],
  };
});
```

### M4 联动事件总线（~0.5h，P2 可选）

```typescript
// 前端通用 Hook
function useDeptContext() {
  const [ctx, setCtx] = useState(null);
  useEffect(() => {
    fetch('/api/__da__/acl-context', { credentials: 'same-origin' })
      .then(r => r.json()).then(setCtx);
  }, []);
  return ctx;
}

// 字段联动：选部门 → 刷新区块 filter
<Form.Field
  name="departmentId"
  onChange={(deptId) => {
    const rootId = findDeptRoot(deptId, ctx.user.departments);
    block.setFilter({ departmentId: { $in: getDeptSubtree(rootId, ctx.user.departments) } });
  }}
/>

// 区块联动：切部门 → 刷新所有区块
<Block.Provider onDeptChange={(deptId) => {
  dashboardBlocks.forEach(b => b.refresh({ deptId }));
}} />
```

---

## 关键问题：`$user.xxx` 模板解析链路（已验证完整）

### 答案：能 ✅ 链路已完整验证（见 FEASIBILITY.md Part 4）

NocoBase `parseJsonTemplate` 解析逻辑（已验证存在于 `@nocobase/acl`）：
```js
vars: {
  $user: userProvider,  // 异步函数 → db.getRepository('users').findOne(...)
  $nRole: () => state.currentRole
}
```

**条件**：`$user.xxx` 中的 `xxx` 必须是 `users` 表上存在的字段（包括计算字段/virtual）。

| 模板变量 | 是否可用 | 原因 |
|----------|----------|------|
| `$user.id` | ✅ | 原生字段 |
| `$user.mainDepartmentId` | ✅ | 原生字段（部门插件维护，已验证） |
| `$user.departmentIds` | ✅ | **M0 新增计算字段** |
| `$user.childDepartmentIds` | ✅ | **M0 新增计算字段** |
| `$user.accessibleProjectIds` | ✅ | **M1b 新增计算字段**（跨表预计算） |

### 跨表过滤解决方案（briefings → projects → departments）

NocoBase filter 不支持跨表 join，已验证需通过计算字段预展开。已移至 **M1b** 实施。

> **方案 B（Redis 缓存）仅在性能实测成为瓶颈时考虑，初始实施不引入额外基础设施。**

---

## 升级免疫验证 ✅ 已验证

| 组件 | 升级后行为 | 风险 |
|------|------------|------|
| `rolesResources.filter` | ✅ 原生存储，不受升级影响 | 零 |
| `parseJsonTemplate` | ✅ NocoBase 核心，API 稳定 | 极低 |
| `setDepartmentsInfo` 中间件 | ✅ 部门插件内置 | 极低 |
| M0 计算字段 | ⚠️ 依赖 `users` 集合 API 稳定性 | 低 |
| M3 上下文 API | ⚠️ 依赖 `ctx.state.currentUser` 结构 | 低 |

**结论：仅 M0/M3 有极低风险，且可快速修复。**

---

## 迁移 Plan A 既有数据

Plan A 未部署，无数据迁移需求。"迁移 Plan A 既有数据" 章节已删除。

---

## 验收场景

| 场景 | 操作 | 预期结果 |
|------|------|----------|
| 1. 工程部陈瑞登录 | 访问 briefings:list | 仅见自己项目简报 |
| 2. 工程部陈瑞登录 | 访问 projects:list | 仅见工程部项目 |
| 3. 行政部 HR 登录 | 访问 attendance_records:list | 仅见行政部考勤 |
| 4. 领导层登录 | 访问任意资源 | 全量可见 |
| 5. 陈瑞访问 projects:create | 新建按钮 | ✅ 可见（工程部有 create 权限） |
| 6. HR 访问 projects:create | 新建按钮 | ❌ 不可见（HR 角色无 create 权限） |
| 7. 审批工作流 | 提交考勤 → 部门负责人审批 | 自动匹配部门负责人 |
| 8. 仪表盘切部门 | 选择工程部 | 图表/区块刷新为工程部数据 |

---

## 审批工作流节点审批人自动匹配

### 现有审批路由表结构

```sql
department_approval_routes {
  id, name, levelKey, mode, departmentId, roleId, enabled
}
```

### 节点审批人匹配逻辑

```typescript
// 工作流节点配置示例：
{
  "node": "部门负责人审批",
  "approverSource": "expression",
  "expression": "{{ $dept.managerId }}"  // 从 ctx.state.currentUser.departments 取
}

{
  "node": "分管领导审批",
  "approverSource": "expression",
  "expression": "{{ $dept.divisionLeaderId }}"
}

{
  "node": "总经理审批",
  "approverSource": "role",
  "roleName": "总经理"  // 原生角色匹配
}

{
  "node": "董事长审批",
  "approverSource": "role",
  "roleName": "董事长"
}
```

### 实现方式

1. **使用现有字段**：`departmentsUsers.is_manager_in_charge`（已验证存在）代替新增 `departments.manager_id`；如需分管领导，用 `is_person_in_charge` 或新增 `departments.division_leader_id`
2. **部门插件已注入**：`ctx.state.currentUser.departments`（已验证）包含每个部门的完整信息（含角色/负责人标志）
3. **工作流节点**：读取当前用户的部门信息，按 `levelKey` 匹配审批路由，自动确定审批人

### 审批路由匹配流程

```
提交审批
    ↓
读取当前用户 departments
    ↓
按 levelKey 匹配 department_approval_routes
    ↓
  ├─ mode='dept' → 取 departmentId 下 departmentsUsers 中 is_manager_in_charge=true 的用户
  ├─ mode='dept_and_role' → 取 departmentId + roleId 匹配的用户
  └─ mode='role' → 取角色为 role 的用户
    ↓
自动创建审批任务，分配给匹配的审批人
```

---

## 风险与缓解

| 风险 | 缓解措施 |
|------|----------|
| 计算字段性能（递归查子部门） | 物化路径字段 `deptPath`，避免运行时递归；或 `childDepartmentIds` 加 cache |
| `$user.accessibleProjectIds` 跨表查询 | 单表过滤优先（projects.departmentId），briefings 用预计算字段 |
| 管理员不熟悉 JSON filter 模板 | 提供预设模板选择器（下拉菜单选「本部门」「仅自己」「全部」） |

---

## P0/P1/P2 实施计划（基于可行性验证，总计 ~4h）

| 优先级 | 里程碑 | 交付物 | 预估 | 依赖 |
|--------|--------|--------|------|------|
| **P0** | M2 | `projects.departmentId` 加字段 + 回填 | 0.5h | — |
| **P0** | M0 | users 计算字段：`departmentIds` + `childDepartmentIds` | 1h | — |
| **P1** | M1 | 管理界面配置 scope 模板（3 角色 × 2 资源） | 1h | M0, M2 |
| **P1** | M1b | `accessibleProjectIds` 计算字段（跨表） | 0.5h | M0 |
| **P2** | M3 | `/api/__da__/acl-context` 接口 | 0.5h | M0 |
| **P2** | M4 | 前端联动 Hook + 事件总线 | 0.5h | M3 |
| **验收** | M5 | 端到端验收：陈瑞/工程部/简报/审批 | 1h | 全部 |

**总计约 4h**（P0+P1 核心路径 ~3h，P2 可选 +1h）

---

> **状态**：Plan B 确认为主线方案，可行性已验证。详见 [`PLAN-B-FEASIBILITY.md`](./PLAN-B-FEASIBILITY.md)。
