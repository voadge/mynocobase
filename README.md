# NocoBase 项目

云服务器 NocoBase 的本地配置仓库。

## 目录结构

```
my-project/
├── docker-compose.yml    # Docker 服务配置
├── env/                  # 环境变量（敏感信息）
│   ├── app.env          # 应用配置
│   └── postgres.env     # 数据库配置
├── nginx.conf           # Nginx 反向代理配置
├── scripts/             # 脚本文件
│   ├── deploy.sh        # 部署脚本
│   ├── backup.sh        # 服务器备份脚本
│   ├── backup-from-cloud.sh  # 云端备份到本地
│   ├── restore-to-cloud.sh   # 本地恢复到云端
│   ├── backup.bat       # Windows 备份批处理
│   └── restore.bat      # Windows 恢复批处理
├── backups/             # 本地备份目录
├── CONFIG.md            # 配置信息文档
└── .gitignore           # Git 忽略规则
```

## 快速操作

### 部署配置到服务器

```bash
# 使用部署脚本
bash scripts/deploy.sh

# 或手动部署
scp -i voadge.pem docker-compose.yml ubuntu@110.42.236.231:/opt/noco-base/
ssh -i voadge.pem ubuntu@110.42.236.231 "cd /opt/noco-base && docker compose restart"
```

### 云端数据备份到本地

```bash
# Linux/Mac
bash scripts/backup-from-cloud.sh

# Windows (双击运行)
scripts\backup.bat
```

**功能：**
- 在服务器上执行数据库备份
- 下载备份文件到本地 `backups/` 目录
- 下载配置文件到本地

### 本地数据恢复到云端

```bash
# Linux/Mac
bash scripts/restore-to-cloud.sh [备份文件名]

# Windows (双击运行)
scripts\restore.bat [备份文件名]
```

**功能：**
- 列出可用的备份文件
- 上传备份文件到服务器
- 恢复数据库
- 重启 NocoBase 服务

## 服务器信息

- **服务器 IP:** 110.42.236.231
- **SSH 用户:** ubuntu
- **NocoBase 地址:** https://voadge.top:668
- **SSH 密钥:** voadge.pem

## Git 操作

```bash
# 提交修改
git add .
git commit -m "描述"
git push

# 拉取更新
git pull
```

## 注意事项

- `env/` 目录包含敏感信息，已被 `.gitignore` 忽略
- 证书文件（`ssl/`、`acme-challenge/`）不提交到 Git
- `storage/` 目录包含用户数据，不提交到 Git
- 备份文件保存在本地 `backups/` 目录和服务器 `/opt/noco-base/backups/` 目录
- 详细配置信息请查看 `CONFIG.md`
