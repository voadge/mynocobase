# 人员动态定位系统优化 v2.0 计划 — 严格审计报告

> 审计原则：仅审计，不修改方案  
> 审计时间：2026-06-06  
> 审计对象：`PLAN-人员动态-location-optimization.md` v2.0  
> 前置审计：已审计 v1.0 并出具主审计报告 + 移动网页端补充审计

---

## 一、总体评估

| 维度 | v1.0 评级 | v2.0 评级 | 变化说明 |
|------|----------|----------|----------|
| 架构合理性 | B+ | A- | 三端分离、坐标系转换、隐私合规均为实质性改进 |
| 技术可行性 | B | B+ | 移除了不可行的 `import()` 和 leaflet-canvas-markers |
| 性能承诺 | C+ | B | 移动端 20 人上限、PC 55fps 仍偏激进但已收敛 |
| 可靠性 | B | B+ | IndexedDB 队列、指数退避、死信隔离设计完整 |
| NocoBase 兼容性 | B | C+ | **插件目录结构和认证方式存在严重问题** |
| 代码正确性 | — | C+ | **IndexedDB API 误用、SW token 竞态、L.circleMarker className 无效** |

**综合结论：v2.0 在架构层面有显著改进，但存在 5 项阻塞级代码/集成问题 + 7 项高风险设计缺陷。建议修正后再进入开发。**

---

## 二、阻塞级问题（🔴 不修正则无法运行）

### 🔴 B1: IndexedDB API 全面误用 — 队列功能完全无法工作

**位置**：4.1.7 `queueLocation()` 与 `flushQueue()`

**问题代码**：
```javascript
// 错误 1: store.count() 返回 IDBRequest，不是 Promise
const count = await store.count();

// 错误 2: cursor 异步迭代写法错误
while (cursor && deleted < 100) {
  store.delete(cursor.primaryKey);
  cursor.continue();      // 异步操作，不会立即返回下一个 cursor
  deleted++;
}

// 错误 3: getAll('pending') 返回 IDBRequest，不是 Promise
const all = await store.index('status').getAll('pending');
```

**影响**：
- `queueLocation` 会抛出异常或行为不可预期
- `flushQueue` 无法读取队列数据，离线同步功能完全失效
- 整个"IndexedDB 队列 + 可靠性"设计沦为纸上谈兵

**必须修正为**：
```javascript
// 将 IDBRequest 包装为 Promise
function idbPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// 正确用法
const count = await idbPromise(store.count());
const all = await idbPromise(store.index('status').getAll('pending'));

// 正确删除旧记录（使用游标）
function deleteOldRecords(store, limit) {
  return new Promise((resolve, reject) => {
    const req = store.openCursor();
    let deleted = 0;
    req.onsuccess = (e) => {
      const cursor = e.target.result;
      if (!cursor || deleted >= limit) { resolve(deleted); return; }
      store.delete(cursor.primaryKey);
      deleted++;
      cursor.continue();
    };
    req.onerror = () => reject(req.error);
  });
}
```

---

### 🔴 B2: SW `requestTokenThenSync()` 存在竞态条件 — 后台同步几乎必然失败

**位置**：4.1.12 + 4.2 `sw.js`

**问题代码**：
```javascript
async function requestTokenThenSync() {
  const clients = await self.clients.matchAll({ type: 'window' });
  for (const client of clients) {
    client.postMessage({ type: 'REQUEST_TOKEN' });
  }
  await new Promise(r => setTimeout(r, 2000));  // 等 2 秒
  await syncLocationQueue();                      // authToken 可能还是 null
}
```

**问题分析**：
1. **竞态窗口**：向所有 clients 发送 `REQUEST_TOKEN` 后，用固定 2 秒等待回复。如果页面响应慢（后台 tab 节流）、无 client（页面已关闭）、或消息在 2 秒后到达，`authToken` 仍为 null
2. **无 client 场景**：如果用户关闭所有页面后恢复网络，SW sync 触发时 `clients.matchAll()` 返回空数组，token 永远无法获取
3. **SW 中直接打开 IndexedDB 操作队列** —— `syncLocationQueue()` 函数在 SW 中执行，但 IndexedDB schema 定义在 LocationService 中，SW 需要独立维护数据库连接

**必须修正为**：
- 页面获取 token 后，通过 `postMessage` 发送给 SW，SW 将 token **存入 IndexedDB**（而非内存变量）
- SW 的 `sync` 事件处理时，从 IndexedDB 读取 token，而非依赖内存中的 `authToken`
- 如果 token 过期/无效，SW 应标记队列记录为 retry，而非静默丢弃

---

### 🔴 B3: NocoBase 插件目录结构与路由注册方式错误 — 插件无法加载

**位置**：6.1 + 6.2

**问题 1：目录结构不符合 NocoBase 规范**
```
nocobase-plugin-people-dynamic/
├── package.json                           ← 根级 package.json 多余
├── @nocobase/
│   └── plugin-people-dynamic/
│       ├── package.json                   ← 内嵌 package.json 也不对
│       └── dist/server/index.js
```

NocoBase 插件标准结构（以 v0.x / v1.x 为例）：
```
packages/
└── plugin-people-dynamic/
    ├── package.json
    ├── server.ts / server.js              ← 服务端入口
    ├── client.ts / client.js              ← 客户端入口（可选）
    └── ...
```

或如果是独立 npm 包：
```
@nocobase/plugin-people-dynamic/
├── package.json
├── dist/
│   ├── server.js
│   └── client.js
```

**问题 2：路由注册方式错误**
```javascript
this.app.use(async (ctx, next) => {
  if (ctx.path !== '/api/__pd__/dashboard-snapshot') return await next();
  // ...
});
```

这不是 NocoBase 标准的插件路由注册方式。正确方式应为：
```javascript
this.router.register('/api/__pd__/dashboard-snapshot', {
  name: 'dashboard-snapshot',
  actions: { list: { handler: async (ctx) => { ... } } }
});
```

或使用 `this.app.resource()`、`this.app.acl.allow()` 来注册。

**问题 3：认证方式错误**
```javascript
async isAuthenticated(ctx) {
  const req = http.get({ hostname: '127.0.0.1', port: 13000, path: '/api/auth:check', ... });
}
```

- 硬编码 `127.0.0.1:13000` 在 Docker 容器内可能无法访问自身
- NocoBase 已经处理了认证中间件，插件路由只需复用 `ctx.state.currentUser`
- `ctx.withoutDataWrapping` 不是标准属性

**必须修正为**：
- 参考 NocoBase 官方插件模板重新设计目录结构
- 使用 `this.router.register()` 或 `this.app.resource()` 注册 API
- 认证通过 `ctx.state.currentUser` 获取已登录用户，无需自建 `isAuthenticated`

---

### 🔴 B4: 聚合 API 中 `location_history` 查询使用 JS 去重且 `pageSize: 500` 可能漏数据

**位置**：6.2 `dashboard-snapshot` 端点

**问题代码**：
```javascript
const latestLocs = await db.getRepository('location_history').find({
  filter: { recorded_at: { $dateBetween: [today, today] }, is_valid: true },
  sort: '-recorded_at',
  pageSize: 500
});
// ...
for (const r of latestLocs) {
  const uid = r.createdById;
  if (!uid || latestMap[uid]) continue;  // 取每用户第一条（最新）
  latestMap[uid] = { ... };
}
```

**问题分析**：
- 如果 200 个工人每人一天产生 3 条记录，总量 600 条，已超过 `pageSize: 500`
- `pageSize: 500` 限制下，后 100 条记录被截断，可能导致部分工人的最新位置丢失
- 即使增加 pageSize，JS 去重在大数据量下效率低

**必须修正为**：
```sql
-- 使用 DISTINCT ON 在数据库层去重，只取每用户最新一条
SELECT DISTINCT ON (created_by_id) *
FROM location_history
WHERE is_valid = true AND recorded_at >= TODAY
ORDER BY created_by_id, recorded_at DESC;
```

或通过 NocoBase Repository 使用子查询/LATERAL JOIN。

---

### 🔴 B5: 逆地理服务端代理端点 `/api/__dh__/regeo` 在方案中完全缺失

**位置**：4.1.6 `reverseGeocode()`

**问题**：
```javascript
const r = await fetch(`/api/__dh__/regeo?location=${lng},${lat}`);
```

- `/api/__dh__/regeo` 端点在整个方案中**从未定义**
- 方案说"服务端代理，保护 key"，但服务端插件只实现了 `/api/__pd__/*` 端点
- 如果不实现此端点，前端逆地理功能完全不可用

**必须补充**：
- 在 NocoBase 插件中增加 `/api/__pd__/regeo` 端点（或独立端点）
- 服务端调用高德逆地理 API，转发结果给前端，不暴露 `AMAP_KEY`

---

## 三、高风险问题（🟡 会导致体验差或隐性 bug）

### 🟡 H1: `DeviceMotionEvent.requestPermission()` 自动调用会在 iOS 上静默失败

**位置**：4.1.5 `_startMotionDetection()`

**问题**：
```javascript
const permFn = typeof DeviceMotionEvent.requestPermission === 'function'
  ? DeviceMotionEvent.requestPermission()   // 立即调用！
  : Promise.resolve('granted');
```

- iOS 13+ 要求 `DeviceMotionEvent.requestPermission()` **必须在用户手势（click/tap）的 handler 中同步调用**
- 如果在页面加载时自动调用，Promise 会被 reject，且不会弹权限对话框
- 当前代码在 `LocationService` 初始化时自动执行，iOS 上运动检测将永久不可用

**建议**：将 `requestPermission()` 与页面上的"开始定位"按钮绑定，仅在用户点击时请求。

---

### 🟡 H2: `confirm()` 隐私弹窗体验差且可能被浏览器阻止

**位置**：4.1.8 `_checkConsent()`

**问题**：
```javascript
const ok = confirm(
  '本系统将采集您的位置信息用于考勤核算与轨迹展示。\n' +
  '数据仅保留 30 天，不会共享给第三方。\n\n' +
  '是否同意？'
);
```

- `confirm()` 是浏览器原生阻塞弹窗，样式不可控，在移动端 WebView 中可能被禁用或样式极丑
- 无法展示详细的隐私政策链接
- 用户误点"取消"后没有再次引导的机制

**建议**：使用自定义 DOM 弹窗（如 `<dialog>` 元素或 div 遮罩），支持"查看详细政策"链接和"稍后再说/同意"双按钮。

---

### 🟡 H3: `L.circleMarker` 的 `className` 选项无效

**位置**：5.1.3 `renderMarkers()`

**问题代码**：
```javascript
const marker = L.circleMarker([lat, lng], {
  className: isOnline ? 'marker-pulse' : ''   // ❌ circleMarker 不支持 className
});
```

- `L.circleMarker` 是 Canvas/SVG 路径元素，不支持 CSS className
- 要实现脉冲动画效果，需使用 `L.divIcon` + CSS animation，或 Leaflet 插件

**建议**：要么移除 `className` 选项（无脉冲效果），要么改用 `L.divIcon` 实现脉冲。

---

### 🟡 H4: `LocationService._checkConsent()` 被外部直接调用

**位置**：4.1.8 定义 `_checkConsent()`（下划线前缀表示私有），但 5.1.2 外部调用 `LocationService._checkConsent()`

**问题**：命名规范矛盾。如果设计为私有方法，不应在模块外部调用。

**建议**：去掉下划线前缀，改为 `LocationService.checkConsent()`，或封装在 `init()` 中自动调用。

---

### 🟡 H5: 轨迹加载 `_haversine()` 调用方式与函数签名不一致

**位置**：5.1.5 `loadTrajectory()`

**问题代码**：
```javascript
const points = records
  .map(r => [parseFloat(r.latitude), parseFloat(r.longitude)])
  .filter((p, i, arr) => i === 0 || _haversine(p, arr[i-1]) < 5000);
```

**问题**：`_haversine` 函数定义：
```javascript
function _haversine(p1, p2) {
  // 使用 p1[0], p1[1] (lat, lng)
}
```

调用时传入的是两个 point 数组 `[lat, lng]`，与函数签名匹配。但 5000 米的阈值是硬编码的魔法数字，应该提取为常量 `MAX_POINT_GAP_METERS`。

**更严重的问题**：`_haversine` 使用了 `p1[0]` 和 `p2[0]` 作为 latitude，但 `Math.cos(p1[0]*Math.PI/180)` 中 `p1[0]` 已经是 latitude，这是对的。但 `parseFloat(r.latitude)` 如果为 null/undefined 会得到 `NaN`，后续所有计算都会变成 `NaN`，过滤条件 `NaN < 5000` 为 `false`，该点会被错误地丢弃。

**建议**：增加 `isNaN` 检查和常量提取。

---

### 🟡 H6: 10s 全量轮询无清理机制，页面切换后定时器继续运行

**位置**：5.1.2 `startPolling()`

**问题代码**：
```javascript
function startPolling() {
  loadSnapshot();
  setInterval(loadSnapshot, 10000);
  setInterval(loadFences, FENCE_POLL_INTERVAL);
}
```

- `setInterval` 返回的 timer ID 没有被保存
- 页面切换（SPA 路由跳转）或组件卸载时，定时器继续运行，造成内存泄漏和无效请求
- 如果 `loadSnapshot` 执行时间超过 10s，会堆积多个并发请求

**建议**：
```javascript
let timers = [];
function startPolling() {
  loadSnapshot();
  timers.push(setInterval(loadSnapshot, 10000));
  timers.push(setInterval(loadFences, FENCE_POLL_INTERVAL));
}
function stopPolling() {
  timers.forEach(clearInterval);
  timers = [];
}
// 页面卸载时
window.addEventListener('beforeunload', stopPolling);
```

---

### 🟡 H7: `getCurrentPosition` 返回格式不一致

**位置**：4.1.3 `_getPositionNative()` 与 5.2 `attend.js` 调用处

**问题**：
- `_getPositionNative` 中 Capacitor 分支返回 `{ coords: { latitude, longitude, accuracy } }`
- `navigator.geolocation` 分支也返回标准 GeolocationPosition `{ coords: { latitude, longitude, accuracy } }`
- 但 5.2 调用处期望 `pos.lat`、`pos.lng`、`pos.accuracy`

**矛盾**：`LocationService.getCurrentPosition()` 的返回格式未在方案中明确定义。如果内部调用 `_getPositionNative` 后直接返回，调用方收到的是 `{ coords: { latitude, longitude } }`，但 `attend.js` 使用 `pos.lat` 会返回 `undefined`。

**建议**：在 `LocationService.getCurrentPosition()` 中统一包装返回格式：
```javascript
return {
  lat: pos.coords.latitude,
  lng: pos.coords.longitude,
  accuracy: pos.coords.accuracy,
  source: pos.source || 'gps'
};
```

---

## 四、中风险问题（🟠 建议优化）

### 🟠 M1: 运动检测 `setInterval` 无清理机制

**位置**：4.1.5 `_startMotionDetection()`

```javascript
setInterval(() => { /* 运动检测 */ }, VEHICLE_SLOW_WINDOW);
```

- 调用 `stopWatch()` 后，此 interval 仍在运行
- 多次调用 `watchPosition` 会创建多个 interval

**建议**：保存 interval ID，在 `stopWatch()` 中清理。

---

### 🟠 M2: `_filterAndReport` 中 `reverseGeocode` 异步未等待

**位置**：4.1.11

```javascript
reverseGeocode(gcj.lat, gcj.lng).then(addr => {
  const data = { ... };
  queueLocation(data);
  _emit('position', data);
});
```

- `_filterAndReport` 函数在 `reverseGeocode` 完成前就返回了
- 调用方无法知道何时真正完成入库
- 如果逆地理失败（网络错误），`queueLocation` 不会被调用，位置数据丢失

**建议**：让 `_filterAndReport` 返回 Promise，或在逆地理失败时使用空地址兜底入库。

---

### 🟠 M3: 批量逆地理脚本中的 `AMAP_KEY` 硬编码

**位置**：7.4 `scripts/batch-reverse-geocode.js`

```javascript
const AMAP_KEY = '31e73c1d12b2848e7bd964774782a954';
```

- 密钥直接写在代码中，提交到 git 会泄露
- 应该从环境变量读取：`process.env.AMAP_KEY`

---

### 🟠 M4: 插件 `isAuthenticated` 硬编码本机地址

**位置**：6.2

```javascript
const req = http.get({ hostname: '127.0.0.1', port: 13000, ... });
```

- Docker 容器内 `127.0.0.1:13000` 不一定指向 NocoBase 应用本身
- 应该直接使用 `ctx.state.currentUser`，它已经由 NocoBase 认证中间件填充

---

### 🟠 M5: `dashboard/人员动态.html` 中管理端不应调用 `watchPosition`

**位置**：5.1.2

```javascript
LocationService.watchPosition(onUserPositionUpdate);
```

- 管理大屏展示的是**工人的位置**，不是管理员自己的位置
- `watchPosition` 是采集端（工人手机）才需要的功能
- 管理端只需要从聚合 API 获取工人位置数据

**建议**：管理端移除 `watchPosition`，仅保留 `loadSnapshot` 轮询。

---

### 🟠 M6: 移动端 20 人筛选规则未定义

**位置**：5.1.3

```javascript
const maxMarkers = isMobile ? MOBILE_MAX_MARKERS : Infinity;
allUsers.forEach(u => {
  if (count >= maxMarkers) return;
  // ...
});
```

- 当前按 `allUsers` 数组顺序取前 20 人，可能不是最重要的 20 人
- 建议按"在线状态 + 最近活跃时间"排序后再截取

---

### 🟠 M7: nginx 配置中 `location /peopledynamic` 设计多余

**位置**：6.4

```nginx
location /peopledynamic {
    auth_request /api/plugin-dashboard-home/auth-check;
    proxy_pass http://app:13000/api/__pd__/dashboard-snapshot;
}
```

- 插件已在 NocoBase 内部注册 `/api/__pd__/*` 路由
- NocoBase 前置的 nginx 已经会代理 `/api/*` 到 app 容器
- 额外的 `/peopledynamic` location 是多余的，且 `auth_request` 指向的端点可能不存在

**建议**：删除 nginx 配置中的 `/peopledynamic` location，直接使用 `/api/__pd__/dashboard-snapshot`。

---

## 五、验收标准审计

| # | 指标 | 目标 | 审计意见 |
|---|------|------|----------|
| P1 | 首屏加载 PC | ≤2s | 🟡 激进但可争取，取决于地图瓦片 CDN 速度 |
| P1 | 首屏加载 移动 | ≤3s | ✅ 合理 |
| P2 | Marker 渲染 PC | 200 人 ≥ 55fps | 🟡 偏激进，建议改为 ≥ 45fps 或标注"无动画全开" |
| P2 | Marker 渲染 移动 | 20 人 ≥ 30fps | ✅ 合理 |
| P3 | 内存 PC | ≤100MB | ✅ 合理 |
| P3 | 内存 移动 | ≤50MB | ✅ 合理 |
| P4 | 聚合 API | ≤200ms (P99 ≤500ms) | 🟡 取决于 SQL 优化程度，当前 JS 去重 + pageSize 限制有隐患 |
| P5 | 离线队列恢复 | ≤30s (100 条) | ❌ ** IndexedDB 代码错误，此验收无法通过** |
| F2 | 室内静止 15min | GPS 停止唤醒 | ✅ 合理（移动网页端后台本来就会停止） |
| F6 | 弱网/离线 10min | 30s 自动同步 | ❌ **SW token 竞态 + IndexedDB 错误，无法保证** |

---

## 六、风险对策审计

| 风险 | 概率 | v2.0 对策 | 审计意见 |
|------|------|-----------|----------|
| iOS 不支持 background-sync | 高 | `visibilitychange` + `online` | ✅ 已接受降级，合理 |
| DeviceMotionEvent 需 HTTPS + 交互 | 高 | 5min 位移兜底 | ✅ 合理 |
| 逆地理配额溢出 | 中 | 客户端缓存 + 服务端限量 | ⚠️ 服务端 `/api/__dh__/regeo` 缺失，前端逆地理会直接失败 |
| IndexedDB 配额不足 | 低 | 队列上限 1000 | ✅ 合理 |
| SW 注册失败 (Safari 无痕) | 中 | fallback `visibilitychange` | ✅ 合理 |
| 聚合 API QPS 过高 | 低 | ~5KB/次，NocoBase 可承载 | 🟡 200 人 × 10s = 20 QPS 本身不高，但 SQL 查询复杂度被低估 |
| 移动端 Canvas 卡顿 | 中 | 限制 20 个点 | ✅ 合理 |

---

## 七、排期审计

| 天数 | 交付物 | 审计意见 |
|------|--------|----------|
| D1-D3 | location-service.js + SW + DB 迁移 | ⚠️ 若修复 IndexedDB API 错误 + SW token 竞态，3 天紧张但可完成 |
| D4-D5 | 前端接入 + attend.js + core.js | ✅ 合理 |
| D6-D7 | NocoBase 聚合插件 | ⚠️ 插件目录结构和认证方式需重写，2 天偏紧 |
| D8 | 质量增强 | ✅ 合理 |
| D9 | 联调与压测 | ⚠️ `ab -n 100` 样本不足，建议补充真实并发测试 |
| D10 | 缓冲期 | ✅ 合理 |

**总排期 10 天（含缓冲）**：若阻塞问题在 D1-D3 内全部修正，整体排期可行。若插件开发遇到 NocoBase 兼容性问题，D10 缓冲可能不够。

---

## 八、审计结论

### 8.1 v2.0 改进认可（✅）

1. **三端分离架构**：清晰拆分工人采集端/管理大屏/管理查看端，消解了 200 人并发模型的歧义
2. **坐标系转换**：`wgs84ToGcj02()` 内置，统一 GCJ-02 输出，解决围栏校验偏差问题
3. **隐私合规**：首次同意弹窗 + `consent_at` 字段 + 30 天清理，填补合规空白
4. **移动端渲染上限**：`MOBILE_MAX_MARKERS = 20`，避免移动端卡死
5. **移除不可行依赖**：放弃 `leaflet-canvas-markers` 和 `import()`，改用原生 `L.canvas`
6. **排期调整**：6 天 → 10 天（含 2 天缓冲），更现实

### 8.2 仍需修正的阻塞问题（🔴 → 必须）

| 优先级 | 问题 | 影响 |
|--------|------|------|
| P0 | **IndexedDB API 全面误用** | 离线队列完全不可用 |
| P0 | **SW token 竞态条件** | 后台同步几乎必然失败 |
| P0 | **NocoBase 插件目录/路由/认证错误** | 插件无法加载运行 |
| P0 | **聚合 API JS 去重 + pageSize 限制** | 工人位置数据可能丢失 |
| P0 | **逆地理代理端点缺失** | 前端镇街名显示不可用 |

### 8.3 建议修正的高风险问题（🟡 → 强烈建议）

| 优先级 | 问题 | 影响 |
|--------|------|------|
| P1 | iOS DeviceMotion 权限自动调用失败 | 运动检测在 iOS 上永久不可用 |
| P1 | `confirm()` 隐私弹窗体验差 | 用户可能误拒绝，且无法再次引导 |
| P1 | `L.circleMarker className` 无效 | 脉冲动画不生效 |
| P1 | `getCurrentPosition` 返回格式未统一 | `attend.js` 调用会返回 `undefined` |
| P1 | 管理端误调用 `watchPosition` | 逻辑错误，管理端不应采集自身位置 |

### 8.4 最终评级

| 维度 | 评级 | 说明 |
|------|------|------|
| 架构设计 | A- | 三端分离、坐标系、隐私合规均为优秀改进 |
| 代码正确性 | C+ | IndexedDB + SW + Leaflet 存在可运行的代码错误 |
| NocoBase 集成 | C+ | 插件规范和认证方式需重写 |
| 移动网页端适配 | B+ | 接受后台能力限制，移动端上限合理 |
| 可交付性 | B- | 修正 5 个阻塞问题后可进入开发 |

**综合建议**：
- **D1 必须完成**：修正 IndexedDB Promise 包装、SW token 存储到 IndexedDB、统一 `getCurrentPosition` 返回格式
- **D2 必须完成**：重写 NocoBase 插件为规范结构，使用标准路由注册和 `ctx.state.currentUser`
- **D3 必须完成**：补充 `/api/__pd__/regeo` 逆地理代理端点，修正聚合 API SQL 去重
- 以上完成后，整体方案可进入开发阶段

---

> 审计完毕。本报告仅审计不修改，所有代码错误均已标注正确用法示例。
