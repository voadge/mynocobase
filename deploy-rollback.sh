#!/bin/bash
# Rollback all changes
# Usage: bash deploy-rollback.sh

set -e

REMOTE="ubuntu@110.42.236.231"
KEY="C:\Users\tsong\.ssh\voadge.pem"
SSH="ssh -o StrictHostKeyChecking=no -i $KEY $REMOTE"

echo "=== ROLLBACK: Restoring all configurations ==="

# Step 1: Restore nginx.conf
echo ">>> Step 1: Restoring nginx.conf..."
$SSH 'sudo cp /opt/noco-base/nginx.conf.bak /opt/noco-base/nginx.conf 2>/dev/null || echo "No backup found"'

# Step 2: Restore app.env
echo ">>> Step 2: Restoring app.env..."
$SSH 'sudo cp /opt/noco-base/env/app.env.bak /opt/noco-base/env/app.env 2>/dev/null || echo "No backup found"'

# Step 3: Restore docker-compose.yml
echo ">>> Step 3: Restoring docker-compose.yml..."
$SSH 'sudo cp /opt/noco-base/docker-compose.yml.bak /opt/noco-base/docker-compose.yml 2>/dev/null || echo "No backup found"'

# Step 4: Reload nginx
echo ">>> Step 4: Reloading nginx..."
$SSH 'sudo docker exec noco-base-nginx-proxy-1 nginx -s reload 2>/dev/null || true'

# Step 5: Restart app
echo ">>> Step 5: Restarting app..."
$SSH 'sudo docker restart noco-base_app_1'

# Step 6: Restart PostgreSQL
echo ">>> Step 6: Restarting PostgreSQL..."
$SSH 'sudo docker restart 2b8e4a8928bc_noco-base-postgres-1'

# Step 7: Wait and check
echo ">>> Step 7: Waiting 20s for all services to start..."
sleep 20

echo ">>> Checking service status..."
$SSH 'sudo docker ps --format "table {{.Names}}\t{{.Status}}"'

echo "=== Rollback Complete ==="
