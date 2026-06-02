#!/bin/bash
# ============================================================
# Deploy dashboard HTML files (百宝箱 + 两个助手) to NocoBase server
# 在本地项目根目录执行: bash scripts/deploy-dashboard-files.sh
# ============================================================
set -e

SERVER="${1:-ubuntu@110.42.236.231}"
SSH_KEY="E:/voadge.pem"
REMOTE_DIR="/opt/noco-base/dashboard"

echo "=== Deploy dashboard files to server ==="
echo "Target: ${SERVER}:${REMOTE_DIR}"

# Deploy baibaoxiang page
echo "1. Deploying 百宝箱.html..."
scp -i "${SSH_KEY}" 百宝箱.html "${SERVER}:${REMOTE_DIR}/"

# Deploy the two assistant files
echo "2. Deploying 行程发票报销助手.html..."
scp -i "${SSH_KEY}" 行程发票报销助手.html "${SERVER}:${REMOTE_DIR}/"

echo "3. Deploying 智能排版打印助手.html..."
scp -i "${SSH_KEY}" 智能排版打印助手.html "${SERVER}:${REMOTE_DIR}/"

# Verify
echo "4. Verifying deployment..."
ssh -i "${SSH_KEY}" "${SERVER}" "ls -la ${REMOTE_DIR}/"

echo ""
echo "=== Deployment Complete ==="
echo ""
echo "Access URLs:"
echo "  百宝箱:       https://voadge.top:668/api/__tb__"
echo "  发票报销助手: https://voadge.top:668/api/__fp__"
echo "  排版打印助手: https://voadge.top:668/api/__tp__"
