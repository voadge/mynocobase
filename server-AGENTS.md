# AGENTS.md — NocoBase 生产服务器工作规范

> 服务器：`ubuntu@110.42.236.231`　部署目录：`/opt/noco-base`　访问：`https://voadge.top:668`

## 核心原则：服务器是唯一数据源
本地 Git 仓库仅作备份快照。正确流程：**服务器修改 → 浏览器验证 → `sync-from-server.ps1` 拉回 → git commit**。
严禁在本地新增/修改插件代码后直接部署；严禁以本地编辑 `nginx.conf` / `docker-compose.yml` 作为修改手段。

## 工作目录约定
| 目录 | 用途 |
|---|---|
| `/opt/noco-base/` | 部署根（源码、脚本、配置） |
| `/opt/noco-base/nocobase-plugin-<name>/` | 插件源码与构建产物（宿主） |
| `/opt/noco-base/storage/plugins/@nocobase/<name>/` | 自定义插件**加载路径**（app 启动时扫描） |
| `/opt/noco-base/storage/approval/` | 审批桌面 SPA（index.html + assets/） |
| `/opt/noco-base/nginx.conf` | **nginx 生效配置**（只读挂载进 nginx-proxy） |
| `/opt/noco-base/storage/nocobase.conf` | 历史配置源（可能滞后于 nginx.conf） |
| `/opt/noco-base/secrets/db_password.txt` | 数据库密码（psql 用） |

## 插件加载四步法（以 approval-cn 为例）
1. **拷代码**：`docker cp` 到容器 `node_modules/@nocobase/<name>/`；`sudo cp` 到 `storage/plugins/@nocobase/<name>/`
2. **SQL 注册**：`docker exec noco-base-postgres-1 psql -U nocobase -d nocobase` 插入 `applicationPlugins`
3. **nginx 重写**：编辑 `/opt/noco-base/nginx.conf` 加 location（`nginx -t` 先验证）
4. **reload**：`docker restart noco-base-app-1`；`docker exec noco-base-nginx-proxy-1 nginx -s reload`

> 关键容器：`noco-base-app-1`（Gateway `127.0.0.1:13000`，psql 不在这里）、`noco-base-postgres-1`（psql/DB 操作）、`noco-base-nginx-proxy-1`。

## 脚本
- `nocobase.ps1`：MCP/API 调用包装（需 `$env:NOCOBASE_TOKEN`）
- `sync-from-server.ps1`：从服务器同步文件回本地备份

## 修改边界
- **宿主改**：插件源码、nginx.conf、storage 静态资源、AGENTS 等文档
- **容器内改**：仅临时验证；改动需落回宿主
- **禁止**：本地改插件后直接推送部署；本地改 nginx/docker-compose 作为修改手段

## 审批语义（源码已证实，勿改）
- manual 节点 `config.mode`：`0`=任一提交即定（默认）、`1`=会签（全过才过/任一拒即拒）、`-1`=或签（任一过即过/全拒才拒）
- 任务提交：`POST /api/workflowManualTasks:submit/:taskId`，body `{result:{[formKey]:{...}, _:actionKey}}`
- 我的待办：`GET /api/workflowManualTasks:listMine`（ACL loggedIn，按当前用户）
- TASK_STATUS：`0`=pending、`1`=resolved、`-3`=aborted、`-5`=rejected
- 内部表：`flow_nodes`（节点链）、`executions`（context.data=业务快照）、`jobs`（每节点状态）——仅 server 端 sequelize 读，非公开资源

## 审批插件 API（@nocobase/plugin-approval-cn，已上线）
| 端点 | 说明 |
|---|---|
| `GET /approval/` | 桌面 SPA（nginx auth_request 鉴权，401→/approval/→200） |
| `GET /api/__appr__/desk` | 我的待办（userId+status=0，紧凑业务摘要） |
| `GET /api/__appr__/detail/:taskId` | 文件详情：任务/节点/业务快照/流程拓扑(jobs 状态) |
| `GET /api/__appr__/ping` / `assets/*` | 健康检查 / SPA 静态资源 |
| `GET /api/__appr_auth_check__` | nginx auth_request 鉴权端点 |
| `POST /api/approval_templates:start/:templateId` | 手动发起审批（创建业务记录+触发工作流，body `{collection,data}`） |
| `POST /api/approval_templates:bind/:id` | 模板绑定 workflowId+targetCollections+trigger |
| `approval_templates:list/create/get/update/destroy` | 模板 CRUD（list/get=loggedIn，写=admin） |
| `approval_audit_logs` | 审批操作审计（workflowManualTasks.afterUpdate 监听自动写入） |

## 审批插件验证清单
- `/approval/` 未登录 → 401；带有效 token → 200（SPA）
- `/api/__appr__/desk`、`/detail/:id`、`/ping`、`/api/__appr_auth_check__` → 200
- 日志含 `[approval-cn] plugin loaded`
- 表：`approval_templates`、`approval_audit_logs`

## 范围决策（勿回退）
- 桌面 = 个人待办（`status=0` 且指派给我）；会签/或签=原生 `mode`
- 存量 13 启用流程 / 76 pending 不改造；新流程在 v1 编辑器（删地址栏 /v）配 manual 节点
- 顺序「前位未签→后序可见不可签」：由 SPA 读 `flow_nodes`+`jobs` 推导（无 job 且位于 active 之后 = locked）
- 委托/加签/超时提醒/抄送中心 = v1.1（未排入本插件 P0-P3）