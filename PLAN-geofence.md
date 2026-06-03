# 打卡地理围栏方案（最优版）

## 技术选型

| 项目 | 选型 | 说明 |
|------|------|------|
| 地图渲染 | Leaflet 1.9.x | 轻量，~40KB |
| 地图瓦片 | **高德瓦片（无需 Key）** | 道路完整（含乡村路），国内加载快 |
| 缓冲区算法 | **Turf.js** | 真实地理缓冲区，不依赖像素宽度 |
| 后端验证 | NocoBase 工作流 JS 节点 | 打卡后二次校验，防前端篡改 |
| 前端验证 | 本地 JS 算法（Haversine） | 提交前显示围栏状态 |
| 缓冲距离 | 200m（可配置） | 折线两侧各 200m |
| 围栏外打卡 | 允许，标记异常 | 走现有审批流程 |

### 瓦片 URL（确认可用，无需 Key）

```javascript
// 高德路网瓦片（无需 Key，国内道路最完整，含乡村路）
L.tileLayer('https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&style=7&x={x}&y={y}&z={z}', {
    subdomains: '1234',
    maxZoom: 18,
    attribution: '&copy; 高德地图'
}).addTo(map);

// 高德卫星图（可选）
L.tileLayer('https://webst0{s}.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}', {
    subdomains: '1234',
    maxZoom: 18
}).addTo(map);
```

> ⚠️ 注意：`leaflet.ChineseTmsProviders` 插件**不是必须的**，直接用上述 URL 即可。

---

## 整体数据流

```
管理员：Leaflet + 高德瓦片地图上画折线 → 保存到 geofences 表
                                                    ↓
员工打卡：
  ① 前端获取 GPS → 从 geofences 表获取围栏 → 本地计算距离 → 显示状态
  ② 提交打卡记录（附带围栏状态 + 异常原因）
  ③ 工作流触发（仅签到/签退）→ JS 节点二次校验 → 更新记录 + 归档统计
```

---

## 表结构

### 1. 新建表 `geofences`（围栏配置表）

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | snowflakeId | 主键 |
| `fence_name` | string | 围栏名称（如"遵义-仁怀段"） |
| `polyline_coords` | text | 折线坐标 JSON `[[lng,lat],[lng,lat],...]` |
| `buffer_radius` | integer | 缓冲半径（米），默认 200 |
| `is_active` | boolean | 是否启用，默认 true |
| `sort` | sort | 排序 |
| `createdAt/updatedAt` | date | 时间戳 |

### 2. `attendance_records` 新增字段（3个）

| 字段 | 类型 | 说明 |
|------|------|------|
| `geofence_inside` | boolean | 是否在围栏内（最终以工作流为准） |
| `geofence_distance` | integer | 距最近折线的垂直距离（米） |
| `geofence_id` | integer | **外键 → geofences.id**（匹配到的围栏） |

> ⚠️ **删除** `geofence_fence_name`（冗余，可通过 `geofence_id` 关联查询）

### 3. `att_archives` 新增字段（3个）

| 字段 | 类型 | 说明 |
|------|------|------|
| `geofence_inside_days` | integer | 围栏内打卡天数 |
| `geofence_outside_days` | integer | 围栏外打卡天数 |
| `geofence_anomaly_count` | integer | 异常打卡次数 |

---

## 围栏管理页面（NocoBase 后台，仅管理员可见）

### 技术实现

```html
<!-- 引入 Leaflet + Turf.js -->
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script src="https://unpkg.com/@turf/turf@6/turf.min.js"></script>
```

```javascript
// 1. 初始化地图（高德瓦片，无需 Key）
const map = L.map('map').setView([27.7, 106.9], 10);

L.tileLayer('https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&style=7&x={x}&y={y}&z={z}', {
    subdomains: '1234',
    maxZoom: 18
}).addTo(map);

// 2. 画折线（Leaflet 原生 Draw 或直接点击）
let points = [];
map.on('click', function(e) {
    points.push([e.latlng.lng, e.latlng.lat]);
    redrawPolyline();
});

// 3. 实时显示缓冲区（Turf.js 生成真实地理缓冲区）
function redrawPolyline() {
    // 清除旧图层
    map.eachLayer(l => { if (l._path) map.removeLayer(l); });

    if (points.length < 2) return;

    // 折线本体
    L.polyline(points.map(p => [p[1], p[0]]), {
        color: '#00d4ff',
        weight: 3
    }).addTo(map);

    // 真实 200m 缓冲区（Turf.js）
    const line = turf.lineString(points);
    const buffered = turf.buffer(line, 200, { units: 'meters' });

    L.geoJSON(buffered, {
        color: '#00d4ff',
        weight: 1,
        fillColor: '#00d4ff',
        fillOpacity: 0.15
    }).addTo(map);
}

// 4. 保存围栏
async function saveFence() {
    await fetch('/api/geofences:create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({
            fence_name: document.getElementById('fenceName').value,
            polyline_coords: JSON.stringify(points),
            buffer_radius: 200,
            is_active: true
        })
    });
}
```

### 功能清单

1. 地图展示所有已有围栏折线 + 缓冲区
2. 点击地图逐个点选 → 自动连线 + 实时缓冲带
3. 点位可拖拽调整（Leaflet Draw 插件）
4. 支持编辑/删除围栏
5. 围栏列表展示（名称、状态、操作按钮）

---

## 前端打卡改动（`dashboard_audit.html`）

### 核心算法（纯 JS，不依赖 Turf）

```javascript
// 1. Haversine 公式（两点间距离，返回米）
function haversineDist(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const toRad = Math.PI / 180;
    const dLat = (lat2 - lat1) * toRad;
    const dLon = (lon2 - lon1) * toRad;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

// 2. 点到线段最短距离（向量投影法）
function pointToSegmentDistance(lat, lon, lat1, lon1, lat2, lon2) {
    const dAC = haversineDist(lat, lon, lat1, lon1);
    const dBC = haversineDist(lat, lon, lat2, lon2);
    const dAB = haversineDist(lat1, lon1, lat2, lon2);
    if (dAB < 1) return dAC; // 线段长度接近 0

    const cosA = (dAC * dAC + dAB * dAB - dBC * dBC) / (2 * dAC * dAB);
    const cosB = (dBC * dBC + dAB * dAB - dAC * dAC) / (2 * dBC * dAB);
    if (cosA <= 0) return dAC; // 投影在 A 点外侧
    if (cosB <= 0) return dBC; // 投影在 B 点外侧

    // 投影在线段内，用面积公式求高
    const s = (dAC + dBC + dAB) / 2;
    const area = Math.sqrt(s * (s - dAC) * (s - dBC) * (s - dAB));
    return area * 2 / dAB;
}

// 3. GPS 点到折线最短距离
function distanceToPolyline(lat, lon, polyline) {
    // polyline: [[lng,lat],[lng,lat],...]
    let minDist = Infinity;
    for (let i = 0; i < polyline.length - 1; i++) {
        const dist = pointToSegmentDistance(
            lat, lon,
            polyline[i][1], polyline[i][0],   // 段起点 lat, lng
            polyline[i + 1][1], polyline[i + 1][0]  // 段终点 lat, lng
        );
        minDist = Math.min(minDist, dist);
    }
    return Math.round(minDist);
}
```

### 前端流程

```
1. 打卡弹窗打开 → 获取 GPS
2. 调用 geofences:list 获取所有启用的围栏
3. 本地计算 GPS 点到每条折线的距离
4. 距离 ≤ fence.buffer_radius → 围栏内 ✅
5. 显示围栏状态（围栏名 + 距离 + ✅/❌）
6. 围栏外允许提交（标红但不禁用）
7. 提交打卡记录（附带 geofence_inside / geofence_distance / geofence_id）
```

### 改动点

| 改动点 | 说明 |
|--------|------|
| `openAttendModal()` | 获取围栏列表 + 本地计算距离 |
| 验证栏 `vFence` | 显示围栏名 + 距离 + ✅/❌ |
| `updateSubmitState()` | 围栏外允许提交（标红提示） |
| `submitAttendance()` | 附加 `geofence_inside` / `geofence_distance` / `geofence_id` |
| `anomaly_reason` | 围栏外自动追加 `"围栏外打卡(距最近围栏X米)"` |

### 代码示例（`submitAttendance` 补充）

```javascript
async function submitAttendance() {
    const attendType = document.getElementById('attendType').value;
    const lat = window.__gpsLat;
    const lon = window.__gpsLon;

    // 围栏计算（仅签到/签退）
    let geofenceInside = null;
    let geofenceDistance = null;
    let geofenceId = null;

    if (attendType === '签到' || attendType === '签退') {
        const fences = window.__geofencesCache || [];
        let minDist = Infinity;
        let matchedFence = null;

        for (const fence of fences) {
            const polyline = JSON.parse(fence.polyline_coords);
            const dist = distanceToPolyline(lat, lon, polyline);
            if (dist < minDist) {
                minDist = dist;
                matchedFence = fence;
            }
        }

        geofenceInside = matchedFence ? minDist <= matchedFence.buffer_radius : null;
        geofenceDistance = minDist < Infinity ? minDist : null;
        geofenceId = matchedFence ? matchedFence.id : null;
    }

    const body = {
        check_type: attendType,
        latitude: lat,
        longitude: lon,
        gps_accuracy: window.__gpsAccuracy || null,
        photo: window.__photoData || null,
        device_fingerprint: await getDeviceFingerprint(),
        geofence_inside: geofenceInside,
        geofence_distance: geofenceDistance,
        geofence_id: geofenceId
    };

    // 请假/出差补充字段
    if (attendType === '请假' || attendType === '出差') {
        body.reason = document.getElementById('leaveReason').value;
        body.start_date = document.getElementById('leaveStart').value;
        body.end_date = document.getElementById('leaveEnd').value;
        body.workflow_status = 'pending';
    }

    // 围栏外追加异常说明
    if (geofenceInside === false) {
        body.anomaly_reason = `围栏外打卡(距最近围栏${geofenceDistance}米)`;
    }

    const r = await fetch('/api/attendance_records:create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify(body)
    });

    if (r.ok) {
        alert('✅ 打卡成功');
        closeAttendModal();
    } else {
        alert('✗ 打卡失败：' + await r.text());
    }
}
```

---

## 工作流配置

**触发器：** `attendance_records` afterCreate
**触发条件：** `check_type` IN ('签到', '签退')

```
attendance_records 创建
（仅签到/签退触发，请假/出差跳过）
    ↓
JS 节点 1：围栏二次校验（后端强制覆盖前端值，防篡改）
  - 获取 geofences 表数据
  - 使用 Haversine 公式计算距离
  - 强制更新 attendance_records（覆盖前端传的值）
    ↓
更新节点：更新 attendance_records 的围栏字段
（geofence_inside / geofence_distance / geofence_id）
    ↓
JS 节点 2：更新归档统计
  - 根据 geofence_inside 增减 att_archives 统计
    ↓
更新节点：更新 att_archives
```

### 工作流 JS 节点 1 代码（围栏二次校验）

> ⚠️ NocoBase 工作流 JS 节点**不能用 Turf.js**（沙箱限制），必须用纯 JS。

```javascript
const record = $record;
const { latitude, longitude, check_type } = record;

// 双重保险：非签到/签退直接跳过
if (check_type !== '签到' && check_type !== '签退') {
    return { skipped: true, reason: '非签到/签退，跳过围栏校验' };
}

// 获取所有启用的围栏
const geofences = await context.db.getRepository('geofences').find({
    where: { is_active: true }
});

if (!geofences || geofences.length === 0) {
    // 没有配置围栏，默认允许
    await context.db.getRepository('attendance_records').update({
        where: { id: record.id },
        values: {
            geofence_inside: true,
            geofence_distance: 0,
            geofence_id: null
        }
    });
    return { isInside: true, reason: '未配置围栏，默认通过' };
}

// ---------- Haversine 公式（纯 JS）----------
function haversineDist(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const toRad = Math.PI / 180;
    const dLat = (lat2 - lat1) * toRad;
    const dLon = (lon2 - lon1) * toRad;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function pointToSegmentDistance(lat, lon, lat1, lon1, lat2, lon2) {
    const dAC = haversineDist(lat, lon, lat1, lon1);
    const dBC = haversineDist(lat, lon, lat2, lon2);
    const dAB = haversineDist(lat1, lon1, lat2, lon2);
    if (dAB < 1) return dAC;
    const cosA = (dAC * dAC + dAB * dAB - dBC * dBC) / (2 * dAC * dAB);
    const cosB = (dBC * dBC + dAB * dAB - dAC * dAC) / (2 * dBC * dAB);
    if (cosA <= 0) return dAC;
    if (cosB <= 0) return dBC;
    const s = (dAC + dBC + dAB) / 2;
    const area = Math.sqrt(s * (s - dAC) * (s - dBC) * (s - dAB));
    return area * 2 / dAB;
}

function distanceToPolyline(lat, lon, polyline) {
    let minDist = Infinity;
    for (let i = 0; i < polyline.length - 1; i++) {
        const dist = pointToSegmentDistance(
            lat, lon,
            polyline[i][1], polyline[i][0],
            polyline[i + 1][1], polyline[i + 1][0]
        );
        minDist = Math.min(minDist, dist);
    }
    return Math.round(minDist);
}

// ---------- 找出最近的围栏 ----------
let minDist = Infinity;
let matchedFence = null;

for (const fence of geofences) {
    const polyline = JSON.parse(fence.polyline_coords);
    const dist = distanceToPolyline(latitude, longitude, polyline);
    if (dist < minDist) {
        minDist = dist;
        matchedFence = fence;
    }
}

const bufferRadius = matchedFence ? matchedFence.buffer_radius : 200;
const isInside = minDist <= bufferRadius;

// 强制更新（覆盖前端可能传的错误/篡改值）
await context.db.getRepository('attendance_records').update({
    where: { id: record.id },
    values: {
        geofence_inside: isInside,
        geofence_distance: minDist,
        geofence_id: matchedFence ? matchedFence.id : null
    }
});

return {
    isInside,
    distance: minDist,
    fenceName: matchedFence ? matchedFence.fence_name : null,
    bufferRadius,
    reason: isInside ? '围栏内打卡' : `围栏外打卡(${minDist}米)`
};
```

---

## 实施步骤

| 步骤 | 内容 | 方式 |
|------|------|------|
| 1 | 创建 `geofences` 表 | NocoBase UI |
| 2 | `attendance_records` 新增 3 个围栏字段 | NocoBase UI |
| 3 | `att_archives` 新增 3 个统计字段 | NocoBase UI |
| 4 | 创建围栏管理页面（Leaflet + 高德 + Turf.js） | 新建 HTML 页面 |
| 5 | 修改 `dashboard_audit.html` 加前端围栏计算 | 代码修改 |
| 6 | 配置工作流（触发条件 + JS节点 + 更新节点） | NocoBase 工作流 |
| 7 | 录入围栏数据（在地图上画折线） | 管理员操作 |
| 8 | 部署并测试 | 服务器部署 |

### 步骤 1 详解：`geofences` 表字段

```
Table name: geofences
Fields:
  - fence_name      string(200)  围栏名称
  - polyline_coords text         折线坐标 JSON
  - buffer_radius   integer      缓冲半径(米) default:200
  - is_active       boolean      default:true
  - sort            sort
  - createdAt       createdAt
  - updatedAt       updatedAt
  - createdBy       createdBy
  - updatedBy       updatedBy
```

### 步骤 2 详解：`attendance_records` 新增字段

```
Fields to add:
  - geofence_inside    boolean    是否在围栏内
  - geofence_distance  integer    距最近折线距离(米)
  - geofence_id        integer    外键 → geofences.id
```

> ⚠️ 注意：`geofence_fence_name` **不添加**（冗余）

---

## 安全设计

| 风险 | 防护措施 |
|------|---------|
| 前端篡改 `geofence_inside` | 工作流 JS 节点**强制覆盖**前端值 |
| 无 GPS 权限/伪造 GPS | 记录 `gps_accuracy`，精度 > 100m 标记异常 |
| 照片翻拍 | `photo_hash` 去重 + 人脸检测（Chrome） |
| 设备指纹伪造 | `device_fingerprint` + IP 地址双重验证 |
| 围栏数据泄露 | `geofences` 表仅管理员可读取 |

---

## 待确认事项

- [ ] `polyline_coords` 实际格式确认（管理员画完折线后填入）
- [ ] `att_archives` 更新方式（推荐用 NocoBase 工作流自动触发）
- [ ] 是否需要 PostGIS 空间索引（围栏数量 > 100 时建议添加）
- [ ] iOS Safari 相机问题是否需要提示用户

---

*方案日期: 2026-06-02*
*状态: 已更新为最优方案*
*更新内容: 瓦片确认高德无Key可用 / 缓冲带改用Turf.js / 表结构外键修正 / 工作流触发条件过滤 / 前后端完整代码*
