# 施工日志序列号设置文档

## 1. 概述

本文档描述施工日志流水号的生成机制，包括数据库序列管理、API 端点、工作流脚本配置。

## 2. 序列号格式

```
SG-{项目拼音缩写}{YYYYMMDD}{3位流水号}

示例：
- SG-AA20260728001  （项目AA，2026年7月28日，第1条）
- SG-AA20260728002  （项目AA，2026年7月28日，第2条）
- SG-BB20260728001  （项目BB，2026年7月28日，第1条）
```

## 3. 数据库序列表

### 3.1 表名：`sys_serial_counters`

**表结构（新增字段后）：**

| 字段 | 类型 | 说明 |
|------|------|------|
| id | bigint | 主键 |
| prefix | varchar(255) | 前缀（如 SG） |
| date_str | varchar(8) | 日期（YYYYMMDD） |
| project_id | bigint | 项目ID |
| current_seq | integer | 当前序列号 |
| module | varchar(255) | 模块名 |
| createdAt | timestamptz | 创建时间 |
| updatedAt | timestamptz | 更新时间 |

**唯一约束：**
```sql
ALTER TABLE sys_serial_counters 
ADD CONSTRAINT uk_sys_serial_counters_prefix_date_project 
UNIQUE (prefix, date_str, project_id);
```

### 3.2 原子递增函数

```sql
CREATE OR REPLACE FUNCTION get_next_serial(p_prefix VARCHAR, p_date_str VARCHAR, p_project_id BIGINT)
RETURNS INT AS $$
DECLARE
  v_seq INT;
BEGIN
  INSERT INTO sys_serial_counters (id, prefix, date_str, project_id, current_seq, module, "createdAt", "updatedAt")
  VALUES (
    (SELECT COALESCE(MAX(id), 0) + 1 FROM sys_serial_counters),
    p_prefix, p_date_str, p_project_id, 1, 'construction_daily', NOW(), NOW()
  )
  ON CONFLICT (prefix, date_str, project_id) 
  DO UPDATE SET current_seq = sys_serial_counters.current_seq + 1, "updatedAt" = NOW()
  RETURNING current_seq INTO v_seq;
  
  RETURN v_seq;
END;
$$ LANGUAGE plpgsql;
```

**特性：**
- 按 `prefix + date_str + project_id` 独立计数
- 原子递增（PostgreSQL UPSERT/ON CONFLICT）
- 每天每个项目独立编号，互不干扰

## 4. API 端点

### 4.1 获取下一个流水号

**端点：** `GET /api/__pd__/next-serial`

**参数：**

| 参数 | 必填 | 说明 |
|------|------|------|
| prefix | 否 | 前缀，默认 SG |
| date | 是 | 日期 YYYYMMDD |
| project_id | 是 | 项目ID |

**示例：**
```bash
curl "http://127.0.0.1:13000/api/__pd__/next-serial?prefix=SG&date=20260728&project_id=1"
```

**返回：**
```json
{
  "code": 0,
  "data": {
    "prefix": "SG",
    "date": "20260728",
    "project_id": 1,
    "seq": 3
  }
}
```

### 4.2 批量创建施工日志和简报

**端点：** `POST /api/__pd__/batch-create-logs`

**用途：** TIMER-2 定时任务调用，汇总 entries 后批量创建 construction_daily_log 和 briefings

**请求体：**
```json
{
  "summaries": [
    {
      "projectId": 1,
      "entryCount": 5,
      "workerCount": 3,
      "weather": "晴,多云",
      "summaryDate": "2026-07-28"
    }
  ]
}
```

**返回：**
```json
{
  "code": 0,
  "data": {
    "created": 1,
    "logs": [{"id": 100, "project_id": 1, "created": true}],
    "briefings": [{"id": 200, "project_id": 1, "created": true}]
  }
}
```

**内部逻辑：**
1. 按 project_id + summaryDate 查找是否已有 log，有则跳过
2. 创建 construction_daily_log（状态：待审核）
3. 查找是否已有 briefing（type=construction_daily），有则跳过
4. 创建 briefings（type=construction_daily）
5. 关联 entries 到 log（更新 log_id）

## 5. 工作流配置

### 5.1 WF-SERIAL-CONSTRUCTION（施工日志编号生成）

**触发：** construction_daily_entries 表 mode 1 (after save)

**节点链：**
```
script(br0wmkoi5sd) → update(k63s5o4g97w)
```

**脚本逻辑：**
1. 取 `entry_date` 作为业务日期（如未填则取当前日期）
2. 通过 pinyin-pro 将 `project_name` 转为拼音首字母（大写，取前2位）
3. 调用 `/api/__pd__/next-serial` 获取自增流水号
4. 组合格式：`SG-{initials}{date}{seq}`
5. update 节点将 entry_no 写入当前记录（filter: `{"id": "{{$context.data.id}}"}`）

**脚本源码（关键片段）：**
```javascript
var date = $context.data.entry_date ? new Date($context.data.entry_date) : new Date();
var datePart = String(date.getFullYear()) + String(date.getMonth() + 1).padStart(2, '0') + String(date.getDate()).padStart(2, '0');
var proj = $context.data.project_id_id;
var projId = proj ? proj.id : ($context.data.project_id || '');
// ... 拼音转换 ...
var http = require('http');
var serial = await new Promise(function(resolve) {
  http.get('http://127.0.0.1:13000/api/__pd__/next-serial?prefix=SG&date=' + datePart + '&project_id=' + projId, function(res) {
    // ... 解析返回 seq ...
  });
});
if (!serial) serial = '001';
return 'SG-' + initials + datePart + serial;
```

### 5.2 WF-SERIAL-LOG（施工日志编号生成）

**触发：** construction_daily_log 表 mode 1 (after save)

**节点链：**
```
script(script_log_no) → update(update_log_no)
```

**与 WF-SERIAL-CONSTRUCTION 区别：**
- 业务日期取 `log_date`
- 更新字段为 `log_no`

### 5.3 WF-PROJECT-INITIALS（项目拼音缩写生成）

**触发：** projects 表 mode 1 (after save)，changed: `project_name`

**节点链：**
```
script(script_pinyin) → update(update_pinyin)
```

**脚本逻辑：**
1. 通过 pinyin-pro 将 `project_name` 转为拼音首字母
2. 取前2位大写字母
3. 空值保护：如果 project_name 为空且已有 pinyin_initials，保留原值

## 6. 注意事项

### 6.1 序列号重置

序列号按 `prefix + date_str + project_id` 独立计数，每天自动从 1 开始。
无需手动重置。

### 6.2 并发安全

`get_next_serial()` 使用 PostgreSQL UPSERT (ON CONFLICT DO UPDATE)，是原子操作。
多线程/多实例并发调用不会产生重复序列号。

### 6.3 补录历史数据

补录历史 entries/log 时：
- 脚本会自动取 `entry_date`/`log_date` 作为日期部分
- 序列号按该日期独立计数
- 不会产生与当日数据的冲突

### 6.4 降级方案

如果 next-serial API 不可用（网络错误），脚本会 fallback 为 `001`：
```javascript
if (!serial) serial = '001';
```

**建议：** 在生产环境部署后首次调用前，手动测试 API 确保可用。

### 6.5 清理临时表

部署过程中曾创建 `daily_serial_counters` 临时表，如存在请删除：
```sql
DROP TABLE IF EXISTS daily_serial_counters;
DROP FUNCTION IF EXISTS get_next_serial(VARCHAR, BIGINT, VARCHAR);
```

## 7. 相关文件位置

| 文件 | 路径 |
|------|------|
| 序列号 API 端点 | `/opt/noco-base/plugin-dashboard-home/dist/server/index.js` |
| 批量创建 API 端点 | `/opt/noco-base/plugin-dashboard-home/dist/server/index.js` |
| pinyin-pro 库 | `/app/nocobase/storage/node_modules/pinyin-pro` (容器内) |
| 拼音 API 端点 | `/opt/noco-base/plugin-dashboard-home/dist/server/index.js` |
| 数据库序列表 | `sys_serial_counters` |

## 8. 部署检查清单

- [ ] `sys_serial_counters` 表存在且包含 `date_str`、`project_id` 字段
- [ ] `uk_sys_serial_counters_prefix_date_project` 唯一约束存在
- [ ] `get_next_serial()` 函数存在
- [ ] `/api/__pd__/next-serial` 端点可访问
- [ ] `/api/__pd__/batch-create-logs` 端点可访问
- [ ] WF-SERIAL-CONSTRUCTION 工作流 enabled
- [ ] WF-SERIAL-LOG 工作流 enabled
- [ ] WF-PROJECT-INITIALS 工作流 enabled
- [ ] pinyin-pro 库存在于容器内 `/app/nocobase/storage/node_modules/pinyin-pro`

---

**文档版本：** v1.0  
**创建日期：** 2026-06-09  
**适用系统：** NocoBase + PostgreSQL
