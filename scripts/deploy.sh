#!/bin/bash
# NocoBase 部署脚本
# 使用方法: ./deploy.sh [服务器地址]

SERVER=${1:-"ubuntu@110.42.236.231"}
SSH_KEY="E:/voadge.pem"
REMOTE_DIR="/opt/noco-base"

echo "=== NocoBase 部署脚本 ==="
echo "目标服务器: $SERVER"
echo ""

# 1. 推送配置文件到服务器
echo "1. 推送配置文件..."
scp -i "$SSH_KEY" docker-compose.yml "$SERVER:$REMOTE_DIR/"
scp -i "$SSH_KEY" env/*.env "$SERVER:$REMOTE_DIR/env/"
scp -i "$SSH_KEY" nginx.conf "$SERVER:$REMOTE_DIR/"

# 2. SSH 到服务器执行部署
echo "2. 重启服务..."
ssh -i "$SSH_KEY" "$SERVER" << 'EOF'
cd /opt/noco-base
docker compose down
docker compose up -d
echo "=== 部署完成 ==="
docker compose ps
EOF

echo ""
echo "部署完成！访问 https://voadge.top:668"
