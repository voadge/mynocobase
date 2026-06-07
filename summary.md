# 考勤系统 — 折线地理围栏

## Goal
- 将考勤系统的圆形围栏升级为折线围栏，支持管理员在地图上绘制、员工打卡时检测围栏状态并标记异常

## Constraints & Preferences
- 使用 NocoBase 现有架构（自定义插件 + nginx-proxy）
- 前端 GPS 精度 >100m 标记异常，围栏外允许打卡但标记异常
- 缓冲区可配置（默认 200m），后端工作流强制覆盖前端值防篡改
- 管理页面需放在 NocoBase 管理后台标签页
- 地理编码/定位必须走服务器代理（高德 API），国内直连 Nomimatin/photon/ip-api.com 被阻断

## Progress
### Done
- ✅ `geofences` 表已创建（含 bbox + `sort` 字段），MCP 元数据已恢复
- ✅ `attendance_records` 已添加 `geofence_inside`/`geofence_distance`/`geofence_id`
- ✅ `att_archives` 已添加 `geofence_inside_days`/`geofence_outside_days`/`geofence_anomaly_count`
- ✅ 工作流「围栏校验+归档统计」已创建启用
- ✅ `dashboard/index.html` + `dashboard.html`：折线围栏检测、bbox 扩展缓冲区、5 分钟缓存、渐变警告等级
- ✅ 修复 bbox 预过滤扩展缓冲区半径、移除旧圆围栏回退逻辑、修复竞态条件、围栏信息合并到位置栏
- ✅ 插件 `/api/__gf__` 路由 + nginx `/geofence` 代理已配置
- ✅ `geofence-manager.html`：地图改用 flex 全高布局、去掉 OSM 图层仅保留高德瓦片
- ✅ 搜索栏（服务器代理 → 高德 InputTips 地理编码）+ 坐标导入 + 节点删除（右键/列表 ✕/按钮）
- ✅ 修复 `redraw()`/`resetEditor()` 同步问题
- ✅ `dashboard/index.html`：恢复被误删的 `closeAttendModal`/`startCamera`/`stopCamera`/`switchCamera`/`retryCamera` 函数
- ✅ 插件 `index.js` 新增 `/api/__gf__/geocode` + `/api/__gf__/locate` 服务端代理（高德 InputTips + IP 定位）
- ✅ 容器重启、SCP 部署、Cache-Control 防浏览器缓存
- ✅ WGS-84 → GCJ-02 坐标转换（匹配高德瓦片偏移，纯 JS `wgs84ToGcj02`）
- ✅ `◎` 按钮：高德 IP 定位 → 回退浏览器定位 + 城市查询回退
- ✅ 相机上方定位文字已移除（`display:none`）
- ✅ 搜索定位智能缩放（省→zoom 7，市→zoom 9，区县→zoom 12，POI→zoom 15）

### In Progress
- 和风天气 QWeather 控制台 500 无法访问，API Host 待确认后才能验证天气

### Blocked
- (none)

## Key Decisions
- **底图方案**：Leaflet + 高德瓦片 + 高德地理编码
- **坐标系统**：因高德瓦片存在 GCJ-02 偏移，GPS 打卡时做 WGS-84→GCJ-02 转换后再比围栏
- **桌面定位**：先高德 IP 定位（服务器代理），失败回退浏览器定位
- **服务器 IP 问题**：数据中心 IP 无法被高德 IP API 识别（返回空数组），桌面端只能回退浏览器的 IP 定位
- **地理编码代理**：高德 InputTips API 替代 geocode API，支持模糊搜索
- **Key 安全**：高德 Key 存服务端，不暴露前端

## Critical Context
- **Docker 远程** `110.42.236.231`，容器 `noco-base-app-1` / `noco-base-nginx-proxy-1`
- **高德 Key**：`31e73c1d12b2848e7bd964774782a954`（Web 服务类型，IP 白名单已配服务器 IP）
- **STORAGE_DIR** = `/app/nocobase/storage/dashboard` → 宿主 `/opt/noco-base/dashboard`
- **`:ro` 挂载改 `:rw`**：修改插件 `index.js` 直接 SCP 覆盖后 `docker restart`
- **搜索 API 历程**：Nominatim（阻断）→ photon.komoot.io（阻断）→ 插件直连 Amap InputTips ✓
- **定位历程**：浏览器 geolocation（安徽）→ Amap IP API（数据中心返回 `[]`）→ 回退浏览器 geolocation
- **坐标修正历程**：原始 GPS（围栏外）→ WGS-84→GCJ-02 转换（围栏内 ✓）
- **天气源历程**：AMAP weather（SERVICE_NOT_AVAILABLE）→ CMA（HTML 不可解析）→ uapis.cn（字段为空）→ weather.com.cn（获取失败）→ **QWeather JWT**
- **定位链**：`QWeather GeoAPI(镇街级) → AMAP regeo(县区级) → AMAP IP(城市级) → 遵义`
- **大屏天气循环**：时钟/日期/农历/节气 → 定位&天气&温度（三行循环显示）
- **JWT 密钥**：Ed25519，凭据 ID=`KAGXVT4Y78`，项目 ID=`3MTGWKPJXJ`

## Relevant Files
- `dashboard/geofence-manager.html` - 围栏管理（Leaflet + 高德瓦片 + 高德 InputTips 搜索 + 坐标导入 + 节点编辑）
- `dashboard/index.html` - 主打卡面板（折线检测 + bbox + GCJ-02 转换 + 验证状态栏）
- `dashboard.html` - 简易打卡页
- `nginx.conf` - `/geofence` 代理路由
- `nocobase-plugin-dashboard-home/dist/server/index.js` - 插件（含 `/geocode`, `/locate` 代理路由）
- `workflow-scripts/围栏校验+归档统计__367898725974016.js` - 工作流 JS 节点备份
