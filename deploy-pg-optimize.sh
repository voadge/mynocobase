#!/bin/bash
# Phase 3: PostgreSQL optimization
# Usage: bash deploy-pg-optimize.sh

set -e

REMOTE="ubuntu@110.42.236.231"
KEY="C:\Users\tsong\.ssh\voadge.pem"
SSH="ssh -o StrictHostKeyChecking=no -i $KEY $REMOTE"

echo "=== Phase 3: PostgreSQL Optimization ==="

# Step 1: Backup docker-compose.yml on remote
echo ">>> Step 1: Backing up docker-compose.yml on remote..."
$SSH 'sudo cp /opt/noco-base/docker-compose.yml /opt/noco-base/docker-compose.yml.bak'

# Step 2: Update PostgreSQL parameters
echo ">>> Step 2: Updating PostgreSQL parameters..."
$SSH "sudo sed -i 's/shared_buffers=64MB/shared_buffers=96MB/' /opt/noco-base/docker-compose.yml"
$SSH "sudo sed -i 's/effective_cache_size=256MB/effective_cache_size=384MB/' /opt/noco-base/docker-compose.yml"
$SSH "sudo sed -i 's/random_page_cost=1.1/random_page_cost=1.0/' /opt/noco-base/docker-compose.yml"

# Step 3: Verify changes
echo ">>> Step 3: Verifying changes..."
$SSH 'grep -E "shared_buffers|effective_cache_size|random_page_cost" /opt/noco-base/docker-compose.yml'

# Step 4: Restart PostgreSQL
echo ">>> Step 4: Restarting PostgreSQL (brief interruption ~5s)..."
$SSH 'sudo docker restart 2b8e4a8928bc_noco-base-postgres-1'

# Step 5: Wait and check logs
echo ">>> Step 5: Waiting 10s for PostgreSQL to start..."
sleep 10
echo ">>> Checking PostgreSQL logs..."
$SSH 'sudo docker logs 2b8e4a8928bc_noco-base-postgres-1 --tail 20'

echo "=== Phase 3 Complete ==="
