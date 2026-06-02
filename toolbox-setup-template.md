# 百宝箱页面设置模板

## 架构概述

百宝箱是一个工具导航门户，聚合了多个纯前端办公工具，通过 NocoBase 插件鉴权保护后提供服务。

```
百宝箱 (/api/__tb__)
  ├── 行程发票报销助手 (/api/__fp__) — 纯前端 PDF解析+排版+报销单导出
  └── 智能排版打印助手 (/api/__tp__) — 纯前端 横竖混排+封面+PDF下载
```

所有页面通过 NocoBase 插件 `plugin-dashboard-home` 的 v2 服务端注册的 API 路由提供，鉴权后读取 `storage/dashboard/` 目录下的静态 HTML 文件。

---

## 1. 文件清单

| 文件 | 路径 | 说明 |
|------|------|------|
| 百宝箱首页 | `E:\my-project\百宝箱.html` | 工具导航门户 |
| 发票报销助手 | `E:\my-project\行程发票报销助手.html` | 车票PDF解析+排版+打印+报销单导出 |
| 排版打印助手 | `E:\my-project\智能排版打印助手.html` | 文档横竖混排+封面+打印 |
| 前端JS库 | `E:\my-project\dashboard\lib\` | pdf.js, xlsx, jspdf, mammoth, tailwind |
| 部署脚本 | `E:\my-project\scripts\deploy-dashboard-files.sh` | 上传文件到服务器 |
| 服务端插件(v2) | `nocobase-plugin-dashboard-home/dist/server/index.js.server` | 注册 API 路由 + 鉴权 |
| nginx 参考配置 | `nocobase-plugin-dashboard-home/nginx.conf` | 包含 `/api/__dh__` 等路径的代理配置 |

---

## 2. 服务端路由映射 (v2 插件)

插件 `dist/server/index.js.server` 注册以下 API → 文件映射：

```javascript
const PAGE_MAP = {
  '/api/__dh__': 'index.html',       // 主看板
  '/api/__tb__': '百宝箱.html',      // 百宝箱
  '/api/__fp__': '行程发票报销助手.html', // 发票报销助手
  '/api/__tp__': '智能排版打印助手.html', // 排版打印助手
};

const STORAGE_DIR = '/app/nocobase/storage/dashboard';
```

路由处理逻辑：
```javascript
// 放在 dataSource 中间件之前执行
this.app.use(async (ctx, next) => {
  if (ctx.method !== 'GET' || !PAGE_MAP[ctx.path]) return await next();

  if (await isAuthenticated(ctx)) {
    ctx.withoutDataWrapping = true;
    ctx.type = 'text/html; charset=utf-8';
    ctx.body = fs.readFileSync(path.join(STORAGE_DIR, PAGE_MAP[ctx.path]), 'utf-8');
  } else {
    ctx.redirect('/signin?redirect=' + ctx.path);
  }
}, { tag: 'dashboard-home', before: 'dataSource' });
```

鉴权方式（与看板首页相同）：
```javascript
async isAuthenticated(ctx) {
  if (ctx.state.currentUser) return true;
  // 从 Authorization header 获取 token
  let token = ctx.get('Authorization').startsWith('Bearer ') ? ... : '';
  // 或从 cookie 获取 token
  if (!token) token = ctx.cookies.get('nb_token');
  // 内部 HTTP 请求 /api/auth:check 验证 token
  ...
}
```

---

## 3. Nginx 路由配置

在 `nocobase.conf` 中，百宝箱路由通过 `/api/` 路径代理到 NocoBase 应用：

```nginx
# /api/ 路径 - 绕过 auth_request（包含 /api/__tb__、/api/__fp__、/api/__tp__）
# 这些路径由 plugin-dashboard-home 内部自行鉴权
location /api/ {
    proxy_pass http://app:80;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_pass_request_headers on;
    client_max_body_size 100M;
}
```

> `/api/` 路径绕过 nginx 层 auth_request，因为插件内部已经在 `/api/__tb__` 等路径上执行了鉴权检查。

---

## 4. 百宝箱页面逻辑 (`百宝箱.html`)

### 4.1 页面结构
- 标题：`百宝箱 - 贵州遵大数智化平台`
- 链接到两个子工具（`/api/__fp__`, `/api/__tp__`）
- 链接返回仪表盘（`/home`）

### 4.2 关键技术点
```html
<a href="/api/__fp__" class="btn btn-invoice" target="_blank">行程发票报销助手</a>
<a href="/api/__tp__" class="btn btn-print" target="_blank">智能排版打印助手</a>
<a href="/home" class="back">← 返回仪表盘</a>
```

### 4.3 访问链接
```
https://voadge.top:668/api/__tb__    → 百宝箱
https://voadge.top:668/api/__fp__    → 发票报销助手
https://voadge.top:668/api/__tp__    → 排版打印助手
```

---

## 5. 子工具页面技术要点

### 5.1 行程发票报销助手 (`行程发票报销助手.html`)
- **纯前端**：所有数据在浏览器本地处理，不上传服务器
- **PDF 解析**：使用 `pdf.js`，配置 CMap 以支持中文 CIDFont（12306 发票关键）
  ```javascript
  pdfjsLib.getDocument({
    data: arrayBuffer,
    cMapUrl: '/dashboard/lib/cmaps/',
    cMapPacked: true,
    standardFontDataUrl: '/dashboard/lib/standard_fonts/',
    useSystemFonts: true,
    disableFontFace: true  // 防止嵌入字体渲染失败
  })
  ```
- **文本提取**：坐标排序 + 自适应行高容差 → 结构化字段解析（乘车人、车站、车次、金额等）
- **排版引擎**：横版原样 + 竖版两两并排 + 单竖版旋转90°
- **导出**：排版 PDF（jsPDF）+ 报销单 Excel（SheetJS）

### 5.2 智能排版打印助手 (`智能排版打印助手.html`)
- **文件支持**：PDF / PNG / JPG / Word / Excel
- **封面功能**：Word/Excel/PDF 文件作为打印封面
- **拖拽排序**：HTML5 Drag & Drop 调整页面顺序
- **技术栈**：pdf.js + mammoth.js + SheetJS + jsPDF

---

## 6. 部署指南

### 6.1 部署百宝箱文件到服务器

使用 `scripts/deploy-dashboard-files.sh`：

```bash
# 在本地项目根目录执行
bash scripts/deploy-dashboard-files.sh

# 手动对应步骤：
scp -i <key> 百宝箱.html ubuntu@<server>:/opt/noco-base/dashboard/
scp -i <key> 行程发票报销助手.html ubuntu@<server>:/opt/noco-base/dashboard/
scp -i <key> 智能排版打印助手.html ubuntu@<server>:/opt/noco-base/dashboard/
```

### 6.2 确保插件服务端路由激活

需要确保 v2 插件 (`dist/server/index.js.server`) 部署并注册到数据库：

```bash
# 复制插件到服务器
scp -i <key> nocobase-plugin-dashboard-home/dist/server/index.js.server \
  ubuntu@<server>:/opt/noco-base/storage/plugins/@nocobase/plugin-dashboard-home/dist/server/index.js

# 注册插件
docker exec -e PGPASSWORD=nocobase123 <app-container> psql -h postgres -U nocobase -d nocobase <<'SQL'
DELETE FROM public."applicationPlugins" WHERE name = 'dashboard-home';
INSERT INTO public."applicationPlugins" (createdAt, updatedAt, name, packageName, version, enabled, installed, builtIn, options)
VALUES (NOW(), NOW(), 'dashboard-home', '@nocobase/plugin-dashboard-home', '1.0.0', true, true, false, '{}');
SQL

# 重启容器
docker restart <app-container>
```

### 6.3 验证部署

访问以下链接确认正常工作：
```
https://voadge.top:668/api/__tb__    → 应显示百宝箱导航页
https://voadge.top:668/api/__fp__    → 应显示发票报销助手
https://voadge.top:668/api/__tp__    → 应显示排版打印助手
```

---

## 7. 完整依赖关系

```
nginx-proxy (443) → app 容器 nginx (nocobase.conf)
  → /api/  → proxy_pass http://app:80 (NocoBase)
    → /api/auth:check               → 登录鉴权
    → /api/__tb__                   → plugin-dashboard-home 读取 百宝箱.html
    → /api/__fp__                   → plugin-dashboard-home 读取 行程发票报销助手.html
    → /api/__tp__                   → plugin-dashboard-home 读取 智能排版打印助手.html
  → /dashboard/lib/                 → alias 到 storage/dashboard/lib/ (静态资源)
```

所有子工具页面的 JS 库依赖:
```
/dashboard/lib/pdf.min.js          — PDF 解析
/dashboard/lib/pdf.worker.min.js   — PDF Worker
/dashboard/lib/jspdf.umd.min.js    — PDF 生成
/dashboard/lib/xlsx.full.min.js    — Excel 导出
/dashboard/lib/mammoth.browser.min.js — Word 解析
/dashboard/lib/tailwind.min.js     — CSS 样式
/dashboard/lib/cmaps/              — PDF 中文 CMap
/dashboard/lib/standard_fonts/     — PDF 标准字体
```
