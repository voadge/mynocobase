#!/bin/bash
# Phase 2: Node.js memory optimization
# Usage: bash deploy-node-optimize.sh

set -e

REMOTE="ubuntu@110.42.236.231"
KEY="C:\Users\tsong\.ssh\voadge.pem"
SSH="ssh -o StrictHostKeyChecking=no -i $KEY $REMOTE"

echo "=== Phase 2: Node.js Memory Optimization ==="

# Step 1: Backup app.env on remote
echo ">>> Step 1: Backing up app.env on remote..."
$SSH 'sudo cp /opt/noco-base/env/app.env /opt/noco-base/env/app.env.bak'

# Step 2: Update NODE_OPTIONS
echo ">>> Step 2: Updating NODE_OPTIONS..."
$SSH "sudo sed -i 's/NODE_OPTIONS=--max-old-space-size=1024/NODE_OPTIONS=--max-old-space-size=1280/' /opt/noco-base/env/app.env"

# Step 3: Verify change
echo ">>> Step 3: Verifying change..."
$SSH 'grep NODE_OPTIONS /opt/noco-base/env/app.env'

# Step 4: Restart app container
echo ">>> Step 4: Restarting app container (brief interruption ~10s)..."
$SSH 'sudo docker restart noco-base_app_1'

# Step 5: Wait and check logs
echo ">>> Step 5: Waiting 15s for app to start..."
sleep 15
echo ">>> Checking app logs..."
$SSH 'sudo docker logs noco-base_app_1 --tail 20'

echo "=== Phase 2 Complete ==="
