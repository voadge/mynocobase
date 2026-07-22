# 修订计划：微信小程序套壳 NocoBase (v1.3)

> 版本: v1.3  
> 日期: 2026-07-22  
> 状态: 实施中  
> 基于: 微信小程序开发文档 https://developers.weixin.qq.com/miniprogram/dev/framework/

---

## 一、根本目标

**微信小程序是移动端访问生产系统的入口，替代手机浏览器。**

- 原来：工人用手机浏览器访问 `https://voadge.top:668/dashboard/` → 操作 NocoBase
- 现在：工人用微信小程序访问 → web-view 加载完整 NocoBase → 操作所有功能

小程序不是只套壳"人员动态"页面，而是**完整套壳整个 NocoBase 系统**。

---

## 二、文档关键发现与问题修正

### 问题 1：DevTools 导入失败（"无可选文件"）

**原因**: 微信开发者工具新建项目时，**必须选择空目录**。

> 文档原文："注意：你要选择一个空的目录才可以创建项目"

**当前状态**: 已在 `E:\my-project\miniprogram-dev\` 创建项目，DevTools 已生成配置文件。

### 问题 2：web-view 业务域名不支持端口号

**文档原文**: "域名只支持 https 协议，不支持 IP 地址" + 业务域名格式限制

**当前配置**: 双端口并行
- **668**: 保留给现有浏览器用户（不变）
- **443**: 专门给小程序 web-view 使用

小程序 web-view URL: `https://voadge.top/dashboard/?token=xxx`（标准 443 端口）
微信后台业务域名: `voadge.top`

### 问题 3：auth-sync.js 需要支持 URL token 注入

**原有功能**: 只拦截登录响应，设置 localStorage + cookie
**新增功能**: 读取 URL `?token=` 参数，写入 localStorage + cookie，然后清理 URL

已部署到服务器，验证通过。

---

## 三、修正后的实施步骤（已完成）

### Step 1：准备空目录给 DevTools ✅

已在 `E:\my-project\miniprogram-dev\` 创建项目，DevTools 已生成配置文件。

### Step 2：清理并复制代码 ✅

已清理 DevTools 默认文件，复制所有代码文件到 `miniprogram-dev\`。

### Step 3：修改 auth-sync.js 支持 URL token ✅

在 `dashboard/assets/auth-sync.js` 末尾增加：
- 读取 URL `?token=` 参数
- 写入 localStorage `NOCOBASE_TOKEN`
- 写入 cookie `nb_token`
- 清理 URL 中的 token 参数

已部署到服务器 `/opt/noco-base/dashboard/assets/auth-sync.js`。

### Step 4：修改 web-view 加载完整 NocoBase ✅

将 `pages/index/index.js` 中的 URL 从：
```javascript
const url = `${app.globalData.baseUrl}/dashboard/人员动态.html?token=${encodeURIComponent(token)}`;
```
改为：
```javascript
const url = `${app.globalData.baseUrl}/dashboard/?token=${encodeURIComponent(token)}`;
```

### Step 5：在微信后台配置业务域名

登录 mp.weixin.qq.com → 开发管理 → 开发设置 → 业务域名：
- 添加 `voadge.top`（不含端口、不含路径）

### Step 6：DevTools 编译预览

1. DevTools 中点击"编译"查看模拟器效果
2. 点击"预览"生成二维码，用手机微信扫码测试
3. 验证：登录 → web-view 加载完整 NocoBase → 可操作所有功能

### Step 7：真机调试

模拟器不支持 `wx.login()` 返回真实 code，必须用真机：
1. DevTools 点击"真机调试"
2. 手机微信扫码
3. 验证完整登录流程

---

## 三、修正后的目录结构

```
miniprogram-dev/
├── app.json              ← 全局配置（页面路由、窗口、权限）
├── app.js                ← 入口（globalData: baseUrl, token）
├── app.wxss              ← 全局样式
├── sitemap.json          ← 搜索配置
├── project.config.json   ← DevTools 自动生成，不要手动改
└── pages/
    ├── index/
    │   ├── index.js      ← 登录 → web-view
    │   ├── index.wxml    ← web-view 组件
    │   ├── index.json    ← 页面配置（可为空 {}）
    │   └── index.wxss    ← 样式
    └── bind/
        ├── bind.js       ← 用户选择绑定
        ├── bind.wxml     ← 搜索+选择 UI
        ├── bind.json     ← 页面配置
        └── bind.wxss     ← 样式
```

---

## 四、验证清单

| 检查项 | 状态 | 验证方法 | 通过标准 |
|--------|------|----------|----------|
| DevTools 导入 | ✅ | 新建项目→选空目录 | 不报"无可选文件" |
| 代码文件复制 | ✅ | 检查 miniprogram-dev/ | 所有文件就位 |
| auth-sync.js 修改 | ✅ | 读取 URL ?token= | 写入 localStorage + cookie |
| auth-sync.js 部署 | ✅ | 服务器验证 | 文件已更新 |
| web-view URL 修改 | ✅ | 检查 index.js | 加载 /dashboard/ |
| mp-login 用 WeChat 字段 | ✅ | 编译部署 | 用户查找用 WeChat=openid |
| bind-openid 更新 WeChat | ✅ | API 测试 | 更新 users.WeChat 字段 |
| 业务域名配置 | ⏳ | 微信后台添加 | 添加成功，无报错 |
| 模拟器编译 | ⏳ | DevTools 编译 | 无报错，显示 loading 页面 |
| 真机登录 | ⏳ | 真机调试→扫码 | 能拿到 token |
| web-view 加载 | ⏳ | 真机调试 | 完整 NocoBase 界面 |
| 功能操作 | ⏳ | 真机调试 | 可操作所有 NocoBase 功能 |

---

## 五、文件变更清单

### 已修改的文件
- `dashboard/assets/auth-sync.js` — 增加 URL ?token= 参数读取，已部署到服务器
- `miniprogram-dev/pages/index/index.js` — web-view URL 改为 /dashboard/
- `nocobase-plugin-dashboard-home/src/server/middleware/mp-login.ts` — 用 users.WeChat 字段替代 user_openid 表，已编译部署
- `nocobase-plugin-dashboard-home/dist/server/middleware/mp-login.js` — 编译后的文件，已部署到服务器

### 无需修改的文件
- `nginx.conf` — 已配好（端口 443、业务域名验证文件）
- `docker-compose.yml` — 已配好（WX_APP_SECRET、端口映射）
- 服务端 mp-login 插件 — 已部署验证通过

### 小程序文件（miniprogram-dev/）
```
miniprogram-dev/
├── app.json              ← 全局配置（页面路由、窗口、权限）
├── app.js                ← 入口（globalData: baseUrl, token）
├── app.wxss              ← 全局样式
├── sitemap.json          ← 搜索配置
├── project.config.json   ← DevTools 自动生成，不要手动改
├── project.private.config.json ← DevTools 内部文件
└── pages/
    ├── index/
    │   ├── index.js      ← 登录 → web-view 加载完整 NocoBase
    │   ├── index.wxml    ← web-view 组件
    │   ├── index.json    ← 页面配置
    │   └── index.wxss    ← 样式
    └── bind/
        ├── bind.js       ← 用户选择绑定
        ├── bind.wxml     ← 搜索+选择 UI
        ├── bind.json     ← 页面配置
        └── bind.wxss     ← 样式
```
