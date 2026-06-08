# 施工日志全流程部署审计报告

## 审计范围
- 数据表：construction_daily_entries、construction_daily_log、projects、briefings、departmentsUsers
- 工作流：WF-DAILY-ENTRY、WF-DAILY-REVIEW、WF-SERIAL-CONSTRUCTION、WF-SERIAL-LOG、WF-PROJECT-INITIALS、WF-TIMER-2
- 脚本节点：weather_fetch、br0wmkoi5sd、script_log_no、script_pinyin、lnrq8og9e0s 等
- 字段关联、关系完整性

---

## 一、关键问题（高优先级，需立即修复）

### 1. 流程逻辑错误：entries 不应有 manual 审核
**位置**：WF-DAILY-ENTRY (construction_daily_entries)
**问题**：
- 需求明确"日志填报截止：每天 16:30 前，不需要审核"
- 但 WF-DAILY-ENTRY 设置了 manual 节点，指派给 chief_engineer 审核 entries 记录
- 这导致员工填报后不能直接提交，而是需要等待 chief_engineer 审核

**影响**：严重违背业务需求，流程阻塞
**修复建议**：
- 移除 WF-DAILY-ENTRY 中的 manual 节点
- WF-DAILY-ENTRY 应简化为：查询 → 获取天气 → 更新 weather → 结束
- 审核应在 construction_daily_log（汇总后的施工日志）上进行

---

### 2. WF-DAILY-ENTRY 可能递归触发
**位置**：WF-DAILY-ENTRY 配置
**问题**：
- mode = 1 (after save)，但缺少 `changed` 限制条件
- update 节点更新 `status` 和 `weather` 会再次触发 after save
- 可能形成无限递归

**影响**：工作流无限循环，系统性能下降或崩溃
**修复建议**：
- 添加 `changed` 字段限制，例如 `"changed": ["reporter_id", "work_content"]`
- 或在 update 节点使用 `"individualHooks": false` 避免触发工作流

---

### 3. WF-SERIAL-CONSTRUCTION update filter 错误
**位置**：WF-SERIAL-CONSTRUCTION → update 节点 (k63s5o4g97w)
**当前配置**：
```json
{"filter":{"$or":[{"reporter_id":{"$notEmpty":true}}]},"values":{"entry_no":"..."}}
```
**问题**：
- filter 使用 `$or` + `reporter_id.$notEmpty`，这会匹配所有 reporter_id 不为空的记录
- 无法定位到当前触发记录，可能批量更新多条记录
- 正确做法应使用 `{"id": {"$eq": "{{$context.data.id}}"}}`

**影响**：可能意外修改其他记录的 entry_no
**修复建议**：
```json
{"filter":{"id":"{{$context.data.id}}"},"values":{"entry_no":"{{$jobsMapByNodeKey.br0wmkoi5sd.data}}"}}
```

---

### 4. WF-SERIAL-LOG update filter 错误
**位置**：WF-SERIAL-LOG → update 节点 (update_log_no)
**当前配置**：
```json
{"filter":{"$and":[{"id":{"$notEmpty":true}}]},"values":{"log_no":"..."}}
```
**问题**：
- `id.$notEmpty` 匹配所有记录（几乎所有记录都有 id）
- 这将批量更新所有 construction_daily_log 记录的 log_no

**影响**：严重数据污染，所有日志编号被覆盖
**修复建议**：
```json
{"filter":{"id":"{{$context.data.id}}"},"values":{"log_no":"{{$jobsMapByNodeKey.script_log_no.data}}"}}
```

---

### 5. 流水号生成逻辑有冲突风险
**位置**：WF-SERIAL-CONSTRUCTION (br0wmkoi5sd)、WF-SERIAL-LOG (script_log_no)
**当前逻辑**：
```javascript
const idStr = String($context.data.id);
const serial = idStr.substring(idStr.length - 3).padStart(3, '0');
```
**问题**：
- 取 id 后3位作为流水号
- 冲突场景：id=1 → "001"，id=1001 → "001"（同一天同一项目冲突）
- 日期使用 `new Date()`，补填历史日志时编号日期为当前日期，而非 entry_date/log_date

**影响**：编号不唯一，历史数据编号错误
**修复建议**：
- 使用表中已有记录数 + 1 作为流水号，或
- 使用数据库序列/自增字段，或
- 改用 `${datePart}${random3digits}` 降低冲突概率
- 日期使用 `$context.data.entry_date` 或 `$context.data.log_date`

---

### 6. TIMER-2 缺少后续执行节点
**位置**：WF-TIMER-2 (施工日志汇总)
**问题**：
- 当前只有 query + script 节点
- script 返回 `{ summaries, totalEntries }`，但无后续节点消费
- 缺少：循环节点、创建 construction_daily_log、创建 briefings、通知节点

**影响**：定时汇总只是计算数据，不生成任何记录或通知
**修复建议**：
- 添加 loop 节点遍历 summaries
- 在循环内添加 create 节点创建 construction_daily_log
- 添加 create 节点创建 briefings
- 添加 notification 节点通知相关人员

---

### 7. entries 和 log 之间无联动
**位置**：WF-DAILY-ENTRY、WF-DAILY-REVIEW
**问题**：
- entries 填报后更新 weather 和 status
- 但没有机制将 entries 汇总成 log
- WF-DAILY-REVIEW 直接审核 log，但 log 由谁创建？

**影响**：流程断链，log 记录可能无人创建
**修复建议**：
- TIMER-2 负责创建 log（从 entries 汇总）
- 或 WF-DAILY-ENTRY 在最后添加 create 节点创建 log
- 建议：TIMER-2 每日 20:00 汇总创建 log，然后触发 WF-DAILY-REVIEW

---

### 8. WF-DAILY-REVIEW 复核人/审核人混淆
**位置**：WF-DAILY-REVIEW
**问题**：
- manual 节点 assignees 设为 `info_clerk_id`（资料员）
- 但工作流标题是"审核"，且需求是"chief_engineer 审核 + info_clerk 复核"
- 缺少 chief_engineer 审核环节

**影响**：审核流程不完整
**修复建议**：
- 添加两个 manual 节点：
  1. chief_engineer 审核（assignees: chief_engineer_id）
  2. info_clerk 复核（assignees: info_clerk_id）

---

## 二、中优先级问题

### 9. weather 脚本获取失败时 update 可能出错
**位置**：WF-DAILY-ENTRY → weather_fetch
**问题**：
- 天气 API 失败时返回 `{}`
- update 节点引用 `{{$jobsMapByNodeKey.weather_fetch.data.weather}}`
- 如果 weather 字段为 undefined，update 节点行为不确定

**修复建议**：
- 在脚本中返回 `{ weather: '' }` 而非 `{}`
- 或在 update 节点添加默认值处理

---

### 10. manual 节点 forms/schema 为空
**位置**：WF-DAILY-ENTRY、WF-DAILY-REVIEW
**问题**：
- 两个 manual 节点的 `forms` 和 `schema` 都是 `{}`
- 审批人看到的表单为空，无法查看审批内容

**修复建议**：
- 在 UI 中配置审批表单 schema，展示相关字段

---

### 11. 拼音缩写脚本可能返回空字符串覆盖已有值
**位置**：WF-PROJECT-INITIALS
**问题**：
- project_name 为空时返回 `''`
- update 节点会将 `pinyin_initials` 更新为 `''`

**修复建议**：
- 脚本添加保护：`if (!initials) return $context.data.pinyin_initials || '';`

---

## 三、低优先级/建议

### 12. WF-SERIAL-CONSTRUCTION 和 WF-SERIAL-LOG 重复代码
- 两个脚本几乎完全相同，只是更新字段不同
- 建议提取公共逻辑

### 13. TIMER-2 appends 配置
- WF-TIMER-2 config 中有 `appends: ["project_id_id", "log_id_id"]`
- 但 TIMER-2 是 schedule 类型，无 trigger 记录，appends 无效
- 建议移除

### 14. departmentsUsers 表字段缺失
- 查询返回 0 行，说明可能无字段定义或为 through 表
- 不影响当前流程，但需确认 ACL 配置

---

## 四、数据表字段完整性

### projects 表
| 字段 | 状态 | 用途 |
|------|------|------|
| pinyin_initials | ✓ | 拼音缩写 |
| info_clerk_id / info_clerk | ✓ | 资料员 |
| chief_engineer_id / chief_engineer | ✓ | 总工程师 |
| location_lat | ✓ | 纬度 |
| location_lon | ✓ | 经度 |

### construction_daily_entries 表
| 字段 | 状态 | 用途 |
|------|------|------|
| project_id / project_id_id | ✓ | 所属项目 |
| reporter_id / reporter_id_id | ✓ | 填报人 |
| log_id / log_id_id | ✓ | 关联日志 |
| entry_no | ✓ | 填报编号 |
| entry_date | ✓ | 填报日期 |
| weather | ✓ | 天气 |
| status | ✓ | 状态 |

### construction_daily_log 表
| 字段 | 状态 | 用途 |
|------|------|------|
| project_id / project_id_id | ✓ | 所属项目 |
| approver_id / approver_id_id | ✓ | 审批人 |
| reviewer_id / reviewer_id_id | ✓ | 复核人 |
| log_no | ✓ | 日志编号 |
| log_date | ✓ | 日志日期 |
| weather | ✓ | 天气（汇总） |
| status | ✓ | 状态 |
| review_opinion | ✓ | 复核意见 |
| reviewed_at | ✓ | 复核时间 |
| approve_opinion | ✓ | 审批意见 |
| approved_at | ✓ | 审批时间 |

### briefings 表
| 字段 | 状态 | 用途 |
|------|------|------|
| briefing_type | ✓ | 简报类型（需确认含"施工日志"） |
| project_id / project_id_id | ✓ | 所属项目 |
| title | ✓ | 标题 |
| summary | ✓ | 摘要 |
| briefing_date | ✓ | 日期 |
| source_workflow_id | ? | 来源工作流（关联 workflows） |

---

## 五、修复优先级建议

1. **立即修复**（阻塞业务流程）：
   - 问题 3、4：修正 update filter（避免批量更新）
   - 问题 1：调整 WF-DAILY-ENTRY 流程（移除 manual 审核）
   - 问题 2：添加 changed 限制防止递归

2. **本周修复**（影响数据质量）：
   - 问题 5：修正流水号逻辑
   - 问题 6：完善 TIMER-2 后续节点
   - 问题 7：建立 entries → log 联动

3. **下周优化**（提升体验）：
   - 问题 8：完善审核/复核流程
   - 问题 9-11：异常处理、表单配置、空值保护

---

## 六、结论

当前部署存在 **流程逻辑错误**、**数据安全风险** 和 **流程断链** 等严重问题，建议按优先级逐步修复。核心问题是：
1. entries 不应有 manual 审核
2. update filter 错误可能导致批量数据污染
3. TIMER-2 不完整，无法生成 log 和 briefings
4. 审核/复核流程不完整
