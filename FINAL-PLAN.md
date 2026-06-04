# 实施计划 - 看板重构最终方案（已部署）

## 整体思路

- **桌面端**（≥768px）：Hybrid 模式 — 看板（header logo + 圆形按钮 + 居右偏移标题 + 左侧面板 + 大屏 + 右侧公告）+ 工作区（pushState 抽屉 iframe）+ 新标签 NocoBase 入口
- **移动端**（<768px）：简化 2 列 grid — 大屏全宽 + 侧面板 3 行（时间/待办 / 公告跨行 + 三独立按钮卡片）

---

## 最终实现总结

### 桌面端布局

```
┌──────────┬──────────────────────────────┬──────────┐
│   logo   │   贵州遵大数智化平台           │  开始   │
│  (60×60) │   以道树业 致诚德信            │  工作   │
│ 下移40px │  右移40px 字号2.5em            │  圆形60×60
│          │                               │  下移40px
├──────────┴──────────────────────────────┴──────────┤
│                大屏(stage-frame-wrap)               │
├──────────┬─────────────────────────────────────────┤
│ 时间/待办 │          工作区按钮网格                    │
│ 公告/打卡 │                                         │
├──────────┴─────────────────────────────────────────┤
│   v2.1.0-beta.42 (自动同步NocoBase版本)              │
└─────────────────────────────────────────────────────┘
```

### 移动端布局

```
┌──────────────────────┐
│       标题(缩小)      │
├──────────────────────┤
│      大屏(260px)      │
├──────────┬───────────┤
│   时间    │   待办     │
├──────────┼───────────┤
│          │  📌 打卡   │
│   公告    │  🔧 开始工作│
│   (跨行)  │  🧰 百宝箱  │
├──────────┴───────────┤
│  ▶ 工作版块 (默认收起) │
└──────────────────────┘
```

---

## 文件清单

### `dashboard/index.html` 主要改动

| # | 改动 | 说明 |
|---|------|------|
| 1 | CSS header grid | 改为 flex 三栏：logo(20%) / title(flex:1) / header-right(20%) |
| 2 | logo & btn 下移 | 桌面端 `margin-top: 40px`，靠近下方面板 |
| 3 | 标题右移 | `title-container padding-left: 80px`（居中模式有效 40px） |
| 4 | 标题字号 | 桌面 `h1: 2.5em l-s:7.2px` / `subtitle: 1.05em l-s:4.8px` |
| 5 | 圆形按钮 | 桌面 enter-btn 60×60 圆形，2×2 grid 四字"开/始/工/作"；hover 各字 scale 0.8→1.2 |
| 6 | 按钮右移 | `margin-left: 80px` |
| 7 | 主舞台间距 | `.main-stage margin-top: 0.75em`（原 2em） |
| 8 | 移动端 2 列 grid | 公告跨行 `grid-row: 2/5`，三个按钮独立卡片竖向排列 |
| 9 | 移动端工作区 | 默认折叠（`display: none`），标题栏可切换 |
| 10 | 版本号动态 | `fetchNbVersion()` 从 `/dashboard/nb-version.json` 获取 |
| 11 | footer | 隐藏 `footer-attend`/`footer-enter`/`footer-toolbox` |

### `nginx.conf` 改动

| # | 改动 | 说明 |
|---|------|------|
| 1 | 移动端返回按钮 | sub_filter 注入 `#nb-back-btn`，<768px 显示 |
| 2 | auth-check sub_filter | 注入 token cookie 同步脚本 |

### 新增：`/usr/local/bin/nb-version.sh`

每天凌晨 0:00 从 NocoBase 容器提取版本号，写入 `/opt/noco-base/dashboard/nb-version.json`。

---

## 部署步骤

```bash
# Step 1 — 部署 dashboard
scp -i E:/voadge.pem dashboard/index.html ubuntu@110.42.236.231:/opt/noco-base/dashboard/index.html

# Step 2 — 部署 nginx 配置
scp -i E:/voadge.pem nginx.conf ubuntu@110.42.236.231:/opt/noco-base/nginx.conf

# Step 3 — 验证并重载 nginx
ssh -i E:/voadge.pem ubuntu@110.42.236.231 "docker exec noco-base-nginx-proxy-1 nginx -t && docker exec noco-base-nginx-proxy-1 nginx -s reload"

# Step 4 — 初始化版本号文件
ssh -i E:/voadge.pem ubuntu@110.42.236.231 "sudo /usr/local/bin/nb-version.sh"

# Step 5 — 设置 cron（首次）
ssh -i E:/voadge.pem ubuntu@110.42.236.231 "sudo crontab -l; echo '0 0 * * * /usr/local/bin/nb-version.sh' | sudo crontab -"
```

### 紧急回滚

```bash
# 回滚 dashboard（使用实际备份文件名）
ssh -i E:/voadge.pem ubuntu@110.42.236.231 \
  "sudo cp /opt/noco-base/dashboard/index.html.bak.* \
           /opt/noco-base/dashboard/index.html"

# 回滚 nginx 配置
ssh -i E:/voadge.pem ubuntu@110.42.236.231 \
  "sudo cp /opt/noco-base/nginx.conf.bak.* /opt/noco-base/nginx.conf && \
   docker exec noco-base-nginx-proxy-1 nginx -s reload"
```

---

## 验证清单

### 桌面端（≥768px）

- [ ] Header：logo(左) / 标题(中右移40px) / 圆形按钮(右下移40px)
- [ ] 圆形按钮 hover：四字从 0.8 放大至 1.2
- [ ] 点击按钮 → 新标签打开 NOCOBASE_HOME
- [ ] 工作区按钮 → 抽屉滑出 iframe NocoBase
- [ ] 抽屉内 pushState 页面切换
- [ ] 底部版本号显示 NocoBase 实际版本

### 移动端（<768px）

- [ ] 2 列 grid：时间+待办 / 公告跨行+三按钮竖向
- [ ] 公告与三个按钮卡片等高
- [ ] 工作区默认折叠
- [ ] `nb-back-btn` 浮动返回按钮

### 边界情况

- [ ] 窗口 resize 桌面↔移动端切换
- [ ] nginx sub_filter 语法检查通过
- [ ] 版本号 cron 每天凌晨自动更新

---

## 环境信息

| 项目 | 值 |
|------|-----|
| 服务器 | 110.42.236.231 |
| NocoBase | `nocobase/nocobase:beta-full` `v2.1.0-beta.42` |
| 看板 URL | `https://voadge.top:668/` → `/dashboard/` |
| nginx | Docker `noco-base-nginx-proxy-1` |
| 备份目录 | `/opt/noco-base/dashboard/*.bak.*` |
| Git HEAD | `b900113`（未提交变更在 working tree） |
