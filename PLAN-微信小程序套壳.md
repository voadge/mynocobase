# 计划：微信小程序套壳 H5 (v1 快速上线)

> 版本: v1.1  
> 日期: 2026-06-06  
> 状态: 待实施  
> 前置依赖: v2.0 H5 优化完成并稳定运行 2-4 周  
> 关联方案: `PLAN-微信小程序混合.md` (v2 增强版)  

---

## 目录

1. [目标](#一目标)
2. [架构](#二架构)
3. [前提条件](#三前提条件)
4. [微信小程序工程](#四微信小程序工程)
5. [服务端新增端点](#五服务端新增端点)
6. [nginx 配置变更](#六nginx-配置变更)
7. [H5 侧适配](#七h5-侧适配)
8. [微信审核策略](#八微信审核策略)
9. [开发排期](#九开发排期)
10. [发布与灰度](#十发布与灰度)
11. [文件变更清单](#十一文件变更清单)
12. [附录：微信开发规范关键摘录](#十二附录微信开发规范关键摘录)

---

## 一、目标

在不改动现有 H5 代码的前提下，通过微信小程序 `<web-view>` 组件嵌入现有看板页面，实现：

- 工人通过微信内一键打开（无需书签/输入网址）
- 利用微信 JS-SDK `wx.getLocation()` 获取更精准的原生定位（GCJ-02，无需坐标系转换）
- 保留所有现有 H5 功能（看板、打卡、围栏、人脸）
- NocoBase 后端完全不变，围栏核验由服务端现有工作流处理（考勤规则计算__post-create.js）
- 小程序不做任何围栏计算，只传原始坐标
- 为后续混合增强方案（`PLAN-微信小程序混合.md`）预留壳工程

## 二、架构

```
┌───────────────────────────────────────────┐
│              微信小程序 (企业号)             │
│                                           │
│   app.js                                  │
│   ├── onLaunch: wx.login() → 换 token     │
│   └── token → 拼接 web-view URL           │
│                                           │
│   pages/index/index.wxml                   │
│   └── <web-view                           │
│         src="https://voadge.top:668/       │
│               dashboard/人员动态.html       │
│               ?token={{token}}"            │
│         bindmessage="onMessage" />         │
│                                           │
│   ┌───────────────────────────────────┐   │
│   │  web-view 内 H5 页面               │   │
│   │                                   │   │
│   │  1. 检测小程序环境                  │   │
│   │     window.__wxjs_environment      │   │
│   │                                   │   │
│   │  2. 加载 JS-SDK (jweixin-1.3.2)   │   │
│   │     wx.config({...})              │   │
│   │                                   │   │
│   │  3. wx.getLocation()              │   │
│   │     返回 GCJ-02 坐标，精度 3-10m   │   │
│   │                                   │   │
│   │  4. 其余功能与浏览器 H5 完全一致    │   │
│   └───────────────────────────────────┘   │
└───────────────────────────────────────────┘
           │
           ▼
     NocoBase 后端 (完全不变)
```

### 核心原则

- **零 H5 代码改动** — 不修改任何现有文件
- **小程序只做壳** — 定位、登录等通过 JS-SDK / URL 参数完成
- **后端增量** — 仅加 2 个轻量端点，纳入现有插件

## 三、前提条件

### 3.1 微信侧准备

| 事项 | 说明 | 周期 |
|------|------|------|
| 注册企业号小程序 | 微信公众平台注册，需企业资质，认证费 300 元/年 | 1-3d |
| 获取 AppID + AppSecret | 开发必备 | 注册即得 |
| 配置业务域名 | `voadge.top` 加入 web-view 白名单，需上传校验文件 | 0.5d |
| 配置服务器域名 | `https://voadge.top:668` 加入 request 合法域名 | 0.5d |

### 3.2 服务端准备

- NocoBase 正常运行，`/api/` 路由可达
- `@nocobase/plugin-people-dynamic` 插件已启用（见 v2.0 计划）
- nginx 可新增 location 配置（需重启）

## 四、微信小程序工程

### 4.1 目录结构

```
miniprogram-wechat-shell/
├── app.json
├── app.js
├── app.wxss
├── project.config.json
├── pages/
│   └── index/
│       ├── index.wxml
│       ├── index.js
│       └── index.wxss
└── utils/
    ├── auth.js
    └── config.js
```

### 4.2 核心文件

#### app.json

```json
{
  "pages": ["pages/index/index"],
  "window": {
    "navigationBarTitleText": "人员动态",
    "navigationStyle": "default"
  },
  "requiredBackgroundModes": [],
  "permission": {
    "scope.userLocation": {
      "desc": "用于考勤打卡时的位置校验"
    }
  }
}
```

#### app.js

```javascript
const auth = require('./utils/auth');

App({
  globalData: {
    token: ''
  },
  onLaunch() {
    this.login();
  },
  async login() {
    try {
      const token = await auth.login();
      this.globalData.token = token;
      // 通知当前页面更新 web-view URL
      const page = this.getCurrentPage();
      if (page) page.setToken(token);
    } catch (err) {
      console.error('登录失败', err);
    }
  },
  getCurrentPage() {
    const pages = getCurrentPages();
    return pages[pages.length - 1];
  }
});
```

#### pages/index/index.wxml

```xml
<web-view
  wx:if="{{pageUrl}}"
  src="{{pageUrl}}"
  bindmessage="onMessage"
  binderror="onError"
/>
<view wx:else class="loading">
  <text>加载中...</text>
</view>
```

#### pages/index/index.js

```javascript
const app = getApp();

Page({
  data: {
    pageUrl: ''
  },
  onLoad() {
    const token = app.globalData.token;
    if (token) {
      this.setToken(token);
    }
  },
  setToken(token) {
    const baseUrl = 'https://voadge.top:668/dashboard/人员动态.html';
    this.setData({
      pageUrl: `${baseUrl}?token=${encodeURIComponent(token)}`
    });
  },
  onMessage(e) {
    // 接收 H5 发来的消息（预留，如跳转原生页面）
    console.log('web-view message:', e.detail.data);
  },
  onError(e) {
    console.error('web-view 加载失败:', e.detail);
  }
});
```

#### utils/auth.js

```javascript
const config = require('./config');

function login() {
  return new Promise((resolve, reject) => {
    wx.login({
      success: async (res) => {
        if (!res.code) {
          reject(new Error('wx.login 失败'));
          return;
        }
        try {
          const result = await wx.request({
            url: `${config.API_HOST}/api/__pd__/mp-login`,
            method: 'POST',
            data: { code: res.code }
          });
          const token = result.data.token;
          wx.setStorageSync('auth_token', token);
          resolve(token);
        } catch (err) {
          reject(err);
        }
      },
      fail: reject
    });
  });
}

module.exports = { login };
```

#### utils/config.js

```javascript
module.exports = {
  API_HOST: 'https://voadge.top:668',
  APP_ID: 'wxxxxxxxxxxxxx'  // 替换为实际 AppID
};
```

### 4.3 小程序代码量

| 文件 | 行数 |
|------|------|
| app.json | ~15 |
| app.js | ~30 |
| pages/index/index.wxml | ~10 |
| pages/index/index.js | ~35 |
| utils/auth.js | ~35 |
| utils/config.js | ~5 |
| **合计** | **~130 行** |

## 五、服务端新增端点

纳入 `@nocobase/plugin-people-dynamic` 插件。

### 5.1 POST /api/__pd__/mp-login

**用途**: 微信登录 code → JWT token

**流程**:

```
小程序 wx.login() → code
    │
    ▼
POST /api/__pd__/mp-login { code }
    │
    ▼
服务端 GET https://api.weixin.qq.com/sns/jscode2session
    ?appid=APPID&secret=SECRET&js_code=code&grant_type=authorization_code
    │
    ▼
返回 { openid, session_key }
    │
    ▼
在 user_openid 表中查找/创建用户映射
    │
    ▼
生成 JWT (使用 NocoBase 同一 APP_KEY)
    │
    ▼
返回 { token, user: { id, nickname } }
```

**请求**:

```json
{
  "code": "071XpB0w3QcKed3EPd1w3YqPis3XpB0I"
}
```

**响应**:

```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": 42,
    "nickname": "张三"
  }
}
```

**DB 映射表**:

```sql
CREATE TABLE IF NOT EXISTS user_openid (
  id            BIGSERIAL PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users(id),
  openid        VARCHAR(64) NOT NULL UNIQUE,
  created_at    TIMESTAMP DEFAULT NOW(),
  last_login_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_user_openid_openid ON user_openid(openid);
```

### 5.2 GET /api/__pd__/wx-signature

**用途**: 为 web-view 内 H5 页面生成 JS-SDK `wx.config()` 签名

**流程**:

```
H5 页面加载 → 请求签名
    │
    ▼
GET /api/__pd__/wx-signature?url=https://voadge.top:668/dashboard/人员动态.html
    │
    ▼
服务端:
1. 从缓存/Redis 获取 jsapi_ticket (缓存 2h)
2. 如无则调用微信 API 获取 (需要 appid + appsecret)
3. 生成 noncestr + timestamp + signature
    │
    ▼
返回 { appId, nonceStr, timestamp, signature }
```

**响应**:

```json
{
  "appId": "wxxxxxxxxxxxxx",
  "nonceStr": "abc123",
  "timestamp": 1717660800,
  "signature": "d4f1c5e3a2b6..."
}
```

**jsapi_ticket 获取**:

```
GET https://api.weixin.qq.com/cgi-bin/token
  ?grant_type=client_credential&appid=APPID&secret=SECRET
→ access_token

GET https://api.weixin.qq.com/cgi-bin/ticket/getticket
  ?access_token=ACCESS_TOKEN&type=jsapi
→ ticket (有效期 7200s)
```

### 5.3 配置要求

在 NocoBase 环境变量或插件配置中增加：

```
WX_APPID=wxxxxxxxxxxxxx
WX_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

## 六、nginx 配置变更

### 6.1 微信业务域名校验文件

在 nginx 配置中新增：

```nginx
# 微信小程序业务域名校验 (MP_verify_*.txt)
location ~* ^/MP_VERIFY_[A-Za-z0-9]+\.txt$ {
    root /usr/share/nginx/html;
    access_log off;
    log_not_found off;
}
```

校验文件放置: `E:\my-project\dashboard\MP_verify_xxxxx.txt`（根据微信后台生成的实际文件名）

### 6.2 重新加载 nginx

```bash
docker exec noco-base_nginx-proxy_1 nginx -s reload
```

## 七、H5 侧适配

**原则**: 不修改现有 H5 代码。但需在 `assets/location-service.js`（v2.0 新建）中预留小程序环境检测分支。

在 `LocationService.getCurrentPosition()` 中增加：

```javascript
async getCurrentPosition() {
  // 微信小程序 web-view 环境
  if (window.__wxjs_environment === 'miniprogram') {
    // 通过 JS-SDK 获取微信原生定位
    await this._ensureWxJsSdkReady();
    return new Promise((resolve, reject) => {
      wx.getLocation({
        type: 'gcj02',
        success: (res) => resolve({
          coords: {
            latitude: res.latitude,
            longitude: res.longitude,
            accuracy: res.accuracy
          },
          timestamp: Date.now()
        }),
        fail: reject
      });
    });
  }

  // 标准浏览器 fallback
  return super.getCurrentPosition(); // navigator.geolocation
}

async _ensureWxJsSdkReady() {
  if (this._wxReady) return;

  // 加载 JS-SDK
  await this._loadScript('https://res.wx.qq.com/open/js/jweixin-1.3.2.js');

  // 获取签名
  const currentUrl = window.location.href.split('#')[0];
  const res = await fetch(`/api/__pd__/wx-signature?url=${encodeURIComponent(currentUrl)}`);
  const config = await res.json();

  // 配置 wx.config
  return new Promise((resolve, reject) => {
    wx.config({
      debug: false,
      appId: config.appId,
      timestamp: config.timestamp,
      nonceStr: config.nonceStr,
      signature: config.signature,
      jsApiList: ['getLocation', 'getNetworkType']
    });
    wx.ready(resolve);
    wx.error(reject);
  });
}
```

**改动范围**: 仅 `assets/location-service.js`，约 +30 行，不影响现有 H5 浏览器行为。

### 7.1 关键说明：围栏核验已在服务端完成

小程序**不做任何围栏计算**。当前 `考勤规则计算__post-create.js` 工作流在打卡提交后自动处理：

```
POST /api/__pd__/attendance/submit { lat, lng, check_type, ... }
    ↓
创建 attendance_records (workflow_status = 'normal')
    ↓
↓ 考勤规则计算__post-create.js (自动触发)
    ├── 从 DB 读所有 geofences
    ├── 计算 point-to-polyline 距离
    ├── 回写 geofence_inside / geofence_distance / geofence_id
    ├── 计算迟到早退
    ├── 校验是否在出差期间
    └── 更新 att_archives 月统计
```

小程序只需传入 `{ latitude, longitude }`，余下由服务端工作流完成。

### 7.2 轨迹生成由服务端处理

轨迹查询不由小程序直接拿原始 `location_history` 渲染。由后端新增端点处理后返回：

```
GET /api/__pd__/trajectory?userId=42&date=2026-06-06
    ↓
服务端处理:
1. 从 location_history 查原始点
2. 过滤 accuracy > 100m 的噪点
3. 聚合同一位置 3min 内的点（停留合并）
4. Douglas-Peucker 轨迹抽稀
5. 返回清洗后的路径
    ↓
小程序 <map> polyline 直接渲染
```

此 API 在套壳 v1 中暂不实现，留待混合 v2 方案使用。

## 八、微信审核策略

### 8.1 审核风险评估

| 风险 | 等级 | 说明 |
|------|------|------|
| web-view 业务域名 | 低 | 配置一次即可 |
| `wx.getLocation()` (前台定位) | **低** | 常规 API，不受限 |
| 企业号认证 | 低 | 提交营业执照即可 |
| 隐私协议 | 中 | 需明确说明定位用途、存储期限 |

### 8.2 与混合 v2 方案的审核隔离

套壳 v1 **不使用** `wx.startLocationUpdateBackground`（后台定位），仅使用前台 `wx.getLocation()`，这是微信常规 API，审核通过率 > 95%。

```
v1 壳 (本方案)         → 前台定位，通过率 95%+
    ↓ 审核通过上线
v2 混合 (后续方案)      → 追加后台定位 + 原生页面
    ↓ 版本更新提审
    即使被拒，v1 仍在线上运行
```

**建议**: 先以本壳方案提交通过，取得小程序的发布资格和用户基数后，再通过版本更新加混合增强功能。后台定位若审核被拒，不影响已上线的壳版本。

## 九、开发排期

| 任务 | 工时 | 前置 |
|------|------|------|
| 微信小程序注册 + 企业认证 | 1-3d (并行) | — |
| nginx 新增校验文件 location | 0.5d | 拿到校验文件名 |
| 配置业务域名 + 服务器域名 | 0.5d | 注册完成 |
| 小程序壳工程搭建 (4 个文件) | 0.5d | — |
| `mp-login` 端点开发 | 0.5d | AppSecret 就绪 |
| `wx-signature` 端点开发 | 0.5d | AppSecret 就绪 |
| `LocationService` 小程序分支适配 | 0.5d | v2.0 代码就绪 |
| web-view + JS-SDK 联调 | 0.5d | 以上完成 |
| 内测 (5 人) | 1d | 联调通过 |
| 提审 + 发布 | 1-7d (等待) | 内测通过 |
| **净开发工时** | **~3d** | |
| **总周期** | **~5-12d** (含审核等待) | |

## 十、发布与灰度

| 阶段 | 范围 | 验证点 |
|------|------|--------|
| 体验版 | 内部 5 人 | 加载、登录、定位、打卡 |
| 灰度 10% | 随机 10% 工人 | web-view 稳定性、JS-SDK 兼容性 |
| 灰度 50% | 随机 50% | 全功能回归 |
| 全量 | 100% | 监控 1 周无异常 |

## 十一、文件变更清单

### 11.1 新建文件

| 文件 | 说明 |
|------|------|
| `miniprogram-wechat-shell/app.json` | 小程序全局配置 |
| `miniprogram-wechat-shell/app.js` | 入口、登录 |
| `miniprogram-wechat-shell/app.wxss` | 全局样式 |
| `miniprogram-wechat-shell/project.config.json` | 开发工具配置 |
| `miniprogram-wechat-shell/pages/index/index.wxml` | web-view 页面模板 |
| `miniprogram-wechat-shell/pages/index/index.js` | 页面逻辑、URL 拼接 |
| `miniprogram-wechat-shell/pages/index/index.wxss` | 页面样式 |
| `miniprogram-wechat-shell/utils/auth.js` | 微信登录封装 |
| `miniprogram-wechat-shell/utils/config.js` | 环境配置 |

### 11.2 修改文件

| 文件 | 改动 | 说明 |
|------|------|------|
| `nginx.conf` | +6 行 | 微信校验文件 location |
| `assets/location-service.js` | ~+30 行 | 小程序环境检测 + JS-SDK 分支 (v2.0 后) |
| `@nocobase/plugin-people-dynamic` | +2 端点 | `mp-login` + `wx-signature` |

### 11.3 不修改

- `dashboard/人员动态.html` — 不动
- `assets/attend.js` — 不动
- `assets/core.js` — 不动
- `docker-compose.yml` — 不动
- 其他 H5 文件 — 全不动

## 十二、附录：微信开发规范关键摘录

### web-view 组件

| 项目 | 说明 |
|------|------|
| 基础库要求 | >= 1.6.4 |
| 账号类型 | 仅企业号支持（个人号不可用） |
| 每页数量 | 1 个 (自动铺满全屏) |
| 业务域名 | 需在微信后台配置，需上传校验文件 |
| JS-SDK 支持 | getLocation ✓, chooseImage ✓, getNetworkType ✓ |
| 通信 | `wx.miniProgram.postMessage` (非实时，特定时机触发) |

### 小程序登录

| 项目 | 说明 |
|------|------|
| API | `wx.login()` → `code` |
| 服务端 | `auth.code2Session` → `openid` + `session_key` |
| 安全 | `session_key` 不返回小程序端 |

### 定位

| 项目 | 说明 |
|------|------|
| 前台定位 (H5) | `wx.getLocation()` via JS-SDK，返回 GCJ-02 |
| 后台定位 | `wx.startLocationUpdateBackground` (小程序原生层，v2+ 实现) |
| 精度 | 3-10m (GPS+基站+WiFi 融合) |
| 坐标系 | 直接 GCJ-02，无需 `wgs84ToGcj02` 转换 |
