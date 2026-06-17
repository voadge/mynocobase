# Plan A: 部门 ACL 双控体系 + CI/CD 自动化部署

## 核心策略
**当前插件架构 + 自动化流水线** — 保持现有代码结构，通过 CI/CD 将「重新部署」降级为「推送代码自动发生」。

---

## 实施清单

### P0 基础设施（先行）
- [ ] GitHub Actions / 自建 CI 配置 `build → scp → docker restart`
- [ ] 锁定 `peerDependencies: "@nocobase/server": "2.x"`
- [ ] 提取 `department-acl.ts` 核心逻辑为可测试纯函数

### P1 数据模型
- [ ] `projects` 表加 `departmentId` 字段 + 回填脚本
- [ ] `department_acl_rules` 扩展字段：`scopeType`, `globalDataScope`, `appliesToChildren`
- [ ] 新建 `department_role_mappings` 集合
- [ ] 迁移脚本：现有 3 条规则 → 新结构

### P2 核心中间件重构 (`department-acl.ts`)
- [ ] Phase 1: 部门 ACL 匹配（支持 `resourceName='*'` 全局规则）
- [ ] Phase 2: 原生角色 ACL 兜底
- [ ] Phase 3: 合并策略（部门优先、角色兜底、filter $and 合并）
- [ ] 模板变量解析器：`{{ $user.xxx }}`, `{{ $dept.xxx }}`
- [ ] 全局 dataScope 合并器
- [ ] 用户上下文增强：`projectIds[]`, `deptChildrenIds[]`

### P3 管理界面 (`dept-admin-pages.ts`, `dept-admin-api.ts`)
- [ ] 全局规则编辑器（JSON 编辑 + 预设模板）
- [ ] 资源级规则编辑器（现有优化）
- [ ] 部门角色映射管理
- [ ] 预设按钮动态显隐（按目标表字段）

### P4 前端上下文 API
- [ ] `GET /api/__da__/acl-context` 返回用户部门树、projectIds、已解析 globalDataScope
- [ ] 仪表盘区块联动接入
- [ ] 表单字段联动接入

### P5 验收
- [ ] 场景：陈瑞/工程部 → briefings 仅见自己项目
- [ ] 场景：HR/行政部 → projects 仅见本部门
- [ ] 场景：领导层 → 全量可见，忽略角色 ACL
- [ ] 场景：无部门规则用户 → 回退角色 ACL
- [ ] 场景：部门规则 deny → 直接 403

---

## 升级后标准操作

```bash
# 1. 升级 NocoBase 核心
npm update @nocobase/server

# 2. 推送代码触发 CI/CD（或手动跑 workflow）
git push origin main

# 3. 自动完成：build → 部署 → 重启 → 验证
# 全程 < 2 分钟，零手工
```

---

## 风险控制

| 风险 | 缓解 |
|------|------|
| NocoBase 2.x → 3.x 破坏性 API 变更 | 仅依赖公开 API (`app.acl.use`, `db.collection`, `ctx.permission`)；单测覆盖核心逻辑 |
| 插件编译失败 | CI 阶段跑 `npm run build` 必须通过 |
| 数据库迁移回滚 | 每次迁移前自动备份 PG dump |

---

## 里程碑

| 里程碑 | 交付物 | 预估 |
|--------|--------|------|
| M1 基建就绪 | CI/CD 跑通、peerDependency 锁定 | 0.5h |
| M2 数据层就绪 | 表结构、迁移脚本、回填完成 | 1h |
| M3 核心管道就绪 | Phase 1-3 逻辑、模板解析、上下文增强 | 4h |
| M4 管理界面就绪 | 全局/资源级规则编辑、部门角色映射 | 2.5h |
| M5 前端联动就绪 | acl-context API、仪表盘/表单接入 | 1.5h |
| M6 验收通过 | 5 核心场景全绿 | 1h |

**总计约 10.5h**

---

## 备选方案（Plan B/C/D 备忘）

| Plan | 核心思路 | 适用场景 |
|------|----------|----------|
| B | PostgreSQL RLS | 数据安全合规要求极高、有 DBA 维护 |
| C | API 网关层 | 微服务架构、统一网关治理 |
| D | 独立微服务 | 权限逻辑极复杂、多业务系统共享 |

---

> **状态**：Plan A 确认为主线方案，进入实施阶段。