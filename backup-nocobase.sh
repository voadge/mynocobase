#!/bin/bash
# Database backup script for NocoBase
set -e
BACKUP_DIR="/opt/noco-base/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DB_CONTAINER="noco-base-postgres-1"
DB_USER="nocobase"
DB_NAME="nocobase"
RETENTION_DAYS=30
mkdir -p "$BACKUP_DIR"
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting database backup..."
docker exec "$DB_CONTAINER" pg_dump -U "$DB_USER" "$DB_NAME" --no-owner --no-privileges | gzip > "${BACKUP_DIR}/nocobase_${TIMESTAMP}.sql.gz"
BACKUP_SIZE=$(ls -lh "${BACKUP_DIR}/nocobase_${TIMESTAMP}.sql.gz" | awk '{print $5}')
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Backup created: nocobase_${TIMESTAMP}.sql.gz (${BACKUP_SIZE})"
find "$BACKUP_DIR" -name "nocobase_*.sql.gz" -type f -mtime "+${RETENTION_DAYS}" -delete
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Backup complete. Older than ${RETENTION_DAYS} days cleaned up."
