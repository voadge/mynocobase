# NocoBase 配置信息

## 云服务器

| 项目 | 值 |
|------|-----|
| **IP 地址** | 110.42.236.231 |
| **SSH 端口** | 22 |
| **SSH 用户** | ubuntu |
| **SSH 密钥** | `E:\voadge.pem` 或 `E:\腾讯云服务器密钥\voadge.pem` |
| **SSH 连接** | `ssh -i E:\voadge.pem ubuntu@110.42.236.231` |

## NocoBase 服务

| 项目 | 值 |
|------|-----|
| **访问地址** | https://voadge.top:668 |
| **HTTP 重定向** | http://voadge.top → https://voadge.top:668 |
| **MCP 端点** | https://voadge.top:668/api/mcp |
| **部署目录** | `/opt/noco-base` |
| **Docker Compose** | `/opt/noco-base/docker-compose.yml` |

## 数据库配置

| 项目 | 值 |
|------|-----|
| **数据库类型** | PostgreSQL 16 |
| **数据库名** | nocobase |
| **用户名** | nocobase |
| **密码** | nocobase123 |
| **端口** | 5432 (容器内) |
| **Redis 密码** | nocobase123 |

## Git 仓库

| 项目 | 值 |
|------|-----|
| **GitHub 仓库** | https://github.com/voadge/mynocobase |
| **本地仓库** | `E:\my-project` |
| **服务器仓库** | `/opt/noco-base` |
| **分支** | master |
| **Git 用户名** | voadge |
| **Git 邮箱** | tsongly@petalmail.com |

## SSH 密钥

### 本地电脑
| 项目 | 值 |
|------|-----|
| **公钥** | `~/.ssh/id_ed25519.pub` |
| **私钥** | `~/.ssh/id_ed25519` |
| **指纹** | SHA256:yDQdigyClTeYN4jF/C9MaaHmmaKGWJopAX2ci1fXUG4 |
| **GitHub 名称** | my-laptop |

### 云服务器
| 项目 | 值 |
|------|-----|
| **公钥** | `/home/ubuntu/.ssh/id_ed25519.pub` |
| **私钥** | `/home/ubuntu/.ssh/id_ed25519` |
| **指纹** | SHA256:SddMryj24lW5Oj3qegG26nHmQzKbHHw2TWomD1Fwr6Q |
| **GitHub 名称** | cloud-server |

## Docker 服务

| 服务 | 镜像 | 端口 |
|------|------|------|
| **app** | nocobase/nocobase:beta-full | 80 (容器内) |
| **postgres** | postgres:16 | 5432 (容器内) |
| **redis** | redis:7-alpine | 6379 (容器内) |
| **nginx-proxy** | nginx:alpine | 80, 668 |

## 常用命令

### 本地操作
```bash
# 进入项目目录
cd E:\my-project

# 查看状态
git status

# 提交修改
git add .
git commit -m "描述"
git push
```

### 服务器操作
```bash
# SSH 连接
ssh -i E:\voadge.pem ubuntu@110.42.236.231

# 进入项目目录
cd /opt/noco-base

# 拉取更新
git pull

# 查看服务状态
docker compose ps

# 重启服务
docker compose restart

# 查看日志
docker compose logs -f app
```

### 部署脚本
```bash
# 本地执行部署
cd E:\my-project
bash scripts/deploy.sh
```

## 备份信息

| 项目 | 值 |
|------|-----|
| **备份脚本** | `/opt/noco-base/backup.sh` |
| **备份目录** | `/opt/noco-base/backups/` |
| **数据库备份** | `backup_YYYYMMDD_HHMMSS.sql` |
| **NocoBase 备份** | `nocobase_backup_YYYYMMDD_HHMMSS.sql.gz` |

## 环境变量文件

### app.env
```
APP_KEY=e7f1a9b3c4d5e6f7a8b9c0d1e2f3a4b5
DB_DIALECT=postgres
DB_HOST=postgres
DB_PORT=5432
DB_DATABASE=nocobase
DB_USER=nocobase
DB_PASSWORD=nocobase123
REDIS_URL=redis://:nocobase123@redis:6379/0
TZ=Asia/Shanghai
```

### postgres.env
```
POSTGRES_DB=nocobase
POSTGRES_USER=nocobase
POSTGRES_PASSWORD=nocobase123
```

## 网络配置

### 域名
- 主域名: voadge.top
- www 域名: www.voadge.top

### SSL 证书
- 证书目录: `/opt/noco-base/ssl/`
- 证书文件: `fullchain.crt`
- 私钥文件: `voadge.top.key`

## 注意事项

1. **敏感信息**: `env/` 目录和 `ssl/` 目录已被 `.gitignore` 忽略，不会提交到 Git
2. **数据目录**: `storage/` 目录包含用户数据，不提交到 Git
3. **备份**: 定期执行 `backup.sh` 进行备份
4. **安全**: SSH 密钥和数据库密码请妥善保管

---

*最后更新: 2026-05-30*
