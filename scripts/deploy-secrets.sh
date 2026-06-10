#!/bin/bash
# File: scripts/deploy-secrets.sh
# Deploy Docker Secrets configuration to server
# Run from project root: bash scripts/deploy-secrets.sh

set -e

SSH_KEY="E:\\voadge.pem"
SSH_USER="ubuntu"
SSH_HOST="110.42.236.231"
REMOTE_DIR="/opt/noco-base"

echo "=== Step 1: Create secrets directory on server ==="
ssh -i "$SSH_KEY" "$SSH_USER@$SSH_HOST" "mkdir -p $REMOTE_DIR/secrets"

echo "=== Step 2: Write initial secrets (current passwords for transition) ==="
ssh -i "$SSH_KEY" "$SSH_USER@$SSH_HOST" "cat > $REMOTE_DIR/secrets/app_key.txt << 'SEOF'
e7f1a9b3c4d5e6f7a8b9c0d1e2f3a4b5
SEOF"

ssh -i "$SSH_KEY" "$SSH_USER@$SSH_HOST" "cat > $REMOTE_DIR/secrets/db_password.txt << 'SEOF'
nocobase123
SEOF"

ssh -i "$SSH_KEY" "$SSH_USER@$SSH_HOST" "cat > $REMOTE_DIR/secrets/redis_password.txt << 'SEOF'
nocobase123
SEOF"

echo "=== Step 3: Update env files (remove plaintext secrets) ==="
ssh -i "$SSH_KEY" "$SSH_USER@$SSH_HOST" "cat > $REMOTE_DIR/env/app.env << 'SEOF'
APP_KEY=
DB_DIALECT=postgres
DB_HOST=postgres
DB_PORT=5432
DB_DATABASE=nocobase
DB_USER=nocobase
DB_PASSWORD=
REDIS_URL=redis://redis:6379/0
TZ=Asia/Shanghai
AMAP_KEY=31e73c1d12b2848e7bd964774782a954
FENCE_POLL_INTERVAL=30000
LOCATION_HISTORY_RETENTION_DAYS=30
SEOF"

ssh -i "$SSH_KEY" "$SSH_USER@$SSH_HOST" "cat > $REMOTE_DIR/env/postgres.env << 'SEOF'
POSTGRES_DB=nocobase
POSTGRES_USER=nocobase
POSTGRES_PASSWORD=
SEOF"

echo "=== Step 4: Upload entrypoint-wrapper.sh ==="
scp -i "$SSH_KEY" entrypoint-wrapper.sh "$SSH_USER@$SSH_HOST:$REMOTE_DIR/entrypoint-wrapper.sh"

echo "=== Step 5: Upload docker-compose.yml ==="
scp -i "$SSH_KEY" docker-compose.yml "$SSH_USER@$SSH_HOST:$REMOTE_DIR/docker-compose.yml"

echo "=== Step 6: Create post-migration .gitignore for secrets ==="
ssh -i "$SSH_KEY" "$SSH_USER@$SSH_HOST" "echo 'secrets/' >> $REMOTE_DIR/.gitignore 2>/dev/null; echo 'env/*.env' >> $REMOTE_DIR/.gitignore 2>/dev/null; sort -u $REMOTE_DIR/.gitignore -o $REMOTE_DIR/.gitignore"

echo ""
echo "=== Deployment complete ==="
echo "Run the following command to restart with Docker Secrets:"
echo "  ssh -i \"$SSH_KEY\" $SSH_USER@$SSH_HOST \"cd $REMOTE_DIR && docker compose up -d\""
echo ""
echo "=== After restart, verify services ==="
echo "  ssh -i \"$SSH_KEY\" $SSH_USER@$SSH_HOST \"cd $REMOTE_DIR && docker compose ps\""
echo ""
echo "=== To rotate passwords later ==="
echo "1. Update secrets/*.txt files locally and on server"
echo "2. Update PostgreSQL: docker compose exec postgres psql -U nocobase -c \"ALTER USER nocobase PASSWORD 'newpass'\""
echo "3. Update Redis: docker compose exec redis redis-cli -a oldpass CONFIG SET requirepass newpass"
echo "4. Restart: docker compose up -d"
