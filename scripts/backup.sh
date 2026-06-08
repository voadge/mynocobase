#!/bin/bash
# backup.sh — 部署前全量备份
BACKUP_DIR="/opt/noco-base/backups/$(date +%Y%m%d_%H%M%S)_pre-people-dynamic"
mkdir -p "$BACKUP_DIR"

docker exec noco-base-app-1 pg_dump -U nocobase nocobase > "$BACKUP_DIR/db.sql"
cp -r /opt/noco-base/dashboard/ "$BACKUP_DIR/dashboard/"
cp -r /opt/noco-base/plugin-dashboard-home/ "$BACKUP_DIR/plugin-dashboard-home/"
cp /opt/noco-base/nginx.conf "$BACKUP_DIR/nginx.conf"

echo "备份完成: $BACKUP_DIR"
