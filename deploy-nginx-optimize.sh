#!/bin/bash
# Deploy nginx optimization to remote server
# Usage: bash deploy-nginx-optimize.sh

set -e

REMOTE="ubuntu@110.42.236.231"
KEY="C:\Users\tsong\.ssh\voadge.pem"
SSH="ssh -o StrictHostKeyChecking=no -i $KEY $REMOTE"

echo "=== Phase 1: Nginx Optimization ==="

# Step 1: Backup on remote
echo ">>> Step 1: Backing up nginx.conf on remote..."
$SSH 'sudo cp /opt/noco-base/nginx.conf /opt/noco-base/nginx.conf.bak.$(date +%s)'

# Step 2: Copy new nginx.conf
echo ">>> Step 2: Copying optimized nginx.conf..."
scp -o StrictHostKeyChecking=no -i "$KEY" E:\my-project\nginx.conf "$REMOTE:/tmp/nginx.conf"
$SSH 'sudo cp /tmp/nginx.conf /opt/noco-base/nginx.conf'

# Step 3: Validate config
echo ">>> Step 3: Validating nginx config..."
$SSH 'sudo docker exec noco-base-nginx-proxy-1 nginx -t'

# Step 4: Reload nginx (hot reload, zero downtime)
echo ">>> Step 4: Reloading nginx..."
$SSH 'sudo docker exec noco-base-nginx-proxy-1 nginx -s reload'

echo "=== Phase 1 Complete: Nginx optimized ==="
echo "Changes applied:"
echo "  - gzip compression level 5 + more types"
echo "  - open_file_cache enabled"
echo "  - /admin/assets/ static resources cached 7d"
echo "  - Admin page cache 5s -> 30s"
