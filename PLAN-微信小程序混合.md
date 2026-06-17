# 计划：微信小程序原生混合 (v2 增强版)

> 版本: v1.0  
> 日期: 2026-06-06  
> 状态: 待实施  
> 前置依赖: v1 壳方案审核通过并上线 (`PLAN-微信小程序套壳.md`) + v2.0 H5 优化完成  
> 升级方式: 小程序版本更新（不重新提审整个小程序，仅增量审核）

---

## 目录

1. [目标](#一目标)
2. [架构](#二架构)
3. [前提条件](#三前提条件)
4. [小程序工程](#四小程序工程)
5. [核心页面设计](#五核心页面设计)
6. [后台定位引擎](#六后台定位引擎)
7. [离线队列](#七离线队列)
8. [服务端新增](#八服务端新增)
9. [围栏与轨迹说明](#九围栏与轨迹说明)
10. [微信审核策略](#十微信审核策略)
11. [与 v1 壳方案的关系](#十一与-v1-壳方案的关系)
12. [开发排期](#十二开发排期)
13. [文件变更清单](#十三文件变更清单)

---

## 一、目标

在 v1 壳方案（web-view 嵌入 H5）基础上，增加原生层能力，解决「工人全天轨迹收集」的核心需求：

- **后台定位引擎**: 微信常驻后台时持续收集位置，存入本地队列
- **离线队列**: `wx.setStorageSync` 可靠存储，进程杀掉不丢数据
- **原生考勤打卡**: 告别 web-view，直接在小程序原生页完成定位+拍照+提交
- **原生轨迹回放**: `<map>` + polyline 组件流畅展示全天路径
- **web-view 看板**: 保留，管理人员 PC/手机查看他人位置

**关键约束**:
- NocoBase 后端完全不变，所有数据直调现有 API
- 围栏核验由服务端现有工作流完成（考勤规则计算__post-create.js）
- 轨迹由服务端清洗抽稀后返回，小程序只负责渲染

---

## 二、架构

```
┌────────────────────────────────────────────────────┐
│              微信小程序 (混合增强 v2)                  │
│                                                    │
│  ┌──────────┐  ┌──────────┐  ┌────────┐  ┌──────┐ │
│  │ 考勤打卡  │  │ 我的轨迹  │  │ 个人设置│  │ 看板  │ │
│  │ (原生)    │  │ (原生map) │  │ (原生)  │  │w-v)  │ │
│  └────┬─────┘  └────┬─────┘  └────────┘  └──────┘ │
│       │              │                              │
│  ┌────▼──────────────▼──────────────────────────┐   │
│  │          后台定位引擎 (app.js)                 │   │
│  │  wx.startLocationUpdateBackground()           │   │
│  │  wx.onLocationChange → queue.push()           │   │
│  └───────────────────────────────────────────────┘   │
│       │                                              │
│  ┌────▼──────────────────────────────────────────┐   │
│  │          离线队列 (wx.setStorageSync)           │   │
│  │  定时 flush → POST /api/location_history:create│   │
│  └───────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────┘
           │                    │
           ▼                    ▼
     POST /api/__pd__/    GET/POST /api/*
     attendance/submit    location_history
           │                    │
           ▼                    ▼
     NocoBase 后端 (完全不变)
     考勤规则计算__post-create.js  自动围栏核验
```

### 数据流

```
打卡:
  小程序 → POST /api/__pd__/attendance/submit { lat, lng, photo... }
       → NocoBase 创建 attendance_records
       → 工作流自动核验围栏/迟到早退/归档

位置上报:
  小程序后台定位引擎 → queue.push({ lat, lng, accuracy, timestamp })
       → 定时 flush → POST /api/location_history:create (批量)
       → NocoBase 存储

轨迹查询:
  小程序请求 → GET /api/__pd__/trajectory?userId=X&date=Y
       → NocoBase 清洗/抽稀/聚停 → 返回简化路径
       → 小程序 <map> polyline 直接渲染

看板数据:
  小程序 web-view → GET /api/__pd__/dashboard-snapshot
       → 同 v1 壳方案
```

---

## 三、前提条件

### 3.1 微信侧

| 事项 | 说明 | 周期 |
|------|------|------|
| 企业号小程序 | 已在 v1 壳方案中注册通过 | 已有 |
| AppID + AppSecret | 已有 | 已有 |
| 业务域名 | 已在 v1 壳方案中配置 | 已有 |
| 服务器域名 | 已在 v1 壳方案中配置 | 已有 |
| **后台定位权限声明** | 在 app.json 中增加 `requiredBackgroundModes: ['location']` | v2 新增 |
| **用户隐私协议更新** | 补充后台定位数据采集说明 | v2 新增 |

### 3.2 服务端

- NocoBase 正常运行，`/api/` 路由可达
- `@nocobase/plugin-people-dynamic` 已启用
- `user_openid` 映射表已存在（v1 时已建）
- `POST /api/__pd__/trajectory` 端点待新建

---

## 四、小程序工程

### 4.1 目录结构

```
miniprogram-people-dynamic/
├── app.json                  ← 新增 requiredBackgroundModes
├── app.js                    ← 后台定位引擎入口
├── app.wxss
├── project.config.json
├── pages/
│   ├── index/                ← web-view 看板 (同 v1)
│   │   ├── index.wxml
│   │   ├── index.js
│   │   └── index.wxss
│   ├── clock/                ← 考勤打卡 (原生)
│   │   ├── clock.wxml
│   │   ├── clock.js
│   │   ├── clock.wxss
│   │   └── clock.json
│   ├── trajectory/           ← 轨迹回放 (原生 map)
│   │   ├── trajectory.wxml
│   │   ├── trajectory.js
│   │   ├── trajectory.wxss
│   │   └── trajectory.json
│   └── profile/              ← 个人设置
│       ├── profile.wxml
│       ├── profile.js
│       └── profile.wxss
├── components/
│   └── fence-status/         ← 围栏状态指示器 (纯 UI, 不算围栏)
│       ├── fence-status.wxml
│       ├── fence-status.js
│       └── fence-status.wxss
└── utils/
    ├── api.js                ← NocoBase REST 客户端
    ├── auth.js               ← 登录 (同 v1)
    ├── config.js             ← 配置 (同 v1)
    └── queue.js              ← 离线队列 (新增)
```

### 4.2 app.json (v2 新增配置)

```json
{
  "pages": [
    "pages/index/index",
    "pages/clock/clock",
    "pages/trajectory/trajectory",
    "pages/profile/profile"
  ],
  "window": {
    "navigationBarTitleText": "人员动态"
  },
  "tabBar": {
    "list": [
      { "pagePath": "pages/index/index", "text": "看板", "iconPath": "" },
      { "pagePath": "pages/clock/clock", "text": "打卡", "iconPath": "" },
      { "pagePath": "pages/trajectory/trajectory", "text": "轨迹", "iconPath": "" },
      { "pagePath": "pages/profile/profile", "text": "我的", "iconPath": "" }
    ]
  },
  "requiredBackgroundModes": ["location"],
  "permission": {
    "scope.userLocation": {
      "desc": "用于考勤打卡时的位置校验"
    },
    "scope.userLocationBackground": {
      "desc": "用于记录工人全天工作轨迹"
    }
  }
}
```

### 4.3 全局样式 (app.wxss)

```css
page {
  background-color: #f5f6fa;
  font-family: -apple-system, sans-serif;
}
```

---

## 五、核心页面设计

### 5.1 考勤打卡 (pages/clock/)

**功能**: 替代现有 H5 的打卡页面，原生实现

```javascript
// pages/clock/clock.js
Page({
  data: {
    checkType: '上班',     // 上班 / 下班 / 请假 / 出差
    location: null,        // { latitude, longitude, accuracy }
    photoTempPath: '',     // 拍照临时路径
    submitting: false,
    todayRecords: []       // 今日打卡记录 (显示状态)
  },

  onLoad() {
    this.getLocation();
    this.loadTodayRecords();
  },

  // 获取定位
  getLocation() {
    wx.getLocation({
      type: 'gcj02',
      success: (res) => {
        this.setData({
          location: {
            latitude: res.latitude,
            longitude: res.longitude,
            accuracy: res.accuracy
          }
        });
      },
      fail: () => {
        wx.showToast({ title: '定位失败，请检查权限', icon: 'none' });
      }
    });
  },

  // 拍照
  takePhoto() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['camera'],
      success: (res) => {
        this.setData({ photoTempPath: res.tempFiles[0].tempFilePath });
      }
    });
  },

  // 提交打卡
  async submit() {
    if (this.data.submitting) return;
    if (!this.data.location) {
      wx.showToast({ title: '未获取到位置', icon: 'none' });
      return;
    }

    this.setData({ submitting: true });
    try {
      const token = wx.getStorageSync('auth_token');
      const res = await wx.request({
        url: `${config.API_HOST}/api/__pd__/attendance/submit`,
        method: 'POST',
        header: { Authorization: `Bearer ${token}` },
        data: {
          check_type: this.data.checkType,
          latitude: this.data.location.latitude,
          longitude: this.data.location.longitude,
          gps_accuracy: this.data.location.accuracy,
          // 围栏由服务端工作流计算，前端不传 geofence_*
          photo: this.data.photoTempPath
            ? await this.uploadPhoto(this.data.photoTempPath)
            : undefined
        }
      });

      if (res.statusCode === 200) {
        wx.showToast({ title: '打卡成功', icon: 'success' });
        this.loadTodayRecords(); // 刷新状态
      }
    } catch (err) {
      wx.showToast({ title: '提交失败', icon: 'none' });
    }
    this.setData({ submitting: false });
  },

  // 上传照片到 NocoBase
  async uploadPhoto(filePath) {
    const token = wx.getStorageSync('auth_token');
    const res = await wx.uploadFile({
      url: `${config.API_HOST}/api/attachments:create`,
      filePath: filePath,
      name: 'file',
      header: { Authorization: `Bearer ${token}` }
    });
    return JSON.parse(res.data).data.id;
  },

  // 加载今日打卡记录
  async loadTodayRecords() {
    const token = wx.getStorageSync('auth_token');
    const today = new Date().toISOString().substring(0, 10);
    const res = await wx.request({
      url: `${config.API_HOST}/api/attendance_records:list`,
      method: 'GET',
      header: { Authorization: `Bearer ${token}` },
      data: {
        filter: {
          createdById: wx.getStorageSync('user_id'),
          createdAt: { $dateOn: today }
        },
        sort: '-createdAt',
        pageSize: 10
      }
    });
    if (res.statusCode === 200) {
      this.setData({ todayRecords: res.data.data });
    }
  }
});
```

**围栏状态显示**: 打卡页只展示围栏状态图标（由 `fence-status` 组件根据服务端返回的 `geofence_inside` 字段显示），不做客户端围栏计算。

### 5.2 轨迹回放 (pages/trajectory/)

```javascript
// pages/trajectory/trajectory.js
Page({
  data: {
    polyline: [],       // [{ points: [{latitude,longitude}], color, width }]
    stays: [],          // [{ name, lat, lng, duration }] 停留点标记
    date: '',
    loading: false
  },

  onLoad() {
    const today = new Date().toISOString().substring(0, 10);
    this.setData({ date: today });
    this.loadTrajectory(today);
  },

  async loadTrajectory(date) {
    this.setData({ loading: true });
    const token = wx.getStorageSync('auth_token');
    const userId = wx.getStorageSync('user_id');
    const res = await wx.request({
      url: `${config.API_HOST}/api/__pd__/trajectory`,
      method: 'GET',
      header: { Authorization: `Bearer ${token}` },
      data: { userId, date }
    });
    if (res.statusCode === 200) {
      const { points, stays, center } = res.data;
      this.setData({
        polyline: [{
          points,
          color: '#1890FF',
          width: 4,
          dottedLine: false
        }],
        stays: (stays || []).map(s => ({
          id: s.id,
          latitude: s.latitude,
          longitude: s.longitude,
          iconPath: '/images/stop.png',
          width: 24,
          height: 24,
          label: {
            content: s.name || (s.duration + 'min'),
            color: '#333',
            fontSize: 12,
            borderRadius: 4,
            bgColor: '#fff',
            padding: 4
          }
        })),
        center: center || (points.length > 0 ? points[0] : { latitude: 39.9, longitude: 116.4 })
      });
    }
    this.setData({ loading: false });
  },

  onDateChange(e) {
    this.loadTrajectory(e.detail.value);
  }
});
```

```xml
<view class="page">
  <picker mode="date" value="{{date}}" bindchange="onDateChange">
    <view class="date-picker">{{date}}</view>
  </picker>

  <map
    class="trajectory-map"
    latitude="{{center.latitude}}"
    longitude="{{center.longitude}}"
    scale="14"
    type="gcj02"
    polyline="{{polyline}}"
    markers="{{stays}}"
    show-location
  />
</view>
```

### 5.3 个人设置 (pages/profile/)

| 功能 | 实现 |
|------|------|
| 后台定位开关 | `wx.startLocationUpdateBackground()` / `wx.stopLocationUpdate()` |
| 今日打卡状态 | 显示今日上班/下班时间，从 `attendance_records` 读取 |
| 缓存清理 | 清空 `wx.setStorageSync` 中的离线队列 |
| 账号信息 | 显示姓名、工号（来自 JWT 解析） |

### 5.4 web-view 看板 (pages/index/)

与 v1 壳方案完全一致，嵌入 H5 dashboard。

---

## 六、后台定位引擎

### 6.1 核心逻辑 (app.js)

```javascript
const queue = require('./utils/queue');

App({
  globalData: { token: '', userId: 0 },
  onLaunch() {
    this.login().then(() => this.initBgLocation());
  },
  async login() {
    // 同 v1 方案: wx.login → POST /api/__pd__/mp-login → JWT
  },
  initBgLocation() {
    const enabled = wx.getStorageSync('bg_location_enabled');
    if (enabled === false) return;

    if (!wx.canIUse('startLocationUpdateBackground')) {
      console.warn('当前版本不支持后台定位');
      return;
    }

    wx.startLocationUpdateBackground({
      success: () => {
        wx.onLocationChange((res) => {
          queue.push({
            latitude: res.latitude,
            longitude: res.longitude,
            accuracy: res.accuracy,
            source: 'wx_background',
            trigger: 'background',
            recorded_at: new Date().toISOString()
          });
        });
        // 启动定时 flush
        this._startPeriodicFlush();
      },
      fail: (err) => {
        console.error('后台定位启动失败', err);
        if (err.errCode === 2) {
          wx.showModal({
            title: '需要位置权限',
            content: '开启后可记录全天工作轨迹',
            confirmText: '去设置',
            success: (r) => { if (r.confirm) wx.openSetting(); }
          });
        }
      }
    });
  },
  _startPeriodicFlush() {
    // 每隔 60s 尝试 flush
    setInterval(() => {
      queue.flush(this.globalData.token);
    }, 60000);
  }
});
```

### 6.2 场景化调度

| 场景 | 行为 |
|------|------|
| 小程序前台 (打卡页) | `wx.getLocation` 单次获取（精度高） |
| 小程序后台 (微信常驻) | `wx.onLocationChange` 持续收集（写入队列） |
| 网络恢复 | `wx.onNetworkStatusChange` → 触发 flush |
| 小程序切前台 | `onShow` → 触发 flush |
| 用户关闭后台定位 | 设置页开关 → `wx.stopLocationUpdate()` |

---

## 七、离线队列

### 7.1 实现 (utils/queue.js)

```javascript
const config = require('./config');
const QUEUE_KEY = 'location_queue';
const MAX_QUEUE = 1000;

const queue = {
  push(data) {
    const list = this.getAll();
    list.push({ ...data, _qid: Date.now() + '_' + Math.random() });
    if (list.length > MAX_QUEUE) {
      // 超限丢弃最旧
      list.splice(0, list.length - MAX_QUEUE);
    }
    wx.setStorageSync(QUEUE_KEY, list);
  },

  getAll() {
    return wx.getStorageSync(QUEUE_KEY) || [];
  },

  async flush(token) {
    const list = this.getAll();
    if (list.length === 0) return;

    // 每次最多提交 20 条
    const batch = list.splice(0, 20);

    try {
      const res = await wx.request({
        url: `${config.API_HOST}/api/__pd__/location/batch-create`,
        method: 'POST',
        header: { Authorization: `Bearer ${token}` },
        data: { records: batch }
      });

      if (res.statusCode === 200) {
        wx.setStorageSync(QUEUE_KEY, list);
        // 递归继续 flush
        if (list.length > 0) {
          return this.flush(token);
        }
      }
    } catch (err) {
      console.warn('flush 失败，保留队列', batch.length, '条');
    }
  }
};

module.exports = queue;
```

### 7.2 v1 壳 vs v2 混合 离线对比

| 维度 | v1 壳 (H5 IndexedDB) | v2 混合 (wx.setStorageSync) |
|------|---------------------|---------------------------|
| 存储可靠性 | 微信内核回收 WebView 即丢 | **进程杀掉不丢** |
| 容量 | 取决于浏览器 | **微信分配，通常 10MB+** |
| 读取方式 | 异步 (IndexedDB 事务) | **同步，无回调** |
| iOS 受限 | Safari 无痕模式不可用 | **不受限** |

---

## 八、服务端新增

### 8.1 POST /api/__pd__/location/batch-create

用于小程序批量上报后台定位数据：

```json
请求:
{
  "records": [
    { "latitude": 39.91, "longitude": 116.41, "accuracy": 15,
      "source": "wx_background", "trigger": "background",
      "recorded_at": "2026-06-06T08:30:00Z" },
    ...
  ]
}

响应:
{ "accepted": 20, "errors": 0 }
```

NocoBase 端如不支持批量创建，可循环单条插入（控制在 20 条以内）。

### 8.2 GET /api/__pd__/trajectory

用于小程序查询某用户某日轨迹：

```text
请求:
GET /api/__pd__/trajectory?userId=42&date=2026-06-06

响应:
{
  "points": [
    { "latitude": 39.91, "longitude": 116.41, "recorded_at": "08:30:00" },
    { "latitude": 39.92, "longitude": 116.42, "recorded_at": "09:15:00" },
    ...
  ],
  "stays": [
    { "latitude": 39.91, "longitude": 116.41,
      "name": "东区仓库", "start": "08:30", "end": "11:45" },
    ...
  ],
  "center": { "latitude": 39.91, "longitude": 116.41 }
}
```

服务端处理流程：

```
1. 查询 location_history: 过滤 userId + date + is_valid=true
2. 清洗: 剔除 accuracy > 100m 的噪点
3. 聚停: 连续 3min 内在 50m 范围内 → 归为停留点
4. 抽稀: Douglas-Peucker 算法简化路径 (阈值 10m)
5. 返回 points + stays + center
```

### 8.3 配置要求 (同 v1)

```
WX_APPID=wxxxxxxxxxxxxx
WX_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

---

## 九、围栏与轨迹说明

### 9.1 围栏核验

小程序**不做任何围栏计算**。现有工作流 `考勤规则计算__post-create.js` 已在打卡提交后自动处理围栏核验、迟到早退计算、归档更新。

```
小程序打卡 → POST { latitude, longitude, check_type }
                  ↓
           attendance_records 创建
                  ↓
           工作流自动触发
           ├─ 从 DB 读 geofences
           ├─ 计算 point-to-polyline
           ├─ 回写 geofence_inside / geofence_distance / geofence_id
           ├─ 计算迟到早退
           └─ 更新 att_archives
```

### 9.2 轨迹数据流

```
微信后台定位 → wx.onLocationChange → 写入本地队列 (setStorageSync)
    ↓
定时 flush → POST /api/__pd__/location/batch-create → location_history 表
    ↓
管理人员查轨迹 → GET /api/__pd__/trajectory
    ↓
服务端清洗+抽稀+聚停 → 返回简化路径
    ↓
小程序 <map type="gcj02"> polyline 渲染
```

### 9.3 坐标系

**全程 GCJ-02**:
- 小程序 `wx.getLocation({ type: 'gcj02' })` → GCJ-02
- 入库 `location_history.latitude/longitude` → GCJ-02
- 围栏 `geofences.polyline_coords` → GCJ-02
- 小程序 `<map type="gcj02">` → 接收 GCJ-02

无需 `wgs84ToGcj02()` 转换。

---

## 十、微信审核策略

### 10.1 v2 新增的审核风险

| 风险 | 等级 | 说明 |
|------|------|------|
| `wx.startLocationUpdateBackground` | **高** | 受限 API，需提交使用场景说明、界面截图、公司资质 |
| `requiredBackgroundModes: ['location']` | **中** | 需在审核备注详细解释用途 |
| 用户隐私协议 | **中** | 必须明确写明后台定位数据采集范围、存储期限 |

### 10.2 审核准备材料

提交审核时需准备：

1. **使用场景说明** (文本):
   > 本小程序用于建筑工地人员考勤与工作轨迹记录。后台定位功能用于在工人完成打卡后，持续记录其工作期间的移动轨迹，以便管理人员查看工人全天工作路线与停留位置。定位数据仅存储于企业自有服务器，30 天后自动删除。

2. **界面截图**: 打卡页、轨迹页、设置页（含后台定位开关）的截图

3. **隐私协议链接**: 需在小程序内可访问的隐私协议页面，写明定位数据用途、存储期限、不共享第三方

### 10.3 与 v1 壳方案的审核隔离

```
v1 壳 (已上线)           → 前台定位，审核通过率 95%+
    ↓ 版本更新提交
v2 混合 (本方案)          → 追加后台定位 + 原生页面
    ↓                        ↓
    微信审核: 仅审核增量功能    即使被拒，v1 仍在线上运行
```

### 10.4 被拒应急预案

| 被拒原因 | 应对 |
|----------|------|
| "后台定位与核心功能无关" | 提交考勤制度文件、工人轨迹管理需求说明 |
| "未提供用户关闭方式" | 截图中展示设置页的后台定位开关（默认关闭） |
| "资质不足" | 补充公司营业执照、考勤系统说明 |

---

## 十一、与 v1 壳方案的关系

| 维度 | v1 壳 (快速上线) | v2 混合 (增强版) |
|------|-----------------|-----------------|
| 定位 | 前台 `wx.getLocation()` 仅打卡瞬间 | 前台+后台，全天持续收集 |
| 轨迹收集 | ❌ 未覆盖 | ✅ `startLocationUpdateBackground` + 离线队列 |
| 打卡页 | web-view 嵌入 H5 | 原生 WXML 页面 |
| 轨迹页 | ❌ 无 | ✅ 原生 `<map>` polyline |
| 看板 | web-view | web-view (不变) |
| 围栏逻辑 | 服务端工作流 | 服务端工作流 (不变) |
| 开发方式 | **新项目** | **v1 项目上升级** |
| 审核 | 快速通过 | 需准备后台定位说明 |
| 建议顺序 | **先上 v1** → 验证用户接受度和稳定性 → | **再升 v2** |

**不建议跳过 v1 直接 v2**。因为:
1. v2 涉及后台定位受限 API，审核周期不确定
2. v1 可以快速让工人用上，收集反馈
3. v2 在 v1 代码基础上增量开发，无重复工作

---

## 十二、开发排期

| 模块 | 工时 | 说明 |
|------|------|------|
| 小程序框架升级: app.json + tabBar + 页面路由 | 0.5d | 在 v1 基础上改 |
| 考勤打卡页: 定位 + 拍照 + 提交 + 状态显示 | 2d | 原生 WXML 实现 |
| 轨迹回放页: map + polyline + 日期选择 | 1.5d | 调用服务端 API |
| 个人设置页: 定位开关 + 缓存清理 | 0.5d | |
| 后台定位引擎: startLocationUpdateBackground + 场景调度 | 1.5d | |
| 离线队列: setStorageSync + flush | 1d | |
| 服务端: trajectory 端点 (清洗+抽稀+聚停) | 1.5d | |
| 服务端: location batch-create 端点 | 0.5d | |
| web-view 看板嵌入 + token 同步 | 0.5d | 复用 v1 |
| 联调 + 内测 | 1d | |
| **净开发工时** | **~10d** | |
| **总周期 (不含审核)** | **~15d** | |

---

## 十三、文件变更清单

### 13.1 新建文件

| 文件 | 说明 |
|------|------|
| `miniprogram-people-dynamic/app.json` | v2 全局配置 (含 requiredBackgroundModes) |
| `miniprogram-people-dynamic/app.js` | v2 入口 + 后台定位引擎 |
| `miniprogram-people-dynamic/app.wxss` | 全局样式 |
| `miniprogram-people-dynamic/pages/clock/clock.wxml` | 考勤打卡页模板 |
| `miniprogram-people-dynamic/pages/clock/clock.js` | 考勤打卡页逻辑 |
| `miniprogram-people-dynamic/pages/clock/clock.wxss` | 考勤打卡页样式 |
| `miniprogram-people-dynamic/pages/trajectory/trajectory.wxml` | 轨迹回放页模板 |
| `miniprogram-people-dynamic/pages/trajectory/trajectory.js` | 轨迹回放页逻辑 |
| `miniprogram-people-dynamic/pages/trajectory/trajectory.wxss` | 轨迹回放页样式 |
| `miniprogram-people-dynamic/pages/profile/profile.wxml` | 个人设置页模板 |
| `miniprogram-people-dynamic/pages/profile/profile.js` | 个人设置页逻辑 |
| `miniprogram-people-dynamic/pages/profile/profile.wxss` | 个人设置页样式 |
| `miniprogram-people-dynamic/components/fence-status/fence-status.wxml` | 围栏状态组件模板 |
| `miniprogram-people-dynamic/components/fence-status/fence-status.js` | 围栏状态组件逻辑 |
| `miniprogram-people-dynamic/components/fence-status/fence-status.wxss` | 围栏状态组件样式 |
| `miniprogram-people-dynamic/utils/queue.js` | 离线队列 |

### 13.2 修改文件

| 文件 | 改动 |
|------|------|
| `miniprogram-people-dynamic/utils/api.js` | 新增 trajectory / batch-create 接口 |
| `@nocobase/plugin-people-dynamic` | +2 端点: trajectory + batch-create |

### 13.3 复用 v1 文件

| 文件 | 来源 |
|------|------|
| `miniprogram-people-dynamic/pages/index/*` | 从 v1 `miniprogram-wechat-shell/pages/index/` 复制 |
| `miniprogram-people-dynamic/utils/auth.js` | 从 v1 `utils/auth.js` 复制 |
| `miniprogram-people-dynamic/utils/config.js` | 从 v1 `utils/config.js` 复制 |

### 13.4 NocoBase 后端不修改

- `POST /api/__pd__/attendance/submit` — 已有
- `POST /api/attendance_records:create` — 已有
- 工作流 `考勤规则计算__post-create.js` — 已有
- `dashboard/人员动态.html` — 不动
- `assets/attend.js` — 不动
- `assets/core.js` — 不动
- `nginx.conf` — 不动
- `docker-compose.yml` — 不动
