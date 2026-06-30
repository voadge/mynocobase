# NocoBase 升级指南 (print-template 插件)

## 问题背景

每次升级 NocoBase 时，以下内容可能会丢失：
1. `docker-compose.yml` 中的 volume mount
2. `nginx.conf` 中的路由规则
3. 数据库中的插件注册记录

## 升级步骤

### 1. 备份当前配置

```bash
cd /opt/noco-base
cp docker-compose.yml docker-compose.yml.bak
cp nginx.conf nginx.conf.bak
```

### 2. 升级 NocoBase

```bash
# 拉取新镜像
docker compose pull app

# 重启容器
docker compose up -d app
```

### 3. 运行恢复脚本

```bash
cd /opt/noco-base
bash setup-print-template.sh
```

脚本会自动：
- ✅ 检查并修复 `docker-compose.yml` 中的 volume mount
- ✅ 检查并修复 `nginx.conf` 中的路由规则
- ✅ 检查并注册 print-template 插件到数据库
- ✅ 验证 nginx 配置
- ✅ 重启必要的服务
- ✅ 验证插件功能

### 4. 验证

```bash
# 检查插件 API
curl -sk https://voadge.top:668/api/print_templates:list

# 应返回 401 (需要认证) 或 200 (成功)
```

## 文件位置

| 文件 | 位置 | 说明 |
|------|------|------|
| 恢复脚本 | `/opt/noco-base/setup-print-template.sh` | 升级后运行 |
| nginx 配置 | `/opt/noco-base/nginx.conf` | host bind-mount，持久化 |
| docker-compose | `/opt/noco-base/docker-compose.yml` | host bind-mount，持久化 |
| 插件目录 | `/opt/noco-base/nocobase-plugin-print-template/` | host bind-mount，持久化 |
| 插件 HTML | `/opt/noco-base/storage/print-template/` | storage volume，持久化 |

## 常见问题

### Q: 插件 API 返回 404

```bash
# 检查插件是否加载
docker logs noco-base-app-1 2>&1 | grep -i "print"

# 如果看到 "Cannot find plugin"，运行恢复脚本
bash setup-print-template.sh
```

### Q: nginx 返回 404

```bash
# 检查 nginx 配置
docker exec noco-base-nginx-proxy-1 nginx -t

# 如果配置错误，运行恢复脚本
bash setup-print-template.sh
```

### Q: 页面显示空白

```bash
# 检查插件目录
ls -la /opt/noco-base/nocobase-plugin-print-template/dist/server/index.js

# 如果文件不存在，重新编译
docker exec noco-base-app-1 bash -c "cd /app/nocobase/node_modules/@nocobase/plugin-print-template && node node_modules/typescript/bin/tsc -p tsconfig.json"
```

## 自动化升级

创建 `/opt/noco-base/upgrade.sh`:

```bash
#!/bin/bash
cd /opt/noco-base

# 备份
cp docker-compose.yml docker-compose.yml.bak
cp nginx.conf nginx.conf.bak

# 升级
docker compose pull app
docker compose up -d app

# 恢复插件
sleep 10
bash setup-print-template.sh
```

运行: `bash upgrade.sh`
