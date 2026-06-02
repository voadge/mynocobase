# 看板首页设置模板

## 架构概述

将 NocoBase 的自定义看板页面设为首页，由三部分组成：

```
用户浏览器 → nginx-proxy (668/443 SSL) → app 容器 nginx (nocobase.conf)
  → 选项 A: /home 路由 → plugin-dashboard-home (NocoBase插件) → 返回看板HTML
  → 选项 B: /dashboard/ 路由 → 直接读 storage/dashboard 静态文件 (nginx alias)
```

---

## 1. NocoBase 插件 (plugin-dashboard-home)

### 原理
自定义 NocoBase 插件，注册 `/home` 路由 → 鉴权后读取 `storage/dashboard/index.html` 返回。

### 文件结构
```
nocobase-plugin-dashboard-home/
├── package.json                       # 插件元数据
├── @nocobase/plugin-dashboard-home/
│   └── dist/server/index.js          # 服务端插件 (活跃版本 v3)
│       - before:auth 中间件: cookie→Bearer 转换
│       - GET /home 路由: 鉴权 → 读 HTML → 返回
├── dist/server/
│   ├── index.js                      # 服务端插件 (v1: /api/__dh__)
│   └── index.js.server               # 服务端插件 (v2: 多页面 + auth-check)
├── dist/client/
│   └── index.js                      # 客户端插件 (SPA /home 路由)
├── dist/client-v2/
│   └── index.js                      # 客户端插件 v2
├── client-v2.js                      # 客户端插件 (独立部署用)
├── dashboard.html                    # 看板 HTML (插件内)
└── nginx.conf                        # 完整 nginx 参考配置
```

### 服务端插件核心逻辑 (`@nocobase/plugin-dashboard-home/dist/server/index.js`)

```javascript
// 1. Cookie→Bearer 转换 (放在 auth 中间件之前)
this.app.use(async (ctx, next) => {
  if (!ctx.get('authorization')) {
    const token = ctx.cookies.get('nb_token') || ctx.cookies.get('NOCOBASE_token');
    if (token) ctx.request.headers['authorization'] = 'Bearer ' + token;
  }
  await next();
}, { before: 'auth' });

// 2. /home 路由处理
this.app.use(async (ctx, next) => {
  if (ctx.method !== 'GET' || ctx.path !== '/home') return await next();

  if (await isAuthenticated()) {
    // 读 storage/dashboard/index.html
    ctx.type = 'text/html; charset=utf-8';
    ctx.body = html;
  } else {
    ctx.redirect('/signin?redirect=/home');
  }
});
```

### 客户端插件核心逻辑 (`dist/client/index.js`)

```javascript
// 注册 SPA 路由 /home，直接触发全页跳转
this.app.router.add('dashboard-home-redirect', {
  path: '/home',
  Component: function() {
    window.location.replace('/home');
    return null;
  }
});
```

---

## 2. Nginx 配置 (nocobase.conf)

运行在 app 容器内部的 nginx，提供反向代理和鉴权保护。

### 核心配置块

| 配置块 | 作用 |
|--------|------|
| `location /home` | 代理到 `app:13000`，NocoBase 插件处理 |
| `location /dashboard/` | nginx alias 直接读取 `storage/dashboard/` 静态文件 |
| `location = /` | 根路径重定向到 `/home` 或 `/dashboard/index.html` |
| `location /__auth-check` | 内部鉴权端点 |
| `location @login_redirect` | 鉴权失败时重定向到登录页 |
| `location /signin` | 登录页（绕过鉴权）+ SPA 导航拦截 |
| `location /api/` | API 路径（绕过鉴权） |
| `location / { ... }` | 兜底路由，auth_request 保护 |

### SPA 导航拦截

在 `/` 和 `/signin` 中注入 `sub_filter`，拦截 SPA 的 `pushState`/`replaceState` 中对 `/home` 的调用，强制触发全页导航：

```nginx
sub_filter '</head>' '</head><script>
(function(){
  var a=history.pushState,b=history.replaceState;
  history.pushState=function(){
    return arguments[2]&&String(arguments[2]).startsWith("/home")
      ?void(location.href=arguments[2]):a.apply(history,arguments)
  };
  history.replaceState=function(){
    return arguments[2]&&String(arguments[2]).startsWith("/home")
      ?void(location.href=arguments[2]):b.apply(history,arguments)
  };
})();</script>';
```

---

## 3. 看板 HTML 文件

看板文件存放在 `dashboard/` 目录，通过 volume mount 挂载到容器内：
```yaml
volumes:
  - ./dashboard:/app/nocobase/storage/dashboard:ro
```

### 鉴权机制 (看板 HTML 内)

```javascript
// 从 localStorage 读 token → 设置 cookie 供 nginx auth_request 使用
var prefixes = ['NOCOBASE_', 'nocobase_'];
var token = localStorage.getItem('NOCOBASE_token');
document.cookie = 'nb_token=' + token + '; path=/; max-age=3600';

// 验证身份
fetch('/api/auth:check').then(r => { if (r.status !== 200) window.location.href = '/signin'; });
```

### 参考文件

| 文件 | 说明 |
|------|------|
| `E:\my-project\dashboard.html` | 生产版看板 (完整数据源配置) |
| `E:\my-project\nocobase-plugin-dashboard-home\dashboard.html` | 开发版看板 (CSS 变量、响应式) |
| `E:\my-project\dashboard\` | 静态资源目录 (字体、JS 库) |

---

## 4. 部署脚本

### 4.1 安装看板首页插件到服务器

```bash
# 上传插件文件到服务器
ssh -i <key> ubuntu@<server-ip> 'sudo mkdir -p /opt/noco-base/storage/plugins/@nocobase/plugin-dashboard-home/dist/server'

# 复制服务端插件
scp -i <key> nocobase-plugin-dashboard-home/@nocobase/plugin-dashboard-home/dist/server/index.js ubuntu@<server-ip>:/opt/noco-base/storage/plugins/@nocobase/plugin-dashboard-home/dist/server/

# 复制 package.json
scp -i <key> nocobase-plugin-dashboard-home/package.json ubuntu@<server-ip>:/opt/noco-base/storage/plugins/@nocobase/plugin-dashboard-home/package.json

# 复制客户端插件
scp -i <key> nocobase-plugin-dashboard-home/client-v2.js ubuntu@<server-ip>:/opt/noco-base/storage/plugins/@nocobase/plugin-dashboard-home/

# 注册插件到数据库
docker exec -e PGPASSWORD=<db-password> <app-container> psql -h postgres -U nocobase -d nocobase <<'SQL'
DELETE FROM public."applicationPlugins" WHERE name = 'dashboard-home';
INSERT INTO public."applicationPlugins" (createdAt, updatedAt, name, packageName, version, enabled, installed, builtIn, options)
VALUES (NOW(), NOW(), 'dashboard-home', '@nocobase/plugin-dashboard-home', '1.0.0', true, true, false, '{}');
SQL
```

### 4.2 更新 Nginx 配置 (nocobase.conf)

```bash
# 切换到 /home 重定向
sed -i 's|return 302 .*dashboard/index.html;|return 302 /home;|' /opt/noco-base/storage/nocobase.conf

# 添加 /home 代理 (在 location / 之前插入)
sed -i '/^    location \/ {/i\
    location /home {\
        proxy_pass http://app:13000;\
        proxy_set_header Host \$host;\
        proxy_set_header X-Real-IP \$remote_addr;\
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;\
        proxy_set_header X-Forwarded-Proto \$scheme;\
    }' /opt/noco-base/storage/nocobase.conf

# 复制到容器内并重载
sudo cp /opt/noco-base/storage/nocobase.conf /opt/noco-base/nocobase.conf
docker exec <app-container> nginx -s reload
```

### 4.3 添加 Nginx 内部鉴权 + 看板路由 (10-dashboard.sh)

```bash
# 插入 /__auth-check 内部端点
awk '/^    location \/ \{/ {
    print "    location = /__auth-check {"
    print "        internal;"
    print "        proxy_pass http://127.0.0.1:13000/api/auth:check;"
    print "        ..."
    print "    }"
    print ""
    print "    location = / { return 302 /dashboard/index.html; }"
    print ""
    print "    location /dashboard/ {"
    print "        auth_request /__auth-check;"
    print "        error_page 401 = @login_redirect;"
    print "        alias /app/nocobase/storage/dashboard/;"
    print "    }"
    print ""
    print "    location @login_redirect { return 302 .../signin; }"
    print ""
}
{ print }' /opt/noco-base/storage/nocobase.conf
```

### 4.4 完整部署脚本

参考 `E:\my-project\deploy-plugin.sh`（一键部署插件+nginx+重启容器）。

---

## 5. 设置模板

### 5.1 快速启用看板首页 (插件版 `/home`)

```bash
# 1. 确保插件文件在位置
# 2. 注册插件到 DB
# 3. 修改 nginx: 根路径 → /home 重定向，添加 /home proxy
# 4. 重启 app 容器
# 5. 重载 nginx
```

### 5.2 快速启用看板首页 (纯 nginx 版 `/dashboard/`)

```bash
# 1. 确保 storage/dashboard/index.html 存在
# 2. 修改 nginx: 添加 /dashboard/ alias，根路径 → /dashboard/index.html 重定向，添加 auth_check
# 3. 重载 nginx
```

### 5.3 移除看板首页

```bash
# 删除 nginx 中的看板相关 location 块：
# - location = /__auth-check
# - location = /
# - location /dashboard/
# - location @login_redirect
# - location /home
# 恢复默认 nginx 配置后重载
```

---

## 6. 完整文件清单

| 文件 | 路径 | 说明 |
|------|------|------|
| 服务端插件 (v3) | `nocobase-plugin-dashboard-home/@nocobase/plugin-dashboard-home/dist/server/index.js` | `/home` 路由处理，cookie→Bearer 鉴权 |
| 服务端插件 (v2) | `nocobase-plugin-dashboard-home/dist/server/index.js.server` | 多页面 + auth-check 端点 |
| 客户端插件 | `nocobase-plugin-dashboard-home/dist/client/index.js` | SPA /home 路由注册 |
| 看板 HTML | `nocobase-plugin-dashboard-home/dashboard.html` | 开发版看板 |
| 看板 HTML | `dashboard.html` | 生产版看板 |
| nginx 参考配置 | `nocobase-plugin-dashboard-home/nginx.conf` | 完整 nginx 配置 |
| 快速部署脚本 | `10-dashboard.sh` | 容器启动时注入看板路由 |
| 部署脚本 | `apply_dashboard.sh` | 手动注入看板路由 |
| 插件部署 | `deploy-plugin.sh` | 一键部署插件+nginx |
| 移除脚本 | `remove_root_redirect.sh` | 移除根路径重定向 |
| Docker Compose | `docker-compose.yml` | 看板 volume mount 配置 |
