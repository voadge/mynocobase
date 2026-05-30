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
├── scripts/             # 部署脚本
│   └── deploy.sh        # 手动部署脚本
└── .gitignore           # Git 忽略规则
```

## 快速部署

```bash
# 方法一：使用部署脚本
bash scripts/deploy.sh

# 方法二：手动部署
scp -i voadge.pem docker-compose.yml ubuntu@110.42.236.231:/opt/noco-base/
ssh -i voadge.pem ubuntu@110.42.236.231 "cd /opt/noco-base && docker compose restart"
```

## 服务器信息

- **服务器 IP:** 110.42.236.231
- **SSH 用户:** ubuntu
- **NocoBase 地址:** https://voadge.top:668
- **SSH 密钥:** voadge.pem

## 注意事项

- `env/` 目录包含敏感信息，已被 `.gitignore` 忽略
- 证书文件（`ssl/`、`acme-challenge/`）不提交到 Git
- `storage/` 目录包含用户数据，不提交到 Git
