#!/bin/bash
# NocoBase PostgreSQL 自动备份脚本
BACKUP_DIR="/opt/noco-base/backups"
CONTAINER="noco-base-postgres-1"
DB_NAME="nocobase"
DB_USER="nocobase"
RETENTION_DAYS=30
REMOTE_BACKUP_PATH=""
MAX_BACKUP_SIZE_MB=500

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/backup_$TIMESTAMP.sql"
COMPRESSED_FILE="$BACKUP_FILE.gz"

echo "[$(date)] Starting backup..."

# 执行备份
if docker exec $CONTAINER pg_dump -U $DB_USER $DB_NAME > "$BACKUP_FILE"; then
    BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
    echo "[$(date)] Backup OK: $BACKUP_FILE ($BACKUP_SIZE)"

    # 压缩备份文件
    gzip -f "$BACKUP_FILE"
    echo "[$(date)] Compressed to: $COMPRESSED_FILE"

    # 验证备份完整性
    if gzip -t "$COMPRESSED_FILE"; then
        echo "[$(date)] Backup integrity check PASSED"
    else
        echo "[$(date)] ERROR: Backup integrity check FAILED"
        exit 2
    fi
else
    echo "[$(date)] Backup FAILED"
    exit 1
fi

# 删除旧备份
find "$BACKUP_DIR" -name "backup_*.sql.gz" -mtime +$RETENTION_DAYS -delete 2>/dev/null
find "$BACKUP_DIR" -name "backup_*.sql" -mtime +$RETENTION_DAYS -delete 2>/dev/null
echo "[$(date)] Cleaned backups older than $RETENTION_DAYS days"

# 备份文件大小检查
ACTUAL_SIZE=$(stat -c%s "$COMPRESSED_FILE" 2>/dev/null || stat -f%z "$COMPRESSED_FILE" 2>/dev/null)
if [ "$ACTUAL_SIZE" -gt "$((MAX_BACKUP_SIZE_MB * 1024 * 1024))" ]; then
    echo "[$(date)] WARNING: Backup file ($ACTUAL_SIZE bytes) exceeds $MAX_BACKUP_SIZE_MB MB threshold"
fi

echo "[$(date)] Backup completed successfully"
