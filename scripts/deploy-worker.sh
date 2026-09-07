#!/bin/bash
set -e

SSH_KEY="E:/voadge.pem"
SERVER="ubuntu@110.42.236.231"
REMOTE_DIR="/opt/noco-base"

echo "部署简报工作器到服务器..."

# 创建远程脚本
ssh -i "$SSH_KEY" "$SERVER" "mkdir -p $REMOTE_DIR/worker"

# 复制 worker 脚本
scp -i "$SSH_KEY" "$(dirname "$0")/briefing-worker.js" "$SERVER:$REMOTE_DIR/worker/"

# 创建 systemd 服务
ssh -i "$SSH_KEY" "$SERVER" "sudo tee /etc/systemd/system/nocobase-briefing-worker.service > /dev/null" << 'SERVICE'
[Unit]
Description=NocoBase Briefing Worker
After=network.target docker.service
Requires=docker.service

[Service]
Type=simple
ExecStart=/usr/bin/node /opt/noco-base/worker/briefing-worker.js
Restart=always
RestartSec=10
Environment=NOCOBASE_BASE=http://localhost:80
Environment=NOCOBASE_EMAIL=admin@nocobase.com
Environment=NOCOBASE_PASSWORD=admin123
WorkingDirectory=/opt/noco-base/worker
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
SERVICE

# 启动服务
ssh -i "$SSH_KEY" "$SERVER" "sudo systemctl daemon-reload && sudo systemctl enable nocobase-briefing-worker && sudo systemctl restart nocobase-briefing-worker"

echo "部署完成！"
echo "查看日志: ssh -i $SSH_KEY $SERVER 'sudo journalctl -u nocobase-briefing-worker -f'"
