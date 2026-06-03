# 看板模块化拆分 + 抽屉方案

## 环境实况

| 项目 | 实际值 | 确认方式 |
|---|---|---|
| 工作目录 | `C:\Users\tsong\WorkBuddy\Claw\` | 审计 |
| 目标文件 | `dashboard_audit.html`（1844 行单文件） | 审计 |
| 生产文件 | `dashboard_live.html`（1853 行） | 审计 |
| 本地版本控制 | 无 git | `ls -la` 确认 |
| 同源状态 | ✅ 同源（所有 API `/api/xxx` 相对路径 + `credentials:'include'`） | 代码确认 |
| token→cookie 桥接 | ✅ 已存在 L1746-L1754，`SameSite=Lax` | 代码确认 |
| `checkAdmin()` | ✅ 存在 L913 | 代码确认 |
| `renderWorks()` | ✅ 存在 L925（动态渲染工作区按钮） | 代码确认 |
| `EXTERN_URLS` | ✅ 存在 L777 | 代码确认 |
| `RP` 对象 | ✅ 存在 L784 | 代码确认 |
| 工作项字段 | 每个 item = `{ label, url }` | 代码确认 |
| 移动端检测 | 无 `_isMobile` JS 变量，纯 CSS @media 控制（768px / 480px） | 审计 |
| iframe SPA 路由追踪 | ❌ 外层 JS 无法感知 iframe 内 pushState 变化 | 审计 |
| 生产部署路径 | `/opt/noco-base/dashboard/`（插件 STORAGE_DIR）+ `/usr/share/nginx/html/dashboard/`（nginx 静态） | 部署脚本 + nginx.conf |
| 现有 iframe sandbox | `allow-scripts allow-forms allow-same-origin allow-popups`（L747）= 同源 cookie 已验证可行 | 代码确认 |

## 目标
1. 将 `dashboard_audit.html` 单文件拆分为模块化架构（框架壳 + 配置 + CSS + JS 独立文件）
2. 以 NocoBase 风格抽屉加载后台页面，避免整页跳转的 SPA 重载耗时
3. 保持现有全部功能不变（数据源轮播、考勤打卡、公告、百宝箱、工具按钮）

## 模块划分

```
C:\Users\tsong\WorkBuddy\Claw\
├── dashboard_audit.html              ← 框架壳（仅骨架 HTML + <link>/<script src> 引用）
│                                      约 80 行，除骨架外零业务代码
│
├── assets/                           ← 新建目录
│   ├── config.js                     ← 全部声明式配置
│   │                                   workSections, EXTERN_URLS, RP
│   │                                   约 100 行，变化最频繁
│   │
│   ├── core.css                      ← 框架样式（非考勤、非抽屉的全部 CSS）
│   │                                   布局/侧栏/主舞台/工作版块/页脚/响应式
│   │                                   约 420 行
│   │
│   ├── core.js                       ← 框架逻辑
│   │                                   L787-L831: 数据源轮播（doRoadPatrol/loadSource）
│   │                                   L912-L995: checkAdmin/renderWorks/fetchTodos
│   │                                   L1601-L1768: 全屏/zoom/wheelShim/lunar
│   │                                   weather/clock/token桥接/初始化调用序列
│   │                                   约 400 行
│   │
│   ├── attend.css                    ← 考勤打卡样式
│   │                                   覆盖层/抽屉/相机/指纹/验证条/请假区
│   │                                   约 120 行
│   │
│   ├── attend.js                     ← 考勤打卡全部逻辑（独立自洽模块）
│   │                                   L997-L1598: attend全局变量
│   │                                   openAttendModal/closeAttendModal
│   │                                   startCamera/stopCamera/capturePhoto
│   │                                   detectFace/verifyFingerprint
│   │                                   getLocation/submitAttendance
│   │                                   onAttendTypeChange/updateSubmitState
│   │                                   fetchAttendance/attendBtn事件监听
│   │                                   约 600 行
│   │
│   ├── drawer.css                    ← 抽屉覆盖层样式（新增）
│   │                                   覆盖层/面板/顶栏/动画/响应式
│   │                                   约 35 行
│   │
│   └── drawer.js                     ← 抽屉控制器（新增）
│                                       openDrawer/closeDrawer/ESC/遮罩关闭
│                                       约 30 行
│
└── dashboard_audit.html.bak          ← 原始文件备份
```

### 加载顺序（严格固定，不可改动）

```html
<link rel="stylesheet" href="assets/core.css">
<link rel="stylesheet" href="assets/drawer.css">
<link rel="stylesheet" href="assets/attend.css">

<script src="assets/config.js" defer></script>
<script src="assets/core.js" defer></script>
<script src="assets/attend.js" defer></script>
<script src="assets/drawer.js" defer></script>
```

### 框架壳（`dashboard_audit.html` 修改后）内容边界

**永远固定的部分：**
- 页面骨架 HTML（header / main-stage / side-panel / stage-frame-wrap / work-section / footer）
- 抽屉骨架 HTML（`.drawer-overlay > .drawer-panel > header + iframe`）
- 考勤弹窗骨架 HTML（`#attendOverlay`）
- 子弹窗骨架 HTML（`#fingerConfirmOverlay`）
- `<link>` 引用各 CSS
- `<script>` 引用各 JS

**什么情况才修改框架壳：**
- 新增/删除页面区域（如未来加概览数据条）
- 新增核心模块（加一行 `<script>` 引用）
- 修复布局 BUG

## 实施阶段

### 阶段 0：服务器隔离测试路径

在服务器同时创建 nginx 静态路径和 NocoBase 插件路径，与生产完全隔离。

```bash
# 服务器操作
ssh -i E:/voadge.pem ubuntu@110.42.236.231 "
  sudo mkdir -p /usr/share/nginx/html/dashboard-dev/assets
  sudo mkdir -p /opt/noco-base/dashboard-dev/assets
"
```

```nginx
# nginx 新增
location /dashboard-dev/ {
    root /usr/share/nginx/html;
    expires 5m;
    add_header Cache-Control "no-cache";
    access_log on;
    autoindex off;
}
```

```bash
# nginx 重载
ssh -i E:/voadge.pem ubuntu@110.42.236.231 "sudo nginx -s reload"
```

测试访问：`https://voadge.top:668/dashboard-dev/dashboard_audit.html`
生产访问：`https://voadge.top:668/dashboard/dashboard_audit.html`

**两个路径都需要部署文件：**
- `/usr/share/nginx/html/dashboard-dev/` — nginx 静态文件服务
- `/opt/noco-base/dashboard-dev/` — NocoBase 插件 STORAGE_DIR（后续如不需要插件功能可只部署第一个）

### 阶段 1：本地创建模块文件（零破坏）

1. 创建 `assets/` 目录
2. 按模块边界逐文件创建，每个文件从原文件相应位置复制代码。**原文件完整不动，期间 100% 可运行**

| 创建顺序 | 文件 | 从原文件提取的行范围 |
|---|---|---|
| 1 | `config.js` | L777-L784（EXTERN_URLS, RP）、L834-L910（workSections） |
| 2 | `core.css` | L8-L460（所有非考勤 CSS） |
| 3 | `core.js` | **L787-L831 + L912-L995 + L1601-L1768**（含 `let isAdmin` + 初始化调用序列） |
| 4 | `attend.css` | L462-L665 |
| 5 | `attend.js` | **L997-L1598**（含 `fetchAttendance` + `attendBtn` 监听器） |
| 6 | `drawer.css` | 新写 |
| 7 | `drawer.js` | 新写 |

### 阶段 2：修改框架壳

1. 备份：`cp dashboard_audit.html dashboard_audit.html.bak`
2. `<head>` 中 `<style>` 块 → `<link>` 引用
3. `</body>` 前 `<script>` 块 → `<script src>` 引用
4. 骨架 HTML 和弹窗 HTML 保留不动
5. 新增抽屉 HTML 结构

### 阶段 3：本地验证

先安装 http-server（如未安装）：
```bash
npm install -g http-server
```

启动本地 HTTP 服务：
```bash
cd C:\Users\tsong\WorkBuddy\Claw
http-server . -p 8080 -c-1
```

浏览器打开 `http://localhost:8080/dashboard_audit.html`

**本地验证限制（请注意）：**
| 可验证 ✅ | 不可验证 ❌ |
|---|---|
| 页面布局渲染 | API 调用（fetch('/api/xxx') 会 404） |
| CSS 加载一致 | 考勤打卡功能 |
| 控制台无 404/语法错误 | 数据源轮播（依赖 NocoBase 后端） |
| JS 文件加载顺序正确 | 抽屉内 NocoBase 页面加载 |
| 抽屉 HTML/CSS 结构 | 权限/登录状态 |
| 移动端响应式 | — |

**完整功能验证必须在 staging（阶段 4-5）进行。**

### 阶段 4：staging 部署

将文件上传到服务器 staging 路径，验证功能完整性。

### 阶段 5：staging 验证清单

| # | 验证项 | 预期 |
|---|---|---|
| 1 | 框架壳加载 | 布局/字体/颜色与生产一致 |
| 2 | 侧栏时钟/信息轮播 | 正常显示 |
| 3 | 数据源轮播 ◀▶ | 切换正常 |
| 4 | 工作区渲染 | 7 个分组正确，按钮齐全 |
| 5 | 考勤弹窗打开 | 样式/布局正确 |
| 6 | 公告轮播 | 滚动正常 |
| 7 | 管理后台链接 | `/admin/xxx` 新标签打开 |
| 8 | 百宝箱链接 | `/dashboard/百宝箱.html` 跳转 |
| 9 | 抽屉打开/关闭 | 动画正常，iframe 加载后台 |
| 10 | 移动端 @media | 768px/480px 断点正常 |
| 11 | 控制台无报错 | 无 404/JS error |
| 12 | **JS 语法验证** | 所有 JS 文件在浏览器控制台无语法错误 |

### 阶段 6：切到生产

从 staging 复制到生产路径，保留备份。

### 阶段 7：权限穿透验证

**管理员验证（正常登录）：**
1. 看板显示"G 系统管理"分组（`adminOnly: true`）
2. 点击任意工作区链接 → 抽屉中 NocoBase 菜单显示全部

**普通用户验证（无痕窗口）：**
1. 登录普通账号 → 看板无"G 系统管理"
2. 点击工作区链接 → 抽屉中只显示授权菜单
3. 直接访问 `/admin/w1l9qyr5ro4` → 服务端 403

### 阶段 8：同步到 `dashboard_live.html`

将 `dashboard_audit.html` 改动复制到 `dashboard_live.html`，部署到生产服务器。

## 抽屉实现细节

### drawer.css
```css
.drawer-overlay {
  display: none; position: fixed; inset: 0; z-index: 9000;
  background: rgba(0,0,0,0.45); backdrop-filter: blur(4px);
}
.drawer-overlay.show { display: block; }
.drawer-panel {
  position: fixed; right: 0; top: 0; height: 100%;
  width: min(85vw, 1200px); max-width: 100vw;
  background: linear-gradient(160deg, #111827 0%, #1a2332 100%);
  border-left: 1px solid rgba(255,255,255,0.08);
  transform: translateX(100%);
  transition: transform 0.3s cubic-bezier(0.23, 1, 0.32, 1);
  display: flex; flex-direction: column;
}
.drawer-overlay.show .drawer-panel { transform: translateX(0); }
.drawer-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 16px; border-bottom: 1px solid rgba(255,255,255,0.08);
  flex-shrink: 0;
}
.drawer-title { color: #e0e6ed; font-size: 0.95em; font-weight: 600; }
.drawer-actions { display: flex; gap: 8px; }
.drawer-btn, .drawer-close {
  background: none; border: none; color: #aab; cursor: pointer;
  font-size: 1.1em; padding: 4px 8px; border-radius: 4px; font-family: inherit;
  transition: all 0.15s;
}
.drawer-btn:hover, .drawer-close:hover { color: #00d4ff; background: rgba(255,255,255,0.06); }
.drawer-body { flex: 1; min-height: 0; }
.drawer-body iframe { width: 100%; height: 100%; border: none; display: block; }
@media (max-width: 480px) {
  .drawer-panel { width: 100vw; border-left: none; }
}
```

### drawer.js
```js
// === 抽屉控制器 ===
var _drawerOpen = false;

function openDrawer(url, title) {
  if (window.innerWidth < 480) { window.open(url, '_blank'); return; }
  document.getElementById('adminFrame').src = url;
  document.getElementById('drawerTitle').textContent = title;
  document.getElementById('adminDrawer').classList.add('show');
  _drawerOpen = true;
}

function closeDrawer() {
  document.getElementById('adminDrawer').classList.remove('show');
  setTimeout(function() { document.getElementById('adminFrame').src = ''; }, 300);
  _drawerOpen = false;
}

function openDrawerNewTab() {
  var frame = document.getElementById('adminFrame');
  if (frame.src) window.open(frame.src, '_blank');
}

document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape' && _drawerOpen) closeDrawer();
});

document.getElementById('adminDrawer').addEventListener('click', function(e) {
  if (e.target === this) closeDrawer();
});
```

### drawer HTML（插入 `</body>` 前）
```html
<div class="drawer-overlay" id="adminDrawer">
  <div class="drawer-panel" id="drawerPanel">
    <div class="drawer-header">
      <span class="drawer-title" id="drawerTitle"></span>
      <div class="drawer-actions">
        <button class="drawer-btn" onclick="openDrawerNewTab()" title="新标签打开">↗</button>
        <button class="drawer-close" onclick="closeDrawer()">✕</button>
      </div>
    </div>
    <div class="drawer-body">
      <iframe id="adminFrame" sandbox="allow-scripts allow-forms allow-same-origin allow-popups"></iframe>
    </div>
  </div>
</div>
```

注意：sandbox 使用 `allow-popups`，与现有 `externFrame`（L747）配置一致。同源 + `SameSite=Lax` 已验证可正常携带 cookie。

### 工作区链接改造

`renderWorks()` 内（L937-942），保留所有现有行，只改两处：

```js
// 原来
a.href = item.url;
// 改为
a.href = 'javascript:void(0)';
a.onclick = function() { openDrawer(item.url, item.label); };
```

**保留 `a.style.cssText` 行不动，样式不受影响。**

## 回滚方案

**注意：回滚命令使用 `ssh` 而非 `scp`，scp 不支持执行远程命令。**

```bash
# 快速回滚（文件级）
ssh -i E:/voadge.pem ubuntu@110.42.236.231 "sudo cp /opt/noco-base/dashboard-prod-bak/dashboard_audit.html /opt/noco-base/dashboard/ && sudo rm -rf /opt/noco-base/dashboard/assets"
ssh -i E:/voadge.pem ubuntu@110.42.236.231 "sudo cp /usr/share/nginx/html/dashboard-prod-bak/dashboard_audit.html /usr/share/nginx/html/dashboard/ && sudo rm -rf /usr/share/nginx/html/dashboard/assets"

# 完全回滚
ssh -i E:/voadge.pem ubuntu@110.42.236.231 "sudo rm -rf /opt/noco-base/dashboard && sudo cp -r /opt/noco-base/dashboard-prod-bak /opt/noco-base/dashboard"
ssh -i E:/voadge.pem ubuntu@110.42.236.231 "sudo rm -rf /usr/share/nginx/html/dashboard && sudo cp -r /usr/share/nginx/html/dashboard-prod-bak /usr/share/nginx/html/dashboard"
```

本地回滚：`copy dashboard_audit.html.bak dashboard_audit.html` + 删除 `assets/` 目录。

## 与现有功能的关系

| 现有功能 | 影响 | 处理方式 |
|---|---|---|
| stage-toolbar 数据源轮播 | 无影响 | 抽屉为独立覆盖层，不同 z-index |
| externFrame 大屏 | 无影响 | 完全独立运行 |
| 百宝箱 + 工具按钮 | 无影响 | 保持 `/dashboard/xxx.html` 静态路由 |
| 考勤打卡弹窗 | 无影响 | 不同 z-index，各自独立 |
| 公告/时钟/待办 | 无影响 | 侧栏持续运行 |
| 工作区链接 | **改变行为** | 点击 → 抽屉弹出，不再整页跳转 |
| Footer 管理后台 | 保持不变 | 仍可新标签进入后台 |

## 数据与操作一致性
- **同源**：所有 API 使用 `/api/xxx` 相对路径 + `credentials: 'include'`，iframe 内自动携带
- **NocoBase 内部 SPA 跳转**：iframe 内 pushState 正常工作
- **NocoBase 内部弹窗/抽屉**：iframe 内原生工作
- **权限**：服务端 ACL 原生穿透，与直接访问一致
- **唯一边界**：极少插件触发 `window.top.location.href` → ↗ 新标签兜底
- **取消多层抽屉栈**：iframe 内 SPA 路由无法被外层追踪，改用简单开/关

## 开发、修改、部署分工

```
本地 C:\Users\tsong\WorkBuddy\Claw\
├── dashboard_audit.html          ← 开发版本（所有改动在此进行）
├── dashboard_audit.html.bak      ← 手动备份
├── dashboard_live.html           ← 生产镜像（测试通过后同步）
└── assets/*                      ← 模块文件（与 dashboard_audit.html 配合使用）

部署目标（服务器）：
  /opt/noco-base/dashboard/       ← NocoBase 插件 STORAGE_DIR
  /usr/share/nginx/html/dashboard/  ← nginx 静态路径

部署方式：
  scp dashboard_audit.html + assets/ → 上述两个路径
  或通过 scripts/deploy-dashboard-files.sh（需调整）
```

---

## 实施控制步骤

以下为**逐阶段控制表**，每个阶段完成后需用户确认才能进入下一步。你可随时在此表中标记状态，遇到问题时回到前一个阶段。

### 控制总表

| # | 阶段 | 操作内容 | 预计耗时 | 前置条件 | 完成标记 | 回滚方式 |
|---|---|---|---|---|---|---|
| 0 | 服务器建 staging 路径 | 创建 nginx location + 目录 | 10min | nginx 访问权限 | ☐ | `rm -rf /usr/share/nginx/html/dashboard-dev/` |
| 1 | 本地创建模块文件 | 从原文件提取 7 个模块文件 | 60min | 无 | ☐ | 删除 assets/ 目录即可 |
| 2 | 修改框架壳 | 替换内联引用为外部引用 + 抽屉 HTML | 20min | 阶段 1 完成 | ☐ | `copy .bak` 恢复原文件 |
| 3 | 本地验证 | http-server 检查骨架/加载无报错 | 15min | 阶段 2 完成 | ☐ | 回到阶段 1 |
| 4 | 部署 staging | scp 文件到服务器两个 staging 路径 | 15min | 阶段 3 通过 | ☐ | `rm -rf /dashboard-dev/` |
| 5 | staging 验证 | 14 项功能完整验证 | 30min | 阶段 4 完成 | ☐ | 回到阶段 1/2/3 |
| 6 | 切到生产 | 备份生产 → cp staging → 生产 | 15min | 阶段 5 全部通过 | ☐ | 备份回滚（见回滚方案） |
| 7 | 生产验证 | 与 staging 同样的 14 项验证 | 30min | 阶段 6 完成 | ☐ | 见回滚方案 |
| 8 | 同步 live 文件 | 同步到 dashboard_live.html | 5min | 阶段 7 通过 | ☐ | 保留原 bak |

### 各阶段可介入点

- **阶段 0-1 之间** → 可检查 staging 路径是否正确
- **阶段 1-2 之间** → 可逐个审核模块文件内容是否完整
- **阶段 2-3 之间** → 可在本地浏览器预览白盒
- **阶段 3-4 之间** → 确认是否延后部署
- **阶段 4-5 之间** → 可提前登录服务器查看文件结构
- **阶段 5-6 之间** → 重点决策点：是否上线
- **阶段 6-7 之间** → 若上线后出问题，立即执行回滚
- **阶段 7-8 之间** → 验证无误后同步到 live 文件

### 阶段 5 / 7 详细验证清单（可逐项勾选）

| # | 验证项 | 预期 | 阶段 5 (staging) | 阶段 7 (生产) |
|---|---|---|---|---|
| 1 | 框架壳加载 | 布局/字体/颜色与生产一致 | ☐ | ☐ |
| 2 | 侧栏时钟/信息轮播 | 正常显示 | ☐ | ☐ |
| 3 | 数据源轮播 ◀▶ | 切换正常 | ☐ | ☐ |
| 4 | 工作区渲染 | 7 个分组正确，按钮齐全 | ☐ | ☐ |
| 5 | 考勤弹窗打开 | 样式/布局/功能正确 | ☐ | ☐ |
| 6 | 公告轮播 | 滚动动画正常 | ☐ | ☐ |
| 7 | 管理后台链接 | `/admin/xxx` 新标签打开 | ☐ | ☐ |
| 8 | 百宝箱链接 | `/dashboard/百宝箱.html` 跳转 | ☐ | ☐ |
| 9 | 抽屉打开/关闭 | 动画正常，iframe 加载后台 | ☐ | ☐ |
| 10 | 移动端 @media | 768px/480px 断点正常 | ☐ | ☐ |
| 11 | 控制台无报错 | 无 404/JS error | ☐ | ☐ |
| 12 | 权限穿透（管理） | 管理员看到全部菜单 | ☐ | ☐ |
| 13 | 权限穿透（普通） | 普通用户看不到系统管理 | ☐ | ☐ |
| 14 | ↗ 新标签兜底 | 点击 ↗ 新标签打开当前页面 | ☐ | ☐ |

### 快速回滚触发条件

| 触发条件 | 操作 |
|---|---|
| 阶段 3 本地验证失败 | 停止，排查模块文件内容是否正确 |
| 阶段 5 staging 核心功能异常 | 停止，回到阶段 1 修正 |
| 阶段 7 生产验证核心功能异常 | **立即执行回滚**（见回滚方案）|
| 非核心功能异常（如抽屉动画不流畅） | 可先上线，后续优化 |
