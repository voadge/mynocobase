# 实施计划：人员动态定位系统优化 v2.0

> 版本: v2.2  
> 日期: 2026-06-06  
> 状态: 待审计 ✅  
> 审计问题修正清单: 见附录A  
> 审计报告 WorkBuddy 吸收项: 见附录D  

---

## 目录

1. [审计问题修正说明](#一审计问题修正说明)
2. [现状分析与约束](#二现状分析与约束)
3. [三端分离架构](#三三端分离架构)
4. [阶段一：核心基础设施 (D1-D3)](#四阶段一核心基础设施-d1-d3)
5. [阶段二：前端集成 (D4-D5)](#五阶段二前端集成-d4-d5)
6. [阶段三：服务端聚合插件 (D6-D7)](#六阶段三服务端聚合插件-d6-d7)
7. [阶段四：质量增强 (D8)](#七阶段四质量增强-d8)
8. [阶段五：联调与压测 (D9)](#八阶段五联调与压测-d9)
9. [阶段六：缓冲期 (D10)](#九阶段六缓冲期-d10)
10. [微信小程序接入准备 (v2.1 规划)](#十微信小程序接入准备-v21-规划)
11. [文件变更清单](#十一文件变更清单)
12. [部署与回滚](#十二部署与回滚)
13. [验收标准](#十三验收标准)
14. [风险与对策](#十四风险与对策)
15. [附录A：审计问题修正对照表](#十五附录a审计问题修正对照表)
16. [附录B：坐标系转换说明](#十六附录b坐标系转换说明)
17. [附录C：隐私合规说明](#十七附录c隐私合规说明)
18. [附录D：WorkBuddy 审计吸收项对照表](#十八附录dworkbuddy-审计吸收项对照表)

---

## 一、审计问题修正说明

本 v2.0 版本针对审计发现的 **6 项阻塞问题 + 8 项关键遗漏** 进行了全面修正。详见附录A 逐条对照。

---

## 二、现状分析与约束

### 2.1 当前定位相关模块

| 模块 | 文件 | 定位方式 | 兜底策略 | 数据写入 |
|------|------|----------|----------|----------|
| 看板天气 | `assets/core.js` | GPS 三端 + 逆地理 | IP定位 → 默认城市 | 无 |
| 考勤打卡 | `assets/attend.js` | GPS 三端 + 坐标转换 | IP定位 → 手动输入 | `attendance_records` + `location_history` |
| 人员动态 | `dashboard/人员动态.html` | GPS 三端 + IP定位 | 无 | `location_history` (定时采集) |

### 2.2 核心问题

1. **代码重复**：三端定位适配、坐标转换、逆地理编码在 3 个文件中重复实现
2. **定时轮询低效**：`setInterval` 固定间隔，无运动感知，无离线容错
3. **无离线队列**：网络失败直接丢失数据（`console.warn` 不处理）
4. **无镇街名显示**：地图标记仅显示坐标，无地址信息
5. **轨迹质量差**：原始 GPS 点直接渲染，无精度过滤/平滑
6. **多请求首屏慢**：4 个并行请求才能渲染完整页面
7. **坐标系未转换**：`navigator.geolocation` 返回 WGS-84，国内地图用 GCJ-02，偏差可达 100-500 米
8. **隐私合规缺失**：持续采集位置无告知同意机制

### 2.3 设计约束

| 约束项 | 策略 |
|--------|------|
| 不改变看板+NocoBase 架构 | 仅新增 `assets/location-service.js` + 独立插件包，不改核心 |
| 不拖慢系统 | 全部异步非阻塞、Canvas 离屏渲染、增量请求 |
| 页面不加载变慢 | SW 静默注册、`LocationService` 懒加载、聚合 API 单请求 |
| 可靠性 | IndexedDB 队列 + 指数退避 + 死信隔离 |
| 可扩展性 | 事件总线 + `location_history.metadata` JSONB 字段预留水印接口 |
| 目标平台 | **Web/PWA 为主**，微信小程序为 v2.1 |
| 同时在线 | 50-200 人（PC 大屏全量；移动端上限 20 人聚类） |
| 轨迹用途 | 考勤核算 + 展示，统一 **100m** 精度阈值 |
| 坐标系 | **所有输出转 GCJ-02**（适配高德地图瓦片 + 围栏校验） |
| 围栏轮询 | 常量 `FENCE_POLL_INTERVAL = 30000`，改代码可调 |
| 逆地理 | 客户端 `sessionStorage` 缓存 1h + 服务端每日 03:00 批量回填 |

---

## 三、三端分离架构

```
┌─────────────────────────────┐     ┌─────────────────────────────┐     ┌─────────────────────────────┐
│   工人采集端 (移动 H5)       │     │   管理大屏 (PC)              │     │   管理查看端 (移动 H5)       │
│                             │     │                             │     │                             │
│  - LocationService.watch    │     │  - 200 人全量 Canvas 渲染    │     │  - 最多 20 人聚类显示        │
│  - 前台定位 + 运动触发       │     │  - 轨迹按需加载               │     │  - 只看在线摘要              │
│  - IndexedDB 离线队列        │     │  - 围栏/统计全功能           │     │  - 只读不写                  │
│  - WGS-84 → GCJ-02 转换     │     │  - 10s 全量轮询              │     │  - 简版仪表盘                │
│  - 精度过滤 ≤100m           │     │                             │     │                             │
│  - 隐私同意弹窗              │     │                             │     │                             │
│  - iOS 无后台定位 (已知限制)  │     │                             │     │                             │
└───────────┬─────────────────┘     └───────────┬─────────────────┘     └───────────┬─────────────────┘
            │                                    │                                    │
            └────────────────────────────────────┼────────────────────────────────────┘
                                                 ▼
                              ┌──────────────────────────────────┐
                              │   @nocobase/plugin-people-dynamic │
                              │  ───────────────────────────────  │
                              │  /api/__pd__/dashboard-snapshot   │
                              │  /api/__pd__/fences               │
                              │  /api/__pd__/workers              │
                              │  /api/location_history:create     │
                              └──────────────────────────────────┘
```

### 轮询策略总表

| 数据 | PC 大屏 | 移动端 | 说明 |
|------|---------|--------|------|
| 人员位置 + 考勤 | 10s 全量 | 10s 全量 | 服务端 ~5KB/次，可接受 |
| 围栏 | `FENCE_POLL_INTERVAL=30s` | 不轮询 | 移动端不渲染围栏 |
| 位置上报(围栏内) | — | `watchPosition` 2min 阈值 | 运动触发 |
| 位置上报(围栏外) | — | `watchPosition` 30min 阈值 | 运动触发 |
| 逆地理回填 | 每日 03:00 | 客户端缓存 1h | 服务端定时任务批量 |

---

## 四、阶段一：核心基础设施 (D1-D3)

### 4.1 `assets/location-service.js` — 统一位置服务单例

#### 4.1.1 核心配置常量

```javascript
const LOCATION_CONFIG = Object.freeze({
  // 精度
  ACCURACY_THRESHOLD: 100,              // 统一精度阈值(米)，超限丢弃

  // 运动检测
  STATIONARY_THRESHOLD: 50,             // 静止位移阈值(米)
  STATIONARY_DURATION: 300000,          // 静止超时(5min) 停止 GPS
  VEHICLE_SLOW_WINDOW: 300000,          // 车辆缓行判定窗口(5min)
  MOTION_ACCEL_THRESHOLD: 0.5,          // 加速度模阈值(m/s²)

  // 上报频率(毫秒)
  FENCE_INSIDE_INTERVAL: 120000,         // 围栏内: 2min
  FENCE_OUTSIDE_INTERVAL: 1800000,       // 围栏外: 30min

  // 围栏轮询
  FENCE_POLL_INTERVAL: 30000,           // 围栏轮询(可改)

  // 离线队列
  MAX_QUEUE_RETRIES: 5,                 // 最大重试次数
  MAX_QUEUE_SIZE: 1000,                 // 队列上限，超限丢弃最旧

  // 逆地理缓存
  GEO_CACHE_TTL: 3600000,              // 缓存有效期(1h)

  // 移动端渲染上限
  MOBILE_MAX_MARKERS: 20,              // 移动端最多显示人数
});
```

#### 4.1.2 对外 API

```javascript
const LocationService = {
  getCurrentPosition(opts)          // 一次定位（打卡页/手动定位用）
  watchPosition(callback, opts)     // 持续定位（人员动态后台采集用）
  stopWatch(watchId)                // 停止持续定位
  reverseGeocode(lat, lng)          // 逆地理编码 → {township,street,district,city}
  queueLocation(data)               // 入离线队列 (IndexedDB)
  flushQueue()                      // 刷新队列
  wgs84ToGcj02(lat, lng)            // 坐标转换 (WGS-84 → GCJ-02)
  on(event, handler)                // 事件订阅
  getState()                        // 获取当前状态
}
```

#### 4.1.3 三端定位适配 (内部)

```javascript
async function _getPositionNative(opts) {
  // 优先 Capacitor → navigator.geolocation → Harmony bridge
  if (typeof Capacitor !== 'undefined' && Capacitor.isNative && Capacitor.Plugins?.Geolocation) {
    return Capacitor.Plugins.Geolocation.getCurrentPosition(opts);
  }
  if (typeof window.appBridge?.getLocation === 'function') {
    return new Promise((resolve, reject) => {
      window.appBridge.getLocation(
        (lat, lng) => resolve({ coords: { latitude: lat, longitude: lng, accuracy: null } }),
        () => reject(new Error('Harmony location failed'))
      );
    });
  }
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, opts);
  });
}
```

#### 4.1.4 坐标系转换 (WGS-84 → GCJ-02)

```javascript
// 坐标转换常量
const _PI = 3.141592653589793;
const _A = 6378245.0;
const _EE = 0.00669342162296594323;

function _outOfChina(lat, lng) {
  return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271;
}

function _transformLat(x, y) {
  let ret = -100 + 2*x + 3*y + 0.2*y*y + 0.1*x*y + 0.2*Math.sqrt(Math.abs(x));
  ret += (20*Math.sin(6*x*_PI) + 20*Math.sin(2*x*_PI)) * 2/3;
  ret += (20*Math.sin(y*_PI) + 40*Math.sin(y/3*_PI)) * 2/3;
  ret += (160*Math.sin(y/12*_PI) + 320*Math.sin(y*_PI/30)) * 2/3;
  return ret;
}

function _transformLng(x, y) {
  let ret = 300 + x + 2*y + 0.1*x*x + 0.1*x*y + 0.1*Math.sqrt(Math.abs(x));
  ret += (20*Math.sin(6*x*_PI) + 20*Math.sin(2*x*_PI)) * 2/3;
  ret += (20*Math.sin(x*_PI) + 40*Math.sin(x/3*_PI)) * 2/3;
  ret += (150*Math.sin(x/12*_PI) + 300*Math.sin(x/30*_PI)) * 2/3;
  return ret;
}

function wgs84ToGcj02(lat, lng) {
  if (_outOfChina(lat, lng)) return { lat, lng };
  const dLat = _transformLat(lng - 105, lat - 35);
  const dLng = _transformLng(lng - 105, lat - 35);
  const radLat = lat / 180 * _PI;
  let magic = Math.sin(radLat);
  magic = 1 - _EE * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  const gcjLat = lat + (dLat * 180) / ((_A * (1 - _EE)) / (magic * sqrtMagic) * _PI);
  const gcjLng = lng + (dLng * 180) / (_A / sqrtMagic * Math.cos(radLat) * _PI);
  return { lat: gcjLat, lng: gcjLng };
}
```

**所有位置数据入库前必须经过 `wgs84ToGcj02()` 转换**，确保与高德地图瓦片、围栏 GeoJSON 坐标系统一。

#### 4.1.5 运动检测机制

```javascript
function _startMotionDetection() {
  let lastAccelTime = Date.now();
  let lastPositionCheck = null;

  // 方案 A: DeviceMotionEvent (需 HTTPS + iOS 需 requestPermission)
  if (window.DeviceMotionEvent) {
    // iOS 13+ 需要显式请求权限
    const permFn = typeof DeviceMotionEvent.requestPermission === 'function'
      ? DeviceMotionEvent.requestPermission()
      : Promise.resolve('granted');

    permFn.then(state => {
      if (state === 'granted') {
        window.addEventListener('devicemotion', (e) => {
          const acc = e.accelerationIncludingGravity;
          if (!acc) return;
          const mag = Math.sqrt(acc.x*acc.x + acc.y*acc.y + acc.z*acc.z);
          if (Math.abs(mag - 9.8) > MOTION_ACCEL_THRESHOLD) {
            lastAccelTime = Date.now();
            _state.isMoving = true;
          }
        });
      }
    }).catch(() => {});
  }

  // 方案 B (兜底): 每 5min 对比位移 (防车辆缓行误判)
  setInterval(() => {
    const cur = _state.lastPosition;
    if (!cur || !lastPositionCheck) { lastPositionCheck = cur; return; }
    const dist = _haversine(lastPositionCheck.lat, lastPositionCheck.lng, cur.lat, cur.lng);
    if (dist < STATIONARY_THRESHOLD) _state.isMoving = false;
    else _state.isMoving = true;
    lastPositionCheck = cur;
  }, VEHICLE_SLOW_WINDOW);
}
```

#### 4.1.6 逆地理编码缓存 (sessionStorage)

```javascript
async function reverseGeocode(lat, lng) {
  // 缓存 key: lat/lng 四舍五入到 4 位小数 (~11m 精度)
  const key = 'geo_' + lat.toFixed(4) + '_' + lng.toFixed(4);

  // 1. sessionStorage 缓存 (当前会话)
  try {
    const cached = sessionStorage.getItem(key);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Date.now() - parsed.t < GEO_CACHE_TTL) return parsed.d;
    }
  } catch(e) {}

  // 2. localStorage 缓存 (跨会话)
  try {
    const cached = localStorage.getItem(key);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Date.now() - parsed.t < GEO_CACHE_TTL) {
        sessionStorage.setItem(key, cached); // 预热到 session
        return parsed.d;
      }
    }
  } catch(e) {}

  // 3. 调用逆地理 API (服务端代理，保护 key)
  try {
    const r = await fetch(`/api/__dh__/regeo?location=${lng},${lat}`);
    const d = await r.json();
    if (d.status === '1' && d.regeocode) {
      const addr = d.regeocode.addressComponent;
      const result = {
        township: addr.township || '',
        street: addr.streetNumber?.street || addr.street || '',
        district: addr.district || '',
        city: addr.city || ''
      };
      const cacheVal = JSON.stringify({ d: result, t: Date.now() });
      sessionStorage.setItem(key, cacheVal);
      localStorage.setItem(key, cacheVal);
      return result;
    }
  } catch(e) {}

  return { township: '', street: '', district: '', city: '' };
}
```

#### 4.1.7 离线队列 (IndexedDB)

```javascript
// 数据库初始化
async function _openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('LocationDB', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('location_queue')) {
        const store = db.createObjectStore('location_queue', {
          keyPath: 'id', autoIncrement: true
        });
        store.createIndex('timestamp', 'timestamp');
        store.createIndex('userId', 'userId');
        store.createIndex('status', 'status');
      }
    };
  });
}

// 入队
async function queueLocation(data) {
  const db = await _openDB();
  const tx = db.transaction('location_queue', 'readwrite');
  const store = tx.objectStore('location_queue');

  // 检查队列上限
  const count = await store.count();
  if (count >= MAX_QUEUE_SIZE) {
    // 丢弃最旧的 100 条
    const cursor = await store.openCursor();
    let deleted = 0;
    while (cursor && deleted < 100) {
      store.delete(cursor.primaryKey);
      cursor.continue();
      deleted++;
    }
  }

  const record = {
    ...data,
    status: 'pending',
    retryCount: 0,
    timestamp: Date.now()
  };
  store.add(record);

  // 触发 SW background-sync
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.ready.then(reg => {
      reg.sync?.register('location-sync');
    });
  }
}

// 出队
async function flushQueue() {
  const db = await _openDB();
  const tx = db.transaction('location_queue', 'readwrite');
  const store = tx.objectStore('location_queue');
  const all = await store.index('status').getAll('pending');

  let success = 0;
  for (const item of all) {
    try {
      const res = await fetch('/api/location_history:create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + _getToken()
        },
        body: JSON.stringify(item)
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      await store.delete(item.id);
      success++;
    } catch(e) {
      if (++item.retryCount >= MAX_QUEUE_RETRIES) {
        item.status = 'failed';
        await store.put(item);
        console.warn('Location queue: 丢弃死信', item.id);
      } else {
        item.status = 'retrying';
        await store.put(item);
      }
    }
  }
  _emit('queue-flush', { success, total: all.length });
  return success;
}
```

#### 4.1.8 隐私合规 + 权限拒绝引导

```javascript
function _checkConsent() {
  const granted = localStorage.getItem('location_consent_granted');
  if (granted) return true;

  const ok = confirm(
    '本系统将采集您的位置信息用于考勤核算与轨迹展示。\n' +
    '数据仅保留 30 天，不会共享给第三方。\n\n' +
    '是否同意？'
  );
  if (ok) {
    localStorage.setItem('location_consent_granted', Date.now().toString());
    return true;
  }
  return false;
}

// 权限拒绝引导 (审计吸收: WorkBuddy 建议)
function showPermissionGuide() {
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const guideMsg = isMobile
    ? '请在手机「设置」→「应用」→「浏览器」→「位置权限」中开启。'
    : '请在浏览器地址栏左侧点击锁图标 → 「网站设置」→「位置」→「允许」。';
  alert('位置权限已被拒绝，无法获取定位。\n\n' + guideMsg + '\n\n开启后请刷新页面重试。');
}

// 在 watchPosition / getCurrentPosition 入口调用
if (!_checkConsent()) {
  _emit('permission-denied', '用户拒绝位置采集同意');
  if (typeof showPermissionGuide === 'function') showPermissionGuide();
  return Promise.reject(new Error('用户拒绝位置采集'));
}
```

#### 4.1.9 精度颜色映射表

```javascript
const ACCURACY_COLORS = [
  { threshold: 20, color: '#00ff88', label: '高精度' },
  { threshold: 50, color: '#ffd93d', label: '中精度' },
  { threshold: 100, color: '#ffaa00', label: '低精度' },
  { threshold: Infinity, color: '#ff6b6b', label: '超限' },
];

function getAccuracyColor(accuracy) {
  if (accuracy == null) return '#00d4ff';
  for (const level of ACCURACY_COLORS) {
    if (accuracy <= level.threshold) return level.color;
  }
  return '#ff6b6b';
}
```

#### 4.1.10 事件总线

```javascript
const _handlers = {};
function on(event, handler) {
  if (!_handlers[event]) _handlers[event] = [];
  _handlers[event].push(handler);
  return () => { _handlers[event] = _handlers[event].filter(h => h !== handler); };
}
function _emit(event, data) {
  (_handlers[event] || []).forEach(h => {
    try { h(data); } catch(e) { console.warn('LocationService handler error:', e); }
  });
}
```

#### 4.1.11 精度过滤 + 入库主逻辑

```javascript
function _filterAndReport(position) {
  // 1. 坐标系转换
  const gcj = wgs84ToGcj02(position.lat, position.lng);
  const accuracy = position.accuracy;

  // 2. 精度过滤
  if (accuracy != null && accuracy > ACCURACY_THRESHOLD) {
    _emit('accuracy-filtered', { lat: gcj.lat, lng: gcj.lng, accuracy });
    return;
  }

  // 3. 运动检测
  if (_isMovementSignificant({ latitude: gcj.lat, longitude: gcj.lng, accuracy })) {
    _state.isMoving = true;
    _resetStationaryTimer();
  }

  // 4. 逆地理编码 (缓存)
  reverseGeocode(gcj.lat, gcj.lng).then(addr => {
    const consentAt = localStorage.getItem('location_consent_granted');
    const data = {
      latitude: gcj.lat,
      longitude: gcj.lng,
      accuracy: Math.round(accuracy) || null,
      source: position.source || 'gps',
      trigger: _state.isMoving ? 'movement' : 'scheduled',
      recorded_at: new Date().toISOString(),
      township: addr.township || '',
      street: addr.street || '',
      district: addr.district || '',
      is_valid: true,
      consent_at: consentAt ? new Date(parseInt(consentAt)).toISOString() : null,
      metadata: {}
    };

    // 5. 入队
    queueLocation(data);
    _emit('position', data);
  });
}
```

#### 4.1.12 SW token 传递 (postMessage)

**页面端：**
```javascript
// LocationService 向 SW 提供 token
navigator.serviceWorker.addEventListener('message', (event) => {
  if (event.data.type === 'REQUEST_TOKEN') {
    const token = localStorage.getItem('NOCOBASE_TOKEN') || localStorage.getItem('nocobase_token');
    event.source.postMessage({ type: 'TOKEN_RESPONSE', token });
  }
});
```

**SW 端 (`dashboard/sw.js`)：**
```javascript
self.addEventListener('message', (event) => {
  if (event.data.type === 'REQUEST_TOKEN_REPLY') {
    // 存储 token 供 sync 使用
  }
});

self.addEventListener('sync', (event) => {
  if (event.tag === 'location-sync') {
    event.waitUntil((async () => {
      const clients = await self.clients.matchAll({ type: 'window' });
      for (const client of clients) {
        client.postMessage({ type: 'REQUEST_TOKEN' });
      }
    })());
  }
});
```

---

### 4.2 `dashboard/sw.js` — Service Worker

**作用域**: `/dashboard/`  
**文件位置**: `E:\my-project\dashboard\sw.js`

```javascript
const LOCATION_SYNC_TAG = 'location-sync';
let authToken = null;

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// 从页面接收 token
self.addEventListener('message', (event) => {
  if (event.data.type === 'TOKEN_RESPONSE') {
    authToken = event.data.token;
  }
  if (event.data.type === 'SYNC_NOW') {
    event.waitUntil(syncLocationQueue());
  }
});

// Background Sync
self.addEventListener('sync', (event) => {
  if (event.tag === LOCATION_SYNC_TAG) {
    event.waitUntil(requestTokenThenSync());
  }
});

async function requestTokenThenSync() {
  const clients = await self.clients.matchAll({ type: 'window' });
  for (const client of clients) {
    client.postMessage({ type: 'REQUEST_TOKEN' });
  }
  // 等 token 回来后执行同步 (message handler 会调用)
  await new Promise(r => setTimeout(r, 2000));
  await syncLocationQueue();
}

async function syncLocationQueue() {
  if (!authToken) return;
  // 打开 DB 并刷新队列 (逻辑与 flushQueue 一致)
  // ...
}
```

---

### 4.3 DB Migration: `location_history` 表结构扩展

```sql
-- v2.0: 位置历史表扩展 migration
-- 新增字段
ALTER TABLE location_history
ADD COLUMN IF NOT EXISTS source VARCHAR(20) DEFAULT 'gps',
ADD COLUMN IF NOT EXISTS accuracy INTEGER,
ADD COLUMN IF NOT EXISTS trigger VARCHAR(20) DEFAULT 'scheduled',
ADD COLUMN IF NOT EXISTS township VARCHAR(100) DEFAULT '',
ADD COLUMN IF NOT EXISTS street VARCHAR(100) DEFAULT '',
ADD COLUMN IF NOT EXISTS district VARCHAR(100) DEFAULT '',
ADD COLUMN IF NOT EXISTS is_valid BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS consent_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- 新增: gps_state (来自审计吸收)
ALTER TABLE location_history ADD COLUMN IF NOT EXISTS gps_state VARCHAR(20) DEFAULT 'ok';

-- 新增: attendance_records dedup_status (重复打卡标记)
ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS dedup_status VARCHAR(20) DEFAULT 'primary';
COMMENT ON COLUMN attendance_records.dedup_status IS 'primary: 有效考勤 | duplicate: 重复打卡(仅位置追踪)';

-- 复合索引 (保障聚合查询性能 < 50ms)
CREATE INDEX IF NOT EXISTS idx_lh_user_time_valid
  ON location_history (created_by_id, recorded_at DESC)
  WHERE is_valid = true;

CREATE INDEX IF NOT EXISTS idx_lh_recorded_at
  ON location_history (recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_lh_consent
  ON location_history (consent_at)
  WHERE consent_at IS NOT NULL;

-- 30 天清理定时任务 (PostgreSQL pg_cron 或应用层调度)
-- CREATE EXTENSION IF NOT EXISTS pg_cron;
-- SELECT cron.schedule('cleanup-location-history', '0 3 * * *',
--   $$DELETE FROM location_history WHERE recorded_at < NOW() - INTERVAL '30 days'$$);
```

### 4.4 重复打卡逻辑（WF-41 工作流 JS 节点）

**来源**: 审计报告吸收 — 替代服务端速率限制，更适应业务语义。

**规则** (按用户确认):
- **上班**: 当日最早的 `上班` 记录为有效考勤，后续相同 check_type 标记 `dedup_status='duplicate'`，作为位置追踪
- **下班**: 当日最晚的 `下班` 记录为有效考勤，后续相同 check_type 标记 `dedup_status='duplicate'`
- **请假/出差**: 正常处理，不做 dedup

**实现位置**: 在现有 WF-41 (`366321793040394`) 工作流的 `attendance_records:afterCreate` 触发后增加条件节点。

**JS 节点伪代码**:
```javascript
// 在 WF-41 中新增的 JS 条件节点
const now = new Date();
const today = now.toISOString().substring(0, 10);
const record = $record;
const uid = record.createdById;

// 仅处理 上班/下班 类型
if (!['上班', '下班'].includes(record.check_type)) {
  return { action: 'normal' };
}

// 查询今日同类型记录
const existing = await db.getRepository('attendance_records').find({
  filter: {
    createdById: uid,
    check_type: record.check_type,
    createdAt: { $dateBetween: [today, today] },
    dedup_status: 'primary'
  },
  sort: record.check_type === '上班' ? 'check_time' : '-check_time',
  pageSize: 1
});

if (existing.length === 0) {
  // 第一条 → 标记为 primary
  await db.getRepository('attendance_records').update({
    filter: { id: record.id },
    values: { dedup_status: 'primary' }
  });
  return { action: 'primary' };
}

// 当前记录不是第一条 → 标记为 duplicate，仅做位置追踪
await db.getRepository('attendance_records').update({
  filter: { id: record.id },
  values: { dedup_status: 'duplicate' }
});

return { action: 'duplicate' };
```

**字段依赖**: `attendance_records.dedup_status` (已在上方迁移中创建)。

---

## 五、阶段二：前端集成 (D4-D5)

### 5.1 `dashboard/人员动态.html` 重构

#### 5.1.1 替换对照表

| 原代码位置 | 原实现 | 替换为 |
|------------|--------|--------|
| L695-L724 `collectAndReport()` | 定时轮询 + 三端分支 | `LocationService.watchPosition(onUpdate)` |
| L763-L800 `locateMe()` | 三端 + IP + 浏览器 | `LocationService.getCurrentPosition()` |
| L344-L375 `loadFences/renderFences` | 30s 轮询 | 常量 `FENCE_POLL_INTERVAL` |
| L378-L432 多请求首屏 | 4 个独立 API | 单次 `GET /api/__pd__/dashboard-snapshot` |
| L454-L489 `renderMarkers()` | DOM Marker | **原生 L.Canvas** (移除 leaflet-canvas-markers) |
| L579-L604 `loadTrajectory()` | 直接渲染 | 精度过滤 ≤100m + 指数平滑 |
| L727-L739 `startPolling()` | 4 请求 | `loadSnapshot()` 单请求全量 |

#### 5.1.2 新版数据流

```javascript
// 页面启动
if (!LocationService._checkConsent()) { /* 禁用定位功能 */ }
initMap();
startPolling();
LocationService.watchPosition(onUserPositionUpdate);

// 聚合加载 (全量轮询，不做增量)
async function loadSnapshot() {
  const data = await apiGet('/api/__pd__/dashboard-snapshot');
  allUsers = data.workers;
  allFences = data.fences;
  todayRecords = data.records;
  Object.assign(latestLocations, data.latestLocations);
  Object.assign(onlineStatus, data.online);
  computeStats(data.stats);
  renderAll();
}

function startPolling() {
  loadSnapshot();
  setInterval(loadSnapshot, 10000);                  // 10s 人员数据
  setInterval(loadFences, FENCE_POLL_INTERVAL);      // 30s+ 围栏
}
```

#### 5.1.3 Canvas 原生渲染

```javascript
// 使用 Leaflet 内置 Canvas 渲染器 (无外部依赖)
// L.canvas() 是 L.Renderer.Canvas 的简写
const map = L.map('map', {
  renderer: L.canvas({ padding: 0.5 }),
  preferCanvas: true
});

function renderMarkers() {
  // 清除旧标记
  for (const uid in userMarkers) { map.removeLayer(userMarkers[uid]); }
  userMarkers = {};

  // 判断移动端 vs PC
  const isMobile = window.innerWidth < 768;
  const maxMarkers = isMobile ? MOBILE_MAX_MARKERS : Infinity;
  let count = 0;

  allUsers.forEach(u => {
    if (count >= maxMarkers) return;
    const loc = latestLocations[u.id];
    if (!loc) return;
    const isOnline = onlineStatus[u.id];
    const { lat, lng } = loc;

    // 使用 L.circleMarker (Canvas 友好)
    const marker = L.circleMarker([lat, lng], {
      radius: isOnline ? 7 : 5,
      color: getAccuracyColor(loc.accuracy),
      fillColor: isOnline ? '#00ff88' : '#5a6a7a',
      fillOpacity: isOnline ? 0.8 : 0.4,
      weight: isOnline ? 2 : 1,
      className: isOnline ? 'marker-pulse' : ''
    }).addTo(map);

    marker.bindPopup(createPopupContent(u, loc, isOnline));
    marker.on('click', () => selectUser(u.id));
    userMarkers[u.id] = marker;
    count++;
  });

  if (isMobile && allUsers.length > maxMarkers) {
    showClusterHint(allUsers.length - maxMarkers);
  }
}
```

#### 5.1.4 镇街名 + 精度显示

```javascript
function createPopupContent(u, loc, isOnline) {
  const addr = [loc.township, loc.street, loc.district].filter(Boolean).join(' · ');
  const accColor = getAccuracyColor(loc.accuracy);
  return [
    '<b>' + escHtml(u.nickname || u.username) + '</b>',
    isOnline ? '🟢 在线' : '⚪ 离线',
    addr ? '📍 ' + addr : '',
    loc.accuracy != null
      ? '<span style="color:' + accColor + '">精度: ±' + Math.round(loc.accuracy) + 'm</span>'
      : '',
    loc.recorded_at ? '<small>' + new Date(loc.recorded_at).toLocaleString() + '</small>' : ''
  ].filter(Boolean).join('<br>');
}
```

#### 5.1.5 轨迹加载 (精度过滤 + 平滑)

```javascript
async function loadTrajectory(uid) {
  clearTrajectory();
  const records = await apiGet(
    '/api/location_history:list?filter[createdById]=' + uid +
    '&filter[is_valid]=true&sort=recorded_at&pageSize=200'
  );
  const points = records
    .filter(r => r.accuracy == null || r.accuracy <= 100)
    .map(r => [parseFloat(r.latitude), parseFloat(r.longitude)])
    .filter((p, i, arr) => i === 0 || _haversine(p, arr[i-1]) < 5000); // 去漂移

  if (points.length < 2) return;
  const smoothed = _smoothTrajectory(points, 0.3);
  trajectoryLayer = L.polyline(smoothed, {
    color: '#ffd93d', weight: 3, opacity: 0.7, dashArray: '8,6'
  }).addTo(map);
  map.fitBounds(trajectoryLayer.getBounds().pad(0.2));
}

function _smoothTrajectory(points, alpha = 0.3) {
  if (points.length < 3) return points;
  const result = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const prev = result[i - 1];
    result.push([
      prev[0] + alpha * (points[i][0] - prev[0]),
      prev[1] + alpha * (points[i][1] - prev[1])
    ]);
  }
  return result;
}

function _haversine(p1, p2) {
  const R = 6371000;
  const dLat = (p2[0] - p1[0]) * Math.PI / 180;
  const dLng = (p2[1] - p1[1]) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(p1[0]*Math.PI/180) * Math.cos(p2[0]*Math.PI/180) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
```

---

### 5.2 `assets/attend.js` 精简

**替换位置**: 原 L472-L587 (约 120 行重复定位代码) → 委托 LocationService

```javascript
// 替换 getLocation / _getLocationOnce / _getLocationByIP / _showGpsHelp
function getLocation() {
  LocationService.getCurrentPosition({ highAccuracy: true, timeout: 15000 })
    .then(pos => {
      // pos 已经是 GCJ-02 坐标
      attendLocation = { lat: pos.lat, lng: pos.lng, accuracy: pos.accuracy };
      gpsState = 'ok';
      document.getElementById('attendLocation').textContent =
        pos.lat.toFixed(5) + ',' + pos.lng.toFixed(5) + ' ±' + Math.round(pos.accuracy) + 'm';
      document.getElementById('locationStatus').innerHTML = '✓ 位置已获取';
      document.getElementById('locationStatus').className = 'attend-location-status got';
      checkPolylineGeofence(pos.lat, pos.lng).then(updateSubmitState);
    })
    .catch(err => {
      gpsState = 'fail';
      document.getElementById('attendLocation').innerHTML =
        (err.message || '获取失败') +
        ' <a href="javascript:void(0)" onclick="getLocation()" style="color:#00d4ff">重试</a>';
      _getLocationByIP(); // IP 兜底
    });
}
```

**保留**: `wgs84ToGcj02()` (由 LocationService 提供，可直接引用)、`checkPolylineGeofence`、人脸检测、指纹、提交流程。

---

### 5.3 `assets/core.js` 复用

```javascript
// _fetchCityByCoords 改为调用 LocationService.reverseGeocode()
async function _fetchCityByCoords(lat, lng) {
  _weatherDisplayLoc = '';
  try {
    const addr = await LocationService.reverseGeocode(lat, lng);
    _weatherDisplayLoc = addr.township || addr.street || addr.district || '';
    const city = addr.city || DEFAULT_CITY;
    fetchCMA(city);
  } catch(e) {
    // fallback...
  }
}
```

---

## 六、阶段三：服务端聚合插件 (D6-D7)

### 6.1 新建插件包 `@nocobase/plugin-people-dynamic`

**目录结构**:
```
nocobase-plugin-people-dynamic/
├── package.json
├── @nocobase/
│   └── plugin-people-dynamic/
│       ├── package.json
│       └── dist/
│           └── server/
│               └── index.js          # 主入口
└── README.md
```

**`nocobase-plugin-people-dynamic/package.json`**:
```json
{
  "name": "@nocobase/plugin-people-dynamic",
  "version": "1.0.0",
  "main": "@nocobase/plugin-people-dynamic/dist/server/index.js",
  "displayName": "People Dynamic",
  "displayName.zh-CN": "人员动态",
  "license": "Apache-2.0",
  "peerDependencies": {
    "@nocobase/server": "2.x"
  }
}
```

**`@nocobase/plugin-people-dynamic/package.json`**:
```json
{
  "name": "@nocobase/plugin-people-dynamic",
  "version": "1.0.0",
  "main": "dist/server/index.js",
  "license": "Apache-2.0",
  "peerDependencies": {
    "@nocobase/server": "2.x"
  }
}
```

### 6.2 服务端入口 `dist/server/index.js`

```javascript
'use strict';

const { Plugin } = require('@nocobase/server');
const http = require('http');

const FENCE_POLL_INTERVAL_MS = parseInt(process.env.FENCE_POLL_INTERVAL || '30000');

module.exports = class PeopleDynamicPlugin extends Plugin {
  async load() {
    // === 1. 聚合端点: dashboard-snapshot ===
    this.app.use(async (ctx, next) => {
      if (ctx.method !== 'GET' || ctx.path !== '/api/__pd__/dashboard-snapshot') {
        return await next();
      }
      if (!await this.isAuthenticated(ctx)) { ctx.status = 401; ctx.body = 'Unauthorized'; return; }
      ctx.withoutDataWrapping = true;

      const today = new Date().toISOString().substring(0, 10);
      const db = this.db;

      try {
        const [workers, fences, records, latestLocs] = await Promise.all([
          db.getRepository('users').find({
            filter: { roles: { name: { $in: ['workers', 'worker'] } } },
            appends: ['departments', 'roles'],
            sort: 'nickname'
          }),
          db.getRepository('geofences').find({
            filter: { is_active: true },
            sort: 'sort'
          }),
          db.getRepository('attendance_records').find({
            filter: { createdAt: { $dateBetween: [today, today] } },
            sort: '-check_time',
            pageSize: 500,
            appends: ['createdBy']
          }),
          db.getRepository('location_history').find({
            filter: {
              recorded_at: { $dateBetween: [today, today] },
              is_valid: true
            },
            sort: '-recorded_at',
            pageSize: 500
          })
        ]);

        // 计算在线状态
        const onlineMap = {};
        const latestMap = {};
        const checkedInSet = new Set();

        for (const r of records) {
          const uid = r.createdBy?.id || r.createdById;
          if (!uid) continue;
          if (!onlineMap[uid]) onlineMap[uid] = { checkIn: null, checkOut: null };
          if (['上班','签到'].includes(r.check_type)) {
            if (!onlineMap[uid].checkIn || r.check_time > onlineMap[uid].checkIn) {
              onlineMap[uid].checkIn = r.check_time;
              checkedInSet.add(uid);
            }
          }
          if (['下班','签退'].includes(r.check_type)) {
            if (!onlineMap[uid].checkOut || r.check_time > onlineMap[uid].checkOut) {
              onlineMap[uid].checkOut = r.check_time;
            }
          }
        }

        const onlineStatus = {};
        for (const uid in onlineMap) {
          const u = onlineMap[uid];
          onlineStatus[uid] = !!(u.checkIn && (!u.checkOut || u.checkOut < u.checkIn));
        }

        // 最新位置去重 (取每用户最新一条)
        for (const r of latestLocs) {
          const uid = r.createdById;
          if (!uid || latestMap[uid]) continue;
          latestMap[uid] = {
            lat: r.latitude, lng: r.longitude,
            accuracy: r.accuracy, source: r.source, trigger: r.trigger,
            township: r.township, street: r.street, district: r.district,
            recorded_at: r.recorded_at || r.createdAt
          };
        }

        // 部门统计
        const deptStats = {};
        for (const u of workers) {
          const deptName = u.departments?.[0]?.title || '未分配';
          if (!deptStats[deptName]) deptStats[deptName] = { total: 0, online: 0, checkedIn: 0 };
          deptStats[deptName].total++;
          if (onlineStatus[u.id]) deptStats[deptName].online++;
          if (checkedInSet.has(u.id)) deptStats[deptName].checkedIn++;
        }

        ctx.body = {
          workers, fences, records,
          latestLocations: latestMap,
          online: onlineStatus,
          stats: {
            totalCheckedIn: checkedInSet.size,
            onlineCount: Object.values(onlineStatus).filter(Boolean).length,
            deptStats
          },
          serverTime: new Date().toISOString(),
          pollInterval: {
            snapshot: 10000,
            fence: FENCE_POLL_INTERVAL_MS
          }
        };
      } catch(e) {
        ctx.status = 500;
        ctx.body = { error: e.message };
      }
    });

    // === 2. 围栏端点 ===
    this.app.use(async (ctx, next) => {
      if (ctx.method !== 'GET' || ctx.path !== '/api/__pd__/fences') {
        return await next();
      }
      if (!await this.isAuthenticated(ctx)) { ctx.status = 401; return; }
      ctx.withoutDataWrapping = true;
      const fences = await this.db.getRepository('geofences').find({
        filter: { is_active: true },
        sort: 'sort'
      });
      ctx.body = { fences, serverTime: new Date().toISOString() };
    });

    // === 3. 工作者端点 (绕过 ACL) ===
    this.app.use(async (ctx, next) => {
      if (ctx.method !== 'GET' || ctx.path !== '/api/__pd__/workers') {
        return await next();
      }
      if (!await this.isAuthenticated(ctx)) { ctx.status = 401; return; }
      ctx.withoutDataWrapping = true;
      const workers = await this.db.getRepository('users').find({
        filter: { roles: { name: { $in: ['workers', 'worker'] } } },
        appends: ['departments', 'roles'],
        sort: 'nickname'
      });
      ctx.body = { data: workers };
    });
  }

  async isAuthenticated(ctx) {
    if (ctx.state.currentUser) return true;
    const authHeader = ctx.get('Authorization') || '';
    let token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!token) {
      token = ctx.cookies.get('nb_token') || ctx.cookies.get('NOCOBASE_token');
    }
    if (!token) return false;
    try {
      const result = await new Promise((resolve, reject) => {
        const req = http.get({
          hostname: '127.0.0.1', port: 13000,
          path: '/api/auth:check',
          headers: { 'Authorization': 'Bearer ' + token },
          timeout: 3000,
        }, (res) => {
          let body = '';
          res.on('data', (c) => body += c);
          res.on('end', () => resolve(res.statusCode));
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
      });
      return result === 200;
    } catch(e) {
      return false;
    }
  }
};
```

### 6.3 插件注册

```bash
# 将插件包链接到 NocoBase node_modules 目录
cp -r nocobase-plugin-people-dynamic /app/nocobase/packages/

# 注册到 pm
docker exec noco-base-app-1 npx nocobase pm add @nocobase/plugin-people-dynamic
docker exec noco-base-app-1 npx nocobase pm enable @nocobase/plugin-people-dynamic

# 验证
docker exec noco-base-app-1 npx nocobase pm list | grep people-dynamic
```

### 6.4 nginx 配置

```nginx
location /peopledynamic {
    auth_request /api/plugin-dashboard-home/auth-check;
    auth_request_set $auth_status $upstream_status;
    error_page 401 = @login;
    proxy_pass http://app:13000/api/__pd__/dashboard-snapshot;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}

# Worker API 和 Fence API 由插件内部路由，nginx 仅需代理 app 通用配置
# /api/__pd__/ 路径已在插件内注册
```

---

## 七、阶段四：质量增强 (D8)

### 7.1 精度颜色映射 (代码已集成至 LocationService)

### 7.2 隐私合规 (代码已集成至 LocationService)

### 7.3 水印接口预留

```javascript
// location_history.metadata JSONB 字段接受任意键值
// 后续拍照水印功能只需在 queueLocation 时传入:
LocationService.queueLocation({
  latitude: 27.706,
  longitude: 106.937,
  accuracy: 10,
  source: 'gps',
  trigger: 'manual',
  township: '某某镇',
  district: '某某区',
  recorded_at: new Date().toISOString(),
  is_valid: true,
  consent_at: localStorage.getItem('location_consent_granted'),
  metadata: {
    photo_hash: 'ph_abc123',         // 水印照片 hash
    device_fingerprint: 'dev_xxx',   // 设备指纹
    fence_id: 'fence_123',           // 关联围栏
    wifi_bssid: 'xx:xx:xx:xx:xx',   // WiFi 辅助定位
    battery_level: 85                // 采集时电量
  }
});

// 无需迁移数据库，JSONB 字段天然支持
```

### 7.4 逆地理批量回填定时任务

**文件**: `scripts/batch-reverse-geocode.js`

```javascript
// 每日 03:00 执行: node scripts/batch-reverse-geocode.js
// 处理前日 township 为空的记录

const AMAP_KEY = '31e73c1d12b2848e7bd964774782a954';
const BATCH_SIZE = 20;
const BASE_URL = 'https://restapi.amap.com/v3/geocode/regeo';

async function process() {
  const records = await db.query(`
    SELECT id, latitude, longitude FROM location_history
    WHERE is_valid = true
      AND (township IS NULL OR township = '')
      AND latitude IS NOT NULL
      AND longitude IS NOT NULL
      AND recorded_at >= NOW() - INTERVAL '7 days'
    LIMIT 500
  `);

  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(record => {
      const location = record.longitude + ',' + record.latitude;
      return fetch(`${BASE_URL}?key=${AMAP_KEY}&location=${encodeURIComponent(location)}&radius=1000`)
        .then(r => r.json())
        .then(d => {
          const addr = d.regeocode?.addressComponent;
          if (!addr) return;
          return db.query(`
            UPDATE location_history
            SET township = $1, street = $2, district = $3
            WHERE id = $4
          `, [addr.township || '', addr.street || '', addr.district || '', record.id]);
        })
        .catch(() => {});
    }));
    await new Promise(r => setTimeout(r, 1000)); // 防限流
  }
}

process().catch(console.error);
```

### 7.5 高德逆地理编码额度评估

**免费配额**: 5 000 次/日 (高德 Web API 个人开发者)

**消耗路径**:

| 路径 | 触发 | 限制 |
|------|------|------|
| **实时逆地理** (LocationService) | `watchPosition` → cache miss | key = `toFixed(4)` 双级缓存 TTL 1h |
| **夜间批量** (batch-reverse-geocode) | 每日 03:00 | `LIMIT 500` (全用户共享，可调) |

**各场景日消耗估算**:

| 人员类型 | 日人均调用 | 依据 |
|----------|-----------|------|
| **内勤** (坐班，固定工位) | ~8–16 | 1–2 个网格/h × 8h，重复位置命中缓存 |
| **半移动** (办公室+会议室+食堂) | ~30–40 | 3–6 个网格/h × 8h |
| **外勤** (持续移动) | ~80–150 | 每 5–10min 进入新网格，8h |

**可支持人数** (公式: `(5000 − 500 批次) / 人均调用`):

| 场景 | 人均/日 | 可支持 | 说明 |
|------|---------|--------|------|
| **最多 (全员内勤)** | ~10 | **~450** (≈架构上限 200) | 实际受系统并发上限限制 |
| **典型 (混合配比)** | ~35 | **~128** | 最现实估值 |
| **最少 (全员外勤)** | ~120 | **~37** | 极端情况，可增大 `LIMIT` 并申请个人认证 |

**结论**: 50–200 并发下，典型混合场景免费额度够用。若外勤比例 > 60%，建议高德控制台升级**个人认证** (10 万/日，免费)。

---

## 八、阶段五：联调与压测 (D9)

### 8.1 压测场景

| 场景 | 方法 | 目标 |
|------|------|------|
| 聚合 API 响应 | `ab -n 100 -c 20 /api/__pd__/dashboard-snapshot` | 平均 < 200ms, P99 < 500ms |
| 大屏 200 人渲染 | Chrome Performance 面板 30s 录制 | > 55fps, 内存 < 100MB |
| 位置上报并发 | 模拟 10 个用户同时上报 | 无 5xx, 写入成功 > 99% |
| 离线队列恢复 | 断网 5min → 恢复 | 30s 内队列清空 |

### 8.2 错误场景验证

| 场景 | 预期行为 |
|------|----------|
| 聚合 API 超时/500 | 前端保留上次数据，显示 "数据更新失败" 提示，10s 后重试 |
| 位置上报 429 | 进入离线队列，指数退避重试 |
| `location_history` 写入冲突 | 唯一约束冲突忽略，不报错 |
| 用户拒绝定位权限 | 显示 "定位不可用" 提示，打卡页走 IP/手动输入兜底 |
| 用户拒绝隐私同意 | 不启动 `watchPosition`，不采集位置 |

---

## 九、阶段六：缓冲期 (D10)

- 补丁与 bugfix
- 文档完善 (`README.md`、`CONFIG.md`)
- 回滚脚本验证
- 本机最终回归测试

---

## 十、微信小程序接入准备 (v2.1 规划)

### 10.1 总体策略

**混合架构**: web-view 嵌入 H5 页面 + 原生页面桥接。

| 页面 | 实现方式 | 理由 |
|------|----------|------|
| 考勤打卡 (人脸+位置) | **web-view** 嵌入 `attendance.html` | 人脸拍照/围栏逻辑完整，避免双份开发 |
| 人员动态看板 | **web-view** 嵌入 `dashboard/人员动态.html` | Canvas 渲染复杂，H5 已调优 |
| 位置上报引擎 | **原生** `wx.startLocationUpdateBackground` | 小程序后台定位 API 不可被 web-view 调用 |
| 轨迹回放 | **原生** `<map>` 组件 | 小程序原生 map 性能优、可叠加 polyline |
| 设置/个人中心 | **原生** | 轻量页面，原生体验好 |

**通信机制**: web-view 通过 `wx.miniProgram.postMessage` / `wx.miniProgram.navigateTo` 与原生层双向通信。

### 10.2 工程目录结构

```
miniprogram/
├── app.json                          # 全局配置
├── app.js                            # 全局生命周期 + 定位初始化
├── app.wxss                          # 全局样式
├── project.config.json               # 项目配置
├── sitemap.json
│
├── pages/
│   ├── index/                        # 首页 (考勤打卡 web-view)
│   │   ├── index.wxml
│   │   ├── index.js
│   │   ├── index.wxss
│   │   └── index.json
│   ├── dashboard/                    # 人员动态看板 web-view
│   │   ├── dashboard.wxml
│   │   ├── dashboard.js
│   │   └── ...
│   ├── trajectory/                   # 轨迹回放 (原生 map)
│   │   ├── trajectory.wxml
│   │   ├── trajectory.js
│   │   └── ...
│   └── profile/                      # 个人设置
│       ├── profile.wxml
│       ├── profile.js
│       └── ...
│
├── components/
│   ├── location-bridge/              # 定位桥接组件 (web-view 内嵌)
│   │   └── location-bridge.js
│   └── auth-check/                   # 鉴权状态检测
│       └── auth-check.js
│
├── utils/
│   ├── api.js                        # NocoBase REST 客户端
│   ├── auth.js                       # 微信登录 ↔ token 交换
│   ├── location.js                   # 定位封装 (适配 LocationService)
│   ├── queue.js                      # 离线队列 (setStorageSync)
│   └── constants.js                  # 常量 (API_HOST, AMAP_KEY, etc)
│
└── lib/
    └── wgs84-to-gcj02.js             # 坐标系转换 (与 H5 共用逻辑)
```

### 10.3 鉴权流程 (微信登录 ↔ NocoBase Token)

```
用户打开小程序
    │
    ▼
wx.login() → 获取 code
    │
    ▼
POST /api/__pd__/mp-login { code }    ← 插件新增端点
    │
    ├── 服务端: code → 微信 openid (GET https://api.weixin.qq.com/sns/jscode2session)
    ├── 服务端: openid → 查询/创建 NocoBase 用户 (user_openid 映射表)
    ├── 服务端: 生成 JWT (与 NocoBase 同一 secret)
    └── 返回: { token, user }
    │
    ▼
wx.setStorageSync('auth_token', token)
    │
    ▼
web-view 加载 → postMessage 传递 token → H5 localStorage
```

**`user_openid` 映射表**:

```sql
CREATE TABLE IF NOT EXISTS user_openid (
  id            BIGSERIAL PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users(id),
  openid        VARCHAR(64) NOT NULL UNIQUE,
  unionid       VARCHAR(64),
  created_at    TIMESTAMP DEFAULT NOW(),
  last_login_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_user_openid_openid ON user_openid(openid);
```

此表纳入 `@nocobase/plugin-people-dynamic` 插件模型。

### 10.4 页面导航流

```
                 ┌─────────────────────┐
                 │  首页 (index/)      │
                 │  web-view: 考勤打卡  │
                 └────────┬────────────┘
                          │
           ┌──────────────┼──────────────┐
           ▼              ▼              ▼
   ┌──────────────┐ ┌────────────┐ ┌──────────┐
   │ 人员动态看板  │ │ 轨迹回放    │ │ 个人中心  │
   │ web-view     │ │ 原生 map    │ │ 原生      │
   └──────────────┘ └────────────┘ └──────────┘
           │              │
           └──────┬───────┘
                  ▼
          ┌─────────────────┐
          │ 人员详情弹出层    │
          │ (web-view 内部)  │
          └─────────────────┘
```

**底部 Tab 设计**:

| Tab | 页面 | 图标 |
|-----|------|------|
| 考勤 | pages/index/index | clock |
| 看板 | pages/dashboard/dashboard | map |
| 轨迹 | pages/trajectory/trajectory | route |
| 我的 | pages/profile/profile | user |

### 10.5 核心页面详设

#### 10.5.1 首页 — 考勤打卡 (web-view)

- **URL**: `https://{host}/attendance.html?token={token}&platform=mp`
- H5 端通过 `platform=mp` 参数判断环境：
  - 不启动 `watchPosition` (由原生层接管)
  - 通过 `postMessage` 接收原生定位数据
  - 人脸拍照降级为 `wx.chooseMedia` (通过 jsBridge)
- **围栏校验**: 仍由 H5 端 `checkPolylineGeofence` 执行 (数据来自 web-view 内)
- **token 同步**: web-view onLoad → `wx.miniProgram.postMessage` 或 URL 参数传入

#### 10.5.2 人员动态看板 (web-view)

- **URL**: `https://{host}/dashboard/人员动态.html?token={token}&platform=mp`
- 与 PC 看板共用同一页面，区别：
  - 移动端上限 20 个标记 (`MOBILE_MAX_MARKERS = 20`，已在配置)
  - 点击标记 → 弹窗 → 支持跳转至轨迹回放页 (`wx.miniProgram.navigateTo`)
- 数据来源不变: `GET /api/__pd__/dashboard-snapshot`

#### 10.5.3 轨迹回放 (原生 map)

```javascript
// pages/trajectory/trajectory.js
Page({
  data: {
    polyline: [],       // { points, color, width }
    markers: [],        // 起止点 + 途经点
    dateRange: [],      // 日期选择器
    centerLat: 0,
    centerLng: 0
  },
  onLoad() {
    // 从 web-view 跳转时带 userId + date 参数
    const { userId, date } = this.options;
    this.loadTrajectory(userId, date);
  },
  async loadTrajectory(userId, date) {
    const res = await api.get('/api/__pd__/trajectory', {
      userId, date, pageSize: 500
    });
    const points = res.data.map(p => ({
      latitude: p.latitude,
      longitude: p.longitude
    }));
    this.setData({
      polyline: [{
        points,
        color: '#1890FF',
        width: 4,
        dottedLine: false
      }],
      centerLat: points[0].latitude,
      centerLng: points[0].longitude
    });
  }
});
```

**API 端点**: `GET /api/__pd__/trajectory` (新增，返回一天内按时间排序的位置记录)

#### 10.5.4 个人设置 (原生)

| 功能 | 说明 |
|------|------|
| 当前打卡状态 | 显示今日上班/下班时间 |
| 定位开关 | 允许/禁止后台定位 (调用 `wx.stopLocationUpdate`) |
| 缓存清理 | 清空离线队列 |
| 关于 | 版本号、反馈入口 |

### 10.6 API 通信契约 (小程序 → NocoBase)

| 端点 | 方法 | 用途 | 小程序专用 |
|------|------|------|-----------|
| `/api/__pd__/mp-login` | POST | code → token 交换 | ✅ 新增 |
| `/api/__pd__/dashboard-snapshot` | GET | 人员动态聚合 | ❌ 已存在 |
| `/api/__pd__/trajectory` | GET | 单用户轨迹 | ✅ 新增 |
| `/api/__pd__/fences` | GET | 围栏列表 | ❌ 已存在 |
| `/api/location_history:create` | POST | 位置上报 | ❌ 已存在 |
| `/api/attendance_records:create` | POST | 打卡提交 | ❌ 已存在 |

**新增端点 — `GET /api/__pd__/trajectory`**:

```
请求: GET /api/__pd__/trajectory?userId=123&date=2026-06-06&pageSize=500
响应: {
  data: [
    { latitude, longitude, accuracy, recorded_at, source, township, street },
    ...
  ],
  total: 320
}
```

**新增端点 — `POST /api/__pd__/mp-login`**:

```
请求: POST /api/__pd__/mp-login { code: "wx_code" }
响应: { token: "jwt...", user: { id, nickname, avatar } }
```

两个端点均纳入 `@nocobase/plugin-people-dynamic` 插件。

### 10.7 定位策略

#### 10.7.1 前台定位 (进入小程序时)

```javascript
// utils/location.js
async function getCurrentLocation() {
  const res = await wx.getLocation({
    type: 'gcj02',          // 微信直接返回 GCJ-02，无需转换！
    altitude: false
  });
  return {
    coords: {
      latitude: res.latitude,
      longitude: res.longitude,
      accuracy: res.accuracy
    },
    timestamp: Date.now()
  };
}
```

**关键差异**: 微信原生定位直接返回 GCJ-02 坐标，`LocationService` 中的 `wgs84ToGcj02()` 转换可绕过。

#### 10.7.2 后台定位 (小程序切后台/锁屏)

```javascript
// app.js — 小程序全局生命周期
App({
  onLaunch() {
    this.initBackgroundLocation();
  },
  initBackgroundLocation() {
    const setting = wx.getStorageSync('bg_location_enabled');
    if (setting === false) return;

    wx.startLocationUpdateBackground({
      success: () => {
        wx.onLocationChange((res) => {
          this._handleLocationChange(res, 'background');
        });
      },
      fail: (err) => {
        if (err.errCode === 2) {
          // 用户拒绝授权 → 引导开启
          wx.showModal({
            title: '需要位置权限',
            content: '关闭后将无法上报位置轨迹',
            confirmText: '去设置',
            success: (res) => {
              if (res.confirm) wx.openSetting();
            }
          });
        }
      }
    });
  },
  _handleLocationChange(res, source) {
    const data = {
      latitude: res.latitude,
      longitude: res.longitude,
      accuracy: res.accuracy,
      source,
      trigger: 'background',
      recorded_at: new Date().toISOString()
    };
    // 写入离线队列 (防止频繁网络写入)
    queue.push(data);
  }
});
```

**上报间隔策略**: 与 H5 一致 — 通过 `FENCE_POLL_INTERVAL` 常量控制，但小程序中改为**定时器 + 位移阈值**双重触发:

```
if (位移 > 50m || 距上次上报 > 60s) → 上报
```

#### 10.7.3 场景化调度

| 场景 | 定位模式 | 上报频率 |
|------|----------|----------|
| 小程序前台 (打卡页) | `wx.getLocation` 单次 | 仅打卡时 |
| 小程序前台 (看板页) | `wx.getLocation` 单次 | 进入时 + 手动刷新 |
| 小程序前台 (轨迹页) | 不定位，只读取历史数据 | — |
| 小程序后台 (定位授权) | `wx.startLocationUpdateBackground` | 位移 > 50m 或 60s 间隔 |
| 小程序关闭 | 停止 | — |

### 10.8 离线队列 (基于 wx.setStorageSync)

```javascript
// utils/queue.js
const QUEUE_KEY = 'location_queue';
const MAX_QUEUE = 500;

const queue = {
  push(data) {
    const list = this.getAll();
    list.push({ ...data, _qid: Date.now() + '_' + Math.random() });
    if (list.length > MAX_QUEUE) list.splice(0, list.length - MAX_QUEUE);
    wx.setStorageSync(QUEUE_KEY, list);
  },
  getAll() {
    return wx.getStorageSync(QUEUE_KEY) || [];
  },
  flush() {
    const list = this.getAll();
    if (list.length === 0) return;

    // 批量上报 (单次最多 20 条)
    const batch = list.splice(0, 20);
    const token = wx.getStorageSync('auth_token');

    wx.request({
      url: `${API_HOST}/api/location_history:create`,
      method: 'POST',
      header: { Authorization: `Bearer ${token}` },
      data: {
        // NocoBase 支持批量创建
        records: batch.map(item => ({
          latitude: item.latitude,
          longitude: item.longitude,
          accuracy: item.accuracy,
          source: item.source,
          trigger: item.trigger,
          recorded_at: item.recorded_at
        }))
      },
      success: () => {
        wx.setStorageSync(QUEUE_KEY, list);
        // 递归 flush 直到队列清空
        if (list.length > 0) this.flush();
      },
      fail: () => {
        // 网络失败，保留队列下次重试
        console.warn('队列刷新失败，保留', batch.length, '条');
      }
    });
  }
};
```

**触发时机**:

| 事件 | 动作 |
|------|------|
| `wx.onLocationChange` | `queue.push()` — 始终写入队列 |
| 小程序切前台 (`onShow`) | `queue.flush()` |
| 用户主动打卡 | 先 `queue.flush()` 再提交考勤 |
| 网络恢复 (`wx.onNetworkStatusChange`) | `queue.flush()` |

### 10.9 web-view ↔ 原生通信方案

```javascript
// web-view 页面 → 通知原生层
// 例: H5 考勤页请求当前定位
wx.miniProgram.postMessage({
  data: { type: 'requestLocation' }
});

// 原生层 → 响应 web-view
// pages/index/index.js
Page({
  onMessage(e) {
    const { type } = e.detail.data;
    if (type === 'requestLocation') {
      wx.getLocation({
        type: 'gcj02',
        success: (res) => {
          // 通过 web-view 的 data 属性传递
          this.setData({
            locationData: JSON.stringify(res)
          });
          // 或通过 postMessage 回传
        }
      });
    }
  }
});
```

**通信消息协议**:

| 方向 | type | payload | 说明 |
|------|------|---------|------|
| native → web-view | `LOCATION_UPDATE` | `{ lat, lng, accuracy }` | 原生定位推给 H5 |
| native → web-view | `TOKEN_SYNC` | `{ token }` | 登录后同步 token |
| web-view → native | `REQUEST_LOCATION` | `{}` | H5 请求一次定位 |
| web-view → native | `NAVIGATE_TO` | `{ page, params }` | H5 跳转原生页面 (如轨迹) |

### 10.10 H5 → 小程序迁移清单

| 模块 | H5 方案 | 小程序方案 | 迁移量 |
|------|---------|-----------|--------|
| 定位采集 | `navigator.geolocation` + `watchPosition` | `wx.getLocation` + `wx.startLocationUpdateBackground` | 新增适配分支 |
| 坐标系转换 | `wgs84ToGcj02()` | 微信直接返回 GCJ-02 → 跳过转换 | 条件跳过 |
| 离线队列 | IndexedDB + Service Worker sync | `wx.setStorageSync` (同步 API) | 重写 queue.js |
| 人脸拍照 | `navigator.mediaDevices.getUserMedia` | `wx.createCameraContext` / `wx.chooseMedia` | 需双实现 |
| 运动检测 | `DeviceMotionEvent` | `wx.onAccelerometerChange` | API 替换 |
| 逆地理编码 | AMap Web API (浏览器 fetch) | AMap Web API (小程序 request) | 同一 API，请求库替换 |
| Canvas 渲染 | L.Canvas (Leaflet) | 看板用 web-view 复用 | 无需迁移 |
| 围栏校验 | `checkPolylineGeofence` (H5) | web-view 内复用 | 无需迁移 |
| 打卡页 | `attend.js` + 人脸 | web-view 嵌入 | 无需迁移 |
| 聚合 API | `GET /api/__pd__/dashboard-snapshot` | 相同端点 | 服务端不变 |

### 10.11 风险与限制

| 风险 | 概率 | 缓解措施 |
|------|------|----------|
| 微信审核被拒 (定位用途说明不充分) | **中** | 在 `app.json` `requiredBackgroundModes` 中注明 "出行" 用途 |
| iOS 后台定位电量消耗大 | **高** | 位移阈值 50m + 60s 间隔双重控制 |
| web-view 与原生定位冲突 | **中** | 明确约定: 原生层始终持有定位权，web-view 被动接收 |
| 微信小程序包体积超限 (2MB) | **低** | web-view 模式无需打包 H5 代码，仅原生逻辑 ≈ 200KB |
| Apple 因后台定位被拒 | **低** | 提供明确开关，默认关闭，用户手动开启 |

### 10.12 发布与灰度

| 阶段 | 时间 | 用户范围 | 验证点 |
|------|------|----------|--------|
| 体验版 | 3 天 | 内部 5 人 | 定位上报、打卡流程 |
| 灰度 10% | 3 天 | 随机 10% | 后台定位稳定性、离线队列 |
| 灰度 50% | 3 天 | 随机 50% | 全流程、电池消耗 |
| 全量 | — | 100% | 监控 1 周无异常 |

### 10.13 开发排期 (预估)

| 任务 | 工时 |
|------|------|
| 工程框架 + 鉴权 + 定位桥接 | 3d |
| web-view 嵌入 + 通信协议 | 2d |
| 原生轨迹回放页 | 2d |
| 个人中心 + 设置 | 1d |
| 服务端: `mp-login` + `trajectory` 端点 | 1d |
| 联调 + 灰度提审 | 2d |
| **合计** | **~11 人日** |

---

## 十一、文件变更清单

### 11.1 新建文件

| 文件 | 阶段 | 说明 |
|------|------|------|
| `assets/location-service.js` | D1-D3 | 统一位置服务核心模块 |
| `dashboard/sw.js` | D1-D3 | Service Worker (background-sync) |
| `scripts/batch-reverse-geocode.js` | D4-D5 | 定时任务: 逆地理批量回填 |
| `migrations/migration_location_history_extend.sql` | D1-D3 | 表结构扩展迁移 |
| `nocobase-plugin-people-dynamic/package.json` | D6-D7 | 独立插件包根 |
| `nocobase-plugin-people-dynamic/@nocobase/plugin-people-dynamic/package.json` | D6-D7 | 插件包内部 |
| `nocobase-plugin-people-dynamic/@nocobase/plugin-people-dynamic/dist/server/index.js` | D6-D7 | 插件服务端入口 |
| `nocobase-plugin-people-dynamic/README.md` | D8 | 插件说明文档 |

### 11.2 修改文件

| 文件 | 变更类型 | 阶段 |
|------|----------|------|
| `dashboard/人员动态.html` | **重构**: 接入 LocationService、Canvas 渲染、聚合 API、镇街名、轨迹平滑 | D4-D5 |
| `assets/attend.js` | **精简**: 打卡定位委托 LocationService，删除重复代码 | D4-D5 |
| `assets/core.js` | **微调**: 天气复用 LocationService.reverseGeocode() | D4-D5 |
| `dashboard/index.html` | **微调**: EXTERN_URLS 加入 /peopledynamic | D4-D5 |
| `nginx.conf` | **新增**: /peopledynamic location 块 | D6-D7 |
| `capacitor/www/` | **同步**: 保持与 assets/ 一致 | D10 |

### 11.3 删除代码

| 文件 | 删除范围 | 约行数 |
|------|----------|--------|
| `assets/attend.js` | 原 L470-L587 (getLocation, _getLocationOnce, _getLocationByIP, _showGpsHelp, 三端分支) | ~120 |
| `dashboard/人员动态.html` | 原 L646-L724 (startLocationSchedule, collectAndReport, _reportLocation, checkWorkWindow) | ~80 |

---

## 十二、部署与回滚

### 12.1 备份脚本

```bash
#!/bin/bash
# backup.sh
BACKUP_DIR="/opt/noco-base/backups/$(date +%Y%m%d_%H%M%S)_pre-people-dynamic"
mkdir -p "$BACKUP_DIR"

docker exec noco-base-app-1 pg_dump -U nocobase nocobase > "$BACKUP_DIR/db.sql"
cp -r /opt/noco-base/dashboard/ "$BACKUP_DIR/dashboard/"
cp -r /opt/noco-base/plugin-dashboard-home/ "$BACKUP_DIR/plugin-dashboard-home/"
cp /opt/noco-base/nginx.conf "$BACKUP_DIR/nginx.conf"

echo "备份完成: $BACKUP_DIR"
```

### 12.2 部署步骤

```bash
# 0. 备份
bash backup.sh

# 1. DB migration
docker exec -i noco-base-app-1 psql -U nocobase -d nocobase < migrations/migration_location_history_extend.sql

# 2. 上传前端文件
scp -i voadge.pem assets/location-service.js ubuntu@110.42.236.231:/opt/noco-base/dashboard/assets/
scp -i voadge.pem dashboard/sw.js ubuntu@110.42.236.231:/opt/noco-base/dashboard/dashboard/
scp -i voadge.pem dashboard/人员动态.html ubuntu@110.42.236.231:/opt/noco-base/dashboard/dashboard/
scp -i voadge.pem assets/attend.js ubuntu@110.42.236.231:/opt/noco-base/dashboard/assets/
scp -i voadge.pem assets/core.js ubuntu@110.42.236.231:/opt/noco-base/dashboard/assets/

# 3. 上传插件
scp -i voadge.pem -r nocobase-plugin-people-dynamic/ ubuntu@110.42.236.231:/opt/noco-base/
ssh -i voadge.pem ubuntu@110.42.236.231 "cp -r /opt/noco-base/nocobase-plugin-people-dynamic /app/nocobase/packages/"
ssh -i voadge.pem ubuntu@110.42.236.231 "docker exec noco-base-app-1 npx nocobase pm add @nocobase/plugin-people-dynamic"
ssh -i voadge.pem ubuntu@110.42.236.231 "docker exec noco-base-app-1 npx nocobase pm enable @nocobase/plugin-people-dynamic"

# 4. 更新 nginx
scp -i voadge.pem nginx.conf ubuntu@110.42.236.231:/opt/noco-base/
ssh -i voadge.pem ubuntu@110.42.236.231 "docker exec noco-base-nginx-proxy-1 nginx -t && docker exec noco-base-nginx-proxy-1 nginx -s reload"
```

### 12.3 回滚脚本

```bash
#!/bin/bash
# rollback.sh <BACKUP_DIR>
BACKUP_DIR="$1"
if [ -z "$BACKUP_DIR" ]; then echo "用法: bash rollback.sh /opt/.../backup_dir"; exit 1; fi

docker exec -i noco-base-app-1 psql -U nocobase -d nocobase < "$BACKUP_DIR/db.sql"
cp -r "$BACKUP_DIR/dashboard/"* /opt/noco-base/dashboard/
cp -r "$BACKUP_DIR/plugin-dashboard-home/"* /opt/noco-base/plugin-dashboard-home/
docker exec noco-base-app-1 npx nocobase pm remove @nocobase/plugin-people-dynamic
cp "$BACKUP_DIR/nginx.conf" /opt/noco-base/
docker exec noco-base-nginx-proxy-1 nginx -s reload
echo "回滚完成"
```

---

## 十三、验收标准

### 13.1 功能验收

| # | 场景 | 预期 |
|---|------|------|
| F1 | 冷启动定位 | ≤3s 获取高精度位置 + GCJ-02 坐标 + 镇街名 |
| F2 | 室内静止 15min | GPS 停止唤醒，无异常请求 |
| F3 | 运动触发上报 | 位移 > 50m 自动触发上报，trigger='movement' |
| F4 | 车辆缓行不误判 | 5min 内位移 < 50m 不上报 |
| F5 | 精度 > 100m 过滤 | 不入库，emit 'accuracy-filtered' 事件 |
| F6 | 弱网/离线 10min | IndexedDB 队列积压，恢复联网 30s 自动同步 |
| F7 | 轨迹回放 | 平滑无明显锯齿，精度 ≤100m 点 |
| F8 | 镇街名显示 | popup 显示 township/street/district |
| F9 | 坐标系统一 | 前端所有输出为 GCJ-02，与高德地图/围栏一致 |
| F10 | 围栏轮询 | 按常量 FENCE_POLL_INTERVAL 请求 |
| F11 | 隐私同意弹窗 | 首次定位弹窗确认，拒绝后不启动定位 |

### 13.2 性能验收

| # | 指标 | PC 大屏 | 移动端 |
|---|------|---------|--------|
| P1 | 首屏加载 | ≤2s | ≤3s |
| P2 | Marker 渲染 | 200 人 ≥ 55fps | 20 人 ≥ 30fps |
| P3 | 内存占用 | ≤100MB | ≤50MB |
| P4 | 聚合 API 响应 | ≤200ms (P99 ≤500ms) | — |
| P5 | 离线队列恢复 | ≤30s (100 条) | ≤30s (100 条) |

### 13.3 回归验收

| # | 场景 | 预期 |
|---|------|------|
| R1 | 看板天气正常显示 | 天气模块复用 reverseGeocode 无异常 |
| R2 | 打卡提交成功 (定位+人脸+指纹+围栏) | 全部正常 |
| R3 | 大屏切换源 | 所有 EXTERN_URLS 源正常切换 |
| R4 | 历史轨迹正常加载 | 已有数据可加载 |

---

## 十四、风险与对策

| 风险 | 概率 | 影响 | 对策 |
|------|------|------|------|
| iOS 不支持 background-sync | **高** | 离线队列需靠 `visibilitychange` | `visibilitychange` + `online` 事件双重触发，已纳入代码 |
| DeviceMotionEvent 需 HTTPS + 用户交互 | **高** | 运动检测失效 | 降级：仅用 5min 位移判定（已在配置） |
| 逆地理编码高德配额溢出 | **中** | 镇街名回填失败 | 见下方 7.5 节明细分析；客户端缓存 + 服务端限量的组合在混合场景下免费额度足够 (5000次/日 ≈ 128 人) |
| IndexedDB 浏览器配额不足 | **低** | 队列写入失败 | 队列上限 1000 条，超限丢弃最旧 |
| SW 注册失败 (Safari 无痕模式) | **中** | 无 background-sync | fallback 到 `visibilitychange` 触发 `flushQueue` |
| 聚合 API QPS 过高 (200 人 × 10s 轮询) | **低** | 服务端 CPU 飙升 | 单次响应 ~5KB，总吞吐 ~100KB/s，NocoBase 可轻松承载 |
| 移动端 Canvas 渲染卡顿 | **中** | 低端手机 < 10fps | 限制最多 20 个点 + 聚类显示 |

---

## 十五、附录A：审计问题修正对照表

### 🔴 阻塞问题 (6 项)

| # | 审计问题 | 风险 | v2.0 修正 |
|---|----------|------|-----------|
| 1 | 200 人 watchPosition 并发模型未明确 | 电量灾难 | **已消解**——各工人独立手机 GPS，非服务端并发。见第三章三端分离 |
| 2 | SW 作用域 /dashboard/ 与现有文件冲突 | 注册失败 | SW 放 `dashboard/sw.js`，scope `/dashboard/`。见 4.2 |
| 3 | Capacitor 场景 SW background-sync 非最优 | iOS 不支持 | **不涉及**——纯移动网页，无 Capacitor。iOS 限制见风险表 |
| 4 | import() 无构建工具不可行 | 无法运行 | 移除 leaflet-canvas-markers，改用原生 `L.canvas`。见 5.1.3 |
| 5 | NocoBase 聚合插件开发规范缺失 | 不可维护 | **新建独立插件包** `@nocobase/plugin-people-dynamic`，完整 package.json + 路由注册。见第六章 |
| 6 | 聚合查询 SQL 性能未验证 | <50ms 无保障 | 预建 3 个复合索引，压测验证。见 4.3 + 第八章 |

### 🟡 高优先级问题 (8 项)

| # | 审计问题 | v2.0 修正 |
|---|----------|-----------|
| 7 | reverseGeocode 缓存不足，200 并发击穿高德配额 | `sessionStorage` + `localStorage` 双级缓存，key 取 `toFixed(4)`，有效期 1h。见 4.1.6 |
| 8 | 增量 `?since=` 语义未定义 | **取消增量**，10s 全量轮询 (~5KB/次)。见 5.1.2 |
| 9 | 坐标系转换缺失 (WGS-84 vs GCJ-02) | 所有位置入库前必须 `wgs84ToGcj02()` 转换。见 4.1.4 + 附录B |
| 10 | 隐私合规完全缺失 | 首次定位弹窗确认 + `consent_at` 字段 + 30 天自动清理。见 4.1.8 + 附录C |
| 11 | 排期严重偏紧 | 6 天 → **10 天**（含 2 天缓冲）。见排期表 |
| 12 | 移动端 200 人渲染会卡死 | 移动端上限 MOBILE_MAX_MARKERS=20 人，PC 端全量。见 5.1.3 |
| 13 | 三端混为一谈 | 拆分为工人采集端(H5) / 管理大屏(PC) / 管理查看端(移动)。见第三章 |
| 14 | SW token 获取方式不可靠 | 改用 `postMessage` 信道传递 token。见 4.1.12 |

### 补充改进 (6 项)

| # | 改进点 | 来源 | 涉及章节 |
|---|--------|------|----------|
| 15 | IndexedDB `onupgradeneeded` + `autoIncrement` | 参考代码审计 | 4.1.7 |
| 16 | DeviceMotionEvent iOS `requestPermission()` | 参考代码审计 | 4.1.5 |
| 17 | 逆地理缓存 `sessionStorage` 替代 `Map` | 参考代码审计 | 4.1.6 |
| 18 | SW `postMessage` 信道传递 token | 参考代码审计 | 4.1.12 |
| 19 | 精度颜色映射表 (`ACCURACY_COLORS`) | 参考代码审计 | 4.1.9 |
| 20 | `L.divIcon` 显示用户名缩写 initials | 参考代码审计 | —(已在现有设计中，保持) |

---

## 十六、附录B：坐标系转换说明

### 背景

- `navigator.geolocation` 返回 **WGS-84** (GPS 原始坐标系)
- 高德地图瓦片 + 围栏 GeoJSON + 逆地理编码均使用 **GCJ-02** (国测局坐标系)
- 两者偏差：中国境内约 **100-500 米**，不转换将导致：
  - 围栏校验错误（可能将围栏内判定为围栏外）
  - 标记位置偏移（显示到隔壁街道）
  - 轨迹路径偏离

### 处理策略

```
WGS-84 (navigator.geolocation)
    │
    ▼
wgs84ToGcj02()  ← LocationService 内置
    │
    ▼
GCJ-02 (入库 + 地图 + 围栏)
    │
    ▼
数据库存储 GCJ-02 坐标
```

### 函数位置

`LocationService.wgs84ToGcj02(lat, lng)` → `{ lat, lng }`  
代码见 4.1.4。

---

## 十七、附录C：隐私合规说明

### 采集内容

| 数据项 | 用途 | 保留期限 |
|--------|------|----------|
| 经纬度 (GCJ-02) | 考勤核算 + 轨迹展示 | 30 天 |
| 精度 (accuracy) | 数据质量评估 | 30 天 |
| 镇/街/区 | 位置显示 | 30 天 |
| 采集时间 | 轨迹时序 | 30 天 |
| 触发方式 | 行为分析 | 30 天 |

### 用户告知

首次触发定位功能时，弹窗告知：
```
本系统将采集您的位置信息用于考勤核算与轨迹展示。
数据仅保留 30 天，不会共享给第三方。
是否同意？
```

### 用户权利

| 权利 | 实现方式 |
|------|----------|
| 拒绝采集 | 弹窗选择"取消"，不启动 `watchPosition` |
| 撤回同意 | 清空 `localStorage` 中 `location_consent_granted` 项 |
| 删除数据 | 调用 API 或通过 NocoBase 管理端删除 `location_history` 记录 |
| 数据导出 | 通过 NocoBase 管理端导出当前用户 `location_history` |

### 自动清理

```sql
-- 每日 03:00 清理超过 30 天的记录
DELETE FROM location_history WHERE recorded_at < NOW() - INTERVAL '30 days';
```

---

## 十八、附录D：WorkBuddy 审计吸收项对照表

| # | 审计发现 | 决策 | 吸收位置 | 工作量 |
|---|----------|------|----------|--------|
| 1 | **`gps_state` 字段缺失** — 代码发送但 DB 未定义 | ✅ 纳入 | 4.3 DB Migration 新增 `location_history.gps_state` | ~1 行 SQL |
| 2 | **重复打卡无速率限制** — 同一用户可反复提交 | ✅ 按业务语义处理 | 4.4 工作流 JS 节点：上班取最早、下班取最晚，标记 `dedup_status='duplicate'` | 工作流配置 |
| 3 | **权限被拒时无引导** — 用户不知如何开启 | ✅ 纳入 | 4.1.8 `showPermissionGuide()` + 设备类型自适应提示 | ~15 行 JS |
| 4 | **请假字段未发送** (审计声称) | ❌ 代码已有 | `attend.js:906-918` 已发送 `reason/start_date/end_date/workflow_status` | 不处理 |
| 5 | **照片哈希算法** (审计声称仅 DJB2) | ❌ 不准确 | `attend.js:861-874` 优先 SHA-256，DJB2 仅后备 | 不处理 |
| 6 | **iOS Safari facingMode 不可切换** | ❌ 已知限制 | 无法修复，文档化 | 不处理 |
| 7 | **FaceDetector 在 Safari 不支持** | ❌ 已有降级 | 代码已处理灰度降级 | 不处理 |
| 8 | **打卡记录查询页面** | ❌ 超出范围 | 独立的业务需求，非本优化目标 | 不处理 |
| 9 | **统计报表** | ❌ 超出范围 | 同上 | 不处理 |
| 10 | **服务端围栏双校验** | ❌ 本次不做 | 安全加固项，延后评估 | 不处理 |

---

## 版本记录

| 版本 | 日期 | 作者 | 变更说明 |
|------|------|------|----------|
| v1.0 | 2026-06-06 | 系统 | 初版 |
| v2.0 | 2026-06-06 | 系统 | 吸收审计修正：坐标系、隐私合规、独立插件包、Canvas 原生渲染、排期调整、三端分离、微信小程序预留 |
| v2.1 | 2026-06-06 | 系统 | 吸收 WorkBuddy 审计项：`gps_state`/`dedup_status` 字段、权限拒绝引导、重复打卡工作流 JS 节点；附录D 记录完整对应关系 |
| v2.2 | 2026-06-06 | 系统 | 微信小程序章节重写：混合架构(web-view+原生)、鉴权流程、轨迹回放、后台定位策略、离线队列、通信协议、迁移清单、发布灰度排期；高德配额分析(7.5) |

---

**v2.1 审计吸收条目已全部纳入计划。确认后即可进入 D1 编码阶段。**
