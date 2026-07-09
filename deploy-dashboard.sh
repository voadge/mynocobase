#!/bin/bash
# Deploy updated 10-dashboard.sh to server
# Usage: ./deploy-dashboard.sh
set -euo pipefail
SSH_KEY="${SSH_KEY:-~/.ssh/voadge.pem}"
REMOTE="ubuntu@110.42.236.231"
ssh -o StrictHostKeyChecking=no -i "$SSH_KEY" "$REMOTE" 'sudo tee /opt/noco-base/storage/scripts/10-dashboard.sh > /dev/null' < ./10-dashboard.sh
ssh -o StrictHostKeyChecking=no -i "$SSH_KEY" "$REMOTE" 'sudo chmod +x /opt/noco-base/storage/scripts/10-dashboard.sh'
ssh -o StrictHostKeyChecking=no -i "$SSH_KEY" "$REMOTE" 'sudo docker exec noco-base_app_1 /opt/noco-base/storage/scripts/10-dashboard.sh'
echo "Deployed and ran"