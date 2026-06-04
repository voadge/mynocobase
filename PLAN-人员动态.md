# 实施计划：人员动态地图区块

## 一、生产系统数据验证

通过 NocoBase API 查询生产系统确认：

| 验证项 | 结果 |
|--------|------|
| `workers` 角色 | ✅ 已存在（name: `workers`, title: `工人`, 2026-06-04 创建） |
| 部门（departments） | ✅ 8 个：行政部、工程部(含安质部/成本部/联营部)、物资部、财务部、市场部 |
| 用户总数 | 7 人，均未分配部门（当前 departments: []）|
| `geofences` 围栏 | ✅ 有配置数据（polyline_coords、buffer_radius、bbox） |
| `attendance_records` 打卡 | ✅ 14 条记录，含 latitude/longitude/geofence_inside/createdById |
| `projects` 项目清单 | 表存在但空记录 — 改用部门(departments)作为分组维度 |
| `location_history` | ❌ 不存在，需新建 |
| EXTERN_URLS 当前 | 3 项：智慧云屏、巡查管理、数据大屏 2(example.com 占位) |

## 二、新增数据表

### `location_history`（MCP 自动创建）

```json
{
  "collectionName": "location_history",
  "title": "位置历史轨迹",
  "fields": [
    { "name": "latitude",  "type": "float",  "title": "纬度" },
    { "name": "longitude", "type": "float",  "title": "经度" },
    { "name": "accuracy",  "type": "integer","title": "GPS精度(米)" },
    { "name": "recorded_at","type": "datetime","title": "定位时间" }
  ],
  "createdBy": true,
  "createdAt": true,
  "sortable": true
}
```

> 不设独立 `user_id` 字段，通过 NocoBase 自动的 `createdBy` (belongsTo users) 关联用户。

## 三、位置数据写入

### 3.1 打卡写入（attend.js 钩子）

在 `submitAttendance()` 成功分支内追加（`assets/attend.js:980-991`）：

```
POST /api/attendance_records:create 成功
  → if (attendLocation)
      POST /api/location_history:create
        latitude:  attendLocation.lat
        longitude: attendLocation.lng
        accuracy:  Math.round(attendLocation.accuracy)
        recorded_at: now.toISOString()
```

为 fire-and-forget 异步写入，不阻塞 UI。

### 3.2 定时采集（人员动态.html 内置脚本）

每日生命周期：

```
06:00 ── 检查今日是否有「上班」记录
          ├ 无 → 每 5 分钟重查
          └ 有 → 启动定时采集
                 每次采集前检查是否有「下班」记录
                 ├ 有 → 立即停止，当日静默
                 └ 无 → 按时段继续
                        06:00-12:00 → 每 10 分钟
                        12:00-20:00 → 每 30 分钟
20:00 ── 静默至次日 06:00
```

## 四、新建页面：`dashboard/人员动态.html`

### 4.1 布局

```
┌────────────────────────────────────────┬──────────────────────────┐
│                                        │ 🔍 查询项目/人名          │
│          Leaflet 地图                   ├──────────────────────────┤
│                                        │ 🏗 工程部 (3人)          │
│  • 围栏折线 + 缓冲区 (Turf.js)          │   ● 张三  ←在线           │
│  • 在线人员: 绿色脉冲圆点 + 标签         │   ○ 李四  (离线)          │
│  • 离线人员: 灰色圆点 + 最后位置         │   ● 王五  ←在线           │
│  • 选中轨迹: 青色折线 + 起止标记         │ 📦 物资部 (1人)           │
│                                        │   ○ 赵六  (离线)          │
│                                        │   ↕ 自适应滚动条           │
├────────────────────────────────────────┴──────────────────────────┤
│ 📊 [今日打卡: XX] [在线: XX] │ [工程部: 2/3] [物资部: 0/1] ...     │
│        ← 左侧 position:sticky fixed →     ←右侧 overflow-x:auto→  │
└───────────────────────────────────────────────────────────────────┘
```

### 4.2 技术栈

| 项目 | 选型 | 来源 |
|------|------|------|
| 地图引擎 | Leaflet 1.9.4 | CDN |
| 瓦片 | 高德路网（无Key） | `webrd0{s}.is.autonavi.com` |
| 缓冲区 | Turf.js 6 | CDN |
| 数据轮询 | setInterval 10s/30s | 原生 JS |
| 配色 | 暗色渐变（与 dashboard 统一） | `#0c1426`/`#00d4ff`/`#7b2cbf` |

### 4.3 核心数据流

```
┌─────────────┐    10s polling     ┌──────────────────┐
│             │ ─────────────────→ │ attendance_records│
│             │                    │ 今日打卡列表      │
│  人员动态    │ ←──────────────── │ (含 createdBy)    │
│  页面        │    10s polling     └──────────────────┘
│             │ ─────────────────→ ┌──────────────────┐
│             │                    │ location_history │
│             │ ←──────────────── │ 最新位置(按日)    │
│             │    30s polling     └──────────────────┘
│             │ ─────────────────→ ┌──────────────────┐
│             │                    │ geofences         │
│             │ ←──────────────── │ 活动围栏列表      │
└──────┬──────┘                    └──────────────────┘
       │ 点击人员
       ▼
┌──────────────┐
│ location_    │
│ history      │ ← GET filter[createdBy.id]=X, sort=recorded_at
│ (轨迹折线)   │
└──────────────┘
```

### 4.4 右侧人员列表

- 数据来源：`GET /api/users:list?appends=roles,departments`
- 过滤条件：仅显示含 `workers` 角色的用户
- 分组维度：按 `departments[].title` 分组
- 搜索：输入即搜，同时匹配部门名和人名
- 交互：点击人员 → 地图 flyTo 其位置 → 加载轨迹(不阻塞，不全部动态刷新)
- 高度：flex:1 自适应，`overflow-y: auto`

### 4.5 底部数据栏

- 左固定：`position: sticky; left: 0; z-index: 2; background: inherit`
- 右滚动：`white-space: nowrap; overflow-x: auto`
- 数据：每次轮询后重新计算并更新 DOM

## 五、修改文件清单

### 5.1 `nocobase-plugin-dashboard-home/dist/server/index.js`

在 `PAGE_MAP` 添加：
```js
'/api/__pd__': '人员动态.html',
```

### 5.2 `nginx.conf`

添加 location（与 geofence 模式一致）：
```nginx
location /peopledynamic {
    auth_request /api/plugin-dashboard-home/auth-check;
    auth_request_set $auth_status $upstream_status;
    error_page 401 = @login;
    proxy_pass http://app:13000/api/__pd__;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

### 5.3 `assets/config.js`

```js
const EXTERN_URLS = [
    { label: '智慧云屏', url: 'https://road.xiangsu.work/bvr/zydlxc/#/homePage' },
    { label: '巡查管理', url: 'https://road.xiangsu.work/bvr/zydlxc/#/' },
    { label: '人员动态', url: '/peopledynamic' },
    { label: '数据大屏 4', url: '' }  // 预留空白源
];
```

### 5.4 `dashboard/index.html`

同步更新内联的 `EXTERN_URLS`（line 1031-1035），同时同步 `loadSource` 函数（line 1073-1083）处理空白 URL 显示占位页面。

### 5.5 `assets/attend.js`

在 `submitAttendance()` 成功分支（line 980-992）内，追加 `location_history` 写入：
```js
// 位置历史记录（fire-and-forget）
if (attendLocation && !isLeave) {
    fetch('/api/location_history:create', {
        method: 'POST',
        headers: _headers,
        credentials: 'include',
        body: JSON.stringify({
            latitude: attendLocation.lat,
            longitude: attendLocation.lng,
            accuracy: Math.round(attendLocation.accuracy),
            recorded_at: now.toISOString()
        })
    }).catch(function(){});
}
```

## 六、修复审计问题

| # | 严重度 | 问题 | 修复方式 | 状态 |
|---|--------|------|---------|------|
| 2 | P1 | users:list 权限不足 | 插件新增 `/api/__pd__/workers` 服务端端点，直接 query repository 绕过 ACL | ✅ |
| 3 | P1 | location_history 未 appends=createdBy | loadTrajectory 追加 `&appends=createdBy` | ✅ |
| 4 | P1 | isLeave / body.latitude 行为 | 无需改码。请假时 attendLocation=null → body.latitude=undefined → 不写入位置历史（预期行为） | ✅ |
| 5 | P1 | 部署路径不一致 | docker-compose volume: `./plugin-dashboard-home:/app/nocobase/node_modules/...`（确认） | ✅ |
| 6 | P2 | recorded_at 时区 | 全部 UTC 一致（client ISOString + 服务端 UTC），可接受 | ✅ |
| 7 | P2 | 未分配部门兜底 | renderUserList line 396 已处理 `__none` →「未分配」 | ✅ |
| 8 | P2 | fire-and-forget 无日志 | attend.js line 1003 + 人员动态.html line 603 添加 console.warn | ✅ |
| 9 | P2 | 轮询压力 | 10s polling + 30s fences，保守可接受 | ✅ |

## 七、服务端定时采集（方案6）

### 端点

`GET /api/__pd__/batch-collect`

由 cron 每 10 分钟触发，逻辑：
1. 查今日 attendance_records（按 createdBy 分组）
2. 找「已上班 ∧ 未下班」的用户
3. 取最新打卡坐标，若与最后 location_history 不同则写入
4. 去重：同坐标 + 5分钟内不重复写

### 服务器 cron 配置

```bash
# 上班时段每10分钟触发
*/10 6-19 * * * curl -s --cookie "nb_token=xxx" http://localhost:13000/api/__pd__/batch-collect > /dev/null 2>&1
```

`nb_token` 获取：浏览器 DevTools → Application → Cookies → `nb_token`

## 八、Capacitor Android 预留

`capacitor/` 目录已创建，包含：
- `package.json` — Capacitor 6.x 依赖（core, geolocation, network）
- `capacitor.config.json` — appId: `com.voadge.pd.attend`, 指向 `www/`
- `scripts/sync-www.js` — 复制 web 静态资源到 www/ 目录
- `www/index.html` — 入口页，自动跳转到人员动态

封装步骤（后续）：
```bash
cd capacitor
npm install
node scripts/sync-www.js       # 复制 web 资源
npx cap add android             # 生成 Android 原生项目
npx cap copy                    # 同步 www → android
# 在 Android Studio 中配置后台定位权限
npx cap open android
```

### Capacitor 兼容性

现有代码已天然兼容（因为 attend.js 和 人员动态.html 均使用 localStorage token + Authorization header 鉴权，不依赖 cookie）。

## 九、部署步骤

```bash
# 1. 创建 location_history 表（MCP API）

# 2. 上传页面文件
scp -i voadge.pem "dashboard/人员动态.html" ubuntu@110.42.236.231:/opt/noco-base/dashboard/

# 3. 上传插件更新（含 workers API + batch-collect 端点）
scp -i voadge.pem nocobase-plugin-dashboard-home/dist/server/index.js \
    ubuntu@110.42.236.231:/opt/noco-base/plugin-dashboard-home/dist/server/

# 4. Docker 内重启插件
ssh -i voadge.pem ubuntu@110.42.236.231 \
    "docker exec noco-base-app-1 npx nocobase pm restart dashboard-home"

# 5. 更新 nginx 配置
scp -i voadge.pem nginx.conf ubuntu@110.42.236.231:/opt/noco-base/nginx.conf
ssh -i voadge.pem ubuntu@110.42.236.231 \
    "docker exec noco-base-nginx-proxy-1 nginx -t && docker exec noco-base-nginx-proxy-1 nginx -s reload"

# 6. 验证工作者 API
curl -s --cookie "nb_token=xxx" http://localhost:13000/api/__pd__/workers

# 7. 验证批采集端点
curl -s --cookie "nb_token=xxx" http://localhost:13000/api/__pd__/batch-collect

# 8. 添加 cron（生产服务器）
crontab -e
*/10 6-19 * * * curl -s --cookie "nb_token=xxx" http://localhost:13000/api/__pd__/batch-collect > /dev/null 2>&1
```

## 十、验证清单

- [ ] `location_history` 表创建成功，字段完整
- [ ] `GET /api/users:list?appends=roles,departments` 返回含 workers 角色的用户
- [ ] `GET /api/location_history:list?filter[createdBy.id]=X&sort=recorded_at` 返回位置序列
- [ ] `GET /api/attendance_records:list?filter[createdAt][$dateBetween]=today` 返回今日打卡
- [ ] 人员动态页面可独立访问 (`https://voadge.top:668/peopledynamic`)
- [ ] 围栏折线 + 缓冲区正确渲染地图
- [ ] 在线人员绿色脉冲标记 / 离线人员灰色标记
- [ ] 右侧人员列表按部门分组，仅显示 workers 角色用户
- [ ] 搜索框可实时过滤部门/人名
- [ ] 列表自适应高度，超出显示滚动条
- [ ] 点击人员→地图飞至位置→显示轨迹折线
- [ ] 底部数据栏左侧固定、右侧滚动
- [ ] 大屏可切换至「人员动态」源（第3个）
- [ ] 大屏切换至第4个空白源显示占位
- [ ] 打卡后 location_history 有新增记录
- [ ] 定时采集上班→下班窗口内执行，下班后停止
